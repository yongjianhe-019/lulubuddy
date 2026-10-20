/**
 * The Xiaohongshu publication contract: copy the operating brief rejects, the
 * two gate parsers, the manual's marker insertion, and one complete publication
 * against a fake subprocess provider.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { INDEX_MARKER, LIBRARY_MARKER, LOG_MARKER, RECENT_MARKER } from '../src/contract.ts'
import {
  normalizeTag, parseDetect, parseScan, publishPost, topicStem, updateManual, validatePost,
  type PublishOptions,
} from '../src/publish.ts'
import { parseRange, resolveWithin } from '../src/route.ts'
import type { XhsPublishRequest } from '../src/types.ts'

const roots: string[] = []

/** A temporary directory removed after the test. */
async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-xhs-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** A well-formed request that every validation test starts from. */
function request(overrides: Partial<XhsPublishRequest> = {}): XhsPublishRequest {
  return {
    number: 17,
    topic: 'Prompt缓存',
    title: 'Prompt缓存到底省在哪',
    body: '缓存省的是重复前缀的预填充。\n\n命中率低的时候，先看前缀有没有稳定下来。',
    tags: ['AI', '#大模型', 'Prompt'],
    pinnedComment: '先测命中率，再谈省钱。',
    videoPath: '/tmp/source.mp4',
    ...overrides,
  }
}

describe('validatePost', () => {
  it('accepts copy that follows the brief', () => {
    expect(() => { validatePost(request()) }).not.toThrow()
  })

  it('rejects the first person, quotation marks, and an over-long title', () => {
    expect(() => { validatePost(request({ body: '我试过一次。' })) }).toThrow(/first person/)
    expect(() => { validatePost(request({ body: '他说“可以”。' })) }).toThrow(/quotation/)
    expect(() => { validatePost(request({ title: '这是一个明显超过二十个字符限制的小红书标题' })) }).toThrow(/limit is 20/)
  })

  it('rejects too many tags and too many blank lines', () => {
    expect(() => { validatePost(request({ tags: ['a', 'b'] })) }).toThrow(/tags must carry/)
    expect(() => { validatePost(request({ body: '第一段\n\n\n第二段' })) }).toThrow(/blank line/)
  })
})

describe('gate parsing', () => {
  it('reads a passing de-AI report', () => {
    const parsed = parseDetect({ exitCode: 0, output: 'Total AI pattern hits: 0\nVerdict: PASS' })
    expect(parsed).toMatchObject({ passed: true, verdict: 'PASS', hits: 0 })
  })

  it('reads a failing scan report', () => {
    const parsed = parseScan({ exitCode: 1, output: '判定：🔴 2 处 · 🟡 1 处' })
    expect(parsed).toMatchObject({ passed: false, hard: 2, soft: 1 })
  })
})

describe('manual insertion', () => {
  it('inserts the index, recent bullet, log section, and library row', async () => {
    const root = await tempRoot()
    await mkdir(join(root, '素材库'), { recursive: true })
    await writeFile(join(root, '小红书运营.md'), [
      '| 文件 | 用途 |',
      '|---|---|',
      INDEX_MARKER,
      '',
      '## 最近进展',
      '',
      RECENT_MARKER,
      '',
      '*最后更新：2026-10-18*',
    ].join('\n'))
    await writeFile(join(root, '运营日志.md'), [
      '---',
      'updated: 2026-10-18',
      '---',
      '',
      LOG_MARKER,
    ].join('\n'))
    await writeFile(join(root, '素材库', 'README.md'), [
      '| 篇目 | 主题 | 成稿 |',
      '|---|---|---|',
      LIBRARY_MARKER,
    ].join('\n'))
    const checks = {
      detect: { passed: true, exitCode: 0, output: '', verdict: 'PASS', hits: 0, hard: 0, soft: 0 },
      scan: { passed: true, exitCode: 0, output: '', verdict: '', hits: 0, hard: 0, soft: 0 },
    }
    const video = { path: '/tmp/source.mp4', durationMs: 78_900, width: 1080, height: 1920, fps: 30, bytes: 1000 }
    await updateManual(root, request(), video, checks, new Date('2026-10-19T10:00:00'))
    const manual = await readFile(join(root, '小红书运营.md'), 'utf8')
    expect(manual).toContain('第17篇-Prompt缓存')
    expect(manual).toContain('2026-10-19：第 17 篇 Prompt缓存')
    expect(manual).toContain('*最后更新：2026-10-19*')
    expect(await readFile(join(root, '运营日志.md'), 'utf8')).toContain('第17篇·小红书')
    expect(await readFile(join(root, '运营日志.md'), 'utf8')).toContain('updated: 2026-10-19')
    expect(await readFile(join(root, '素材库', 'README.md'), 'utf8')).toContain('第 17 篇 | Prompt缓存')
  })
})

describe('topic stems and tags', () => {
  it('normalizes tags and keeps a readable stem', () => {
    expect(normalizeTag('##大模型')).toBe('#大模型')
    expect(topicStem('Prompt 缓存', 17)).toBe('Prompt-缓存')
    expect(topicStem('   ', 17)).toBe('post-17')
  })
})

describe('route helpers', () => {
  it('parses byte ranges and refuses traversal', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(resolveWithin('/srv/assets', '../secret')).toBeNull()
    expect(resolveWithin('/srv/assets', 'post.mp4')).toBe('/srv/assets/post.mp4')
  })
})

/** A fake subprocess provider: ffprobe returns measurements, the gates return scripted reports. */
function fakeContext(report: { detect: string; scan: string; scanExit?: number }): Context {
  return {
    subprocess: {
      resolveExecutable: async (name: string) => name,
      spawn: (spec: { argv: string[] }) => {
        const program = spec.argv[0]
        const output = program === 'ffprobe'
          ? JSON.stringify({
            streams: [{ width: 1080, height: 1920, r_frame_rate: '30/1' }],
            format: { duration: '78.9', size: '123456' },
          })
          : spec.argv[1]?.endsWith('detect.py')
            ? report.detect
            : report.scan
        return {
          done: Promise.resolve({
            exitCode: program === 'ffprobe' ? 0 : spec.argv[1]?.endsWith('detect.py') ? 0 : report.scanExit ?? 0,
            signal: null,
          }),
          collected: {
            stdout: { readFrom: () => ({ text: output, lossy: false }) },
            stderr: { readFrom: () => ({ text: '', lossy: false }) },
          },
        }
      },
    },
  } as unknown as Context
}

describe('publishPost', () => {
  async function fixture(): Promise<{ contentRoot: string; assetRoot: string; options: PublishOptions; video: string }> {
    const contentRoot = await tempRoot()
    const assetRoot = await tempRoot()
    await mkdir(join(contentRoot, '素材库'), { recursive: true })
    await writeFile(join(contentRoot, '小红书运营.md'), `${INDEX_MARKER}\n${RECENT_MARKER}\n`)
    await writeFile(join(contentRoot, '运营日志.md'), `${LOG_MARKER}\n`)
    await writeFile(join(contentRoot, '素材库', 'README.md'), `${LIBRARY_MARKER}\n`)
    const video = join(assetRoot, 'source.mp4')
    await writeFile(video, 'not a real video')
    await writeFile(join(contentRoot, 'detect.py'), '# fixture')
    await writeFile(join(contentRoot, '发布前扫描.py'), '# fixture')
    return {
      contentRoot,
      assetRoot,
      video,
      options: {
        contentRoot,
        assetRoot,
        routePrefix: '/xhs-assets',
        detectScript: join(contentRoot, 'detect.py'),
        scanScript: join(contentRoot, '发布前扫描.py'),
        checkTimeoutMs: 10_000,
        maxOutputBytes: 1_000_000,
        maxStderrBytes: 10_000,
        graceMs: 1_000,
        playbackPath: () => '/xhs-assets',
      },
    }
  }

  it('writes both files, copies the video, and returns the card payload', async () => {
    const { contentRoot, assetRoot, options, video } = await fixture()
    const result = await publishPost(
      fakeContext({ detect: 'Total AI pattern hits: 0\nVerdict: PASS', scan: '判定：🔴 0 处 · 🟡 1 处' }),
      options,
      request({ videoPath: video }),
      new AbortController().signal,
    )
    expect(result.video.url).toBe('/xhs-assets/Prompt%E7%BC%93%E5%AD%98.mp4')
    expect(result.video.width).toBe(1080)
    expect(result.checks.detect.passed).toBe(true)
    expect(result.checks.scan.soft).toBe(1)
    expect(await readFile(result.files.publish, 'utf8')).toContain('缓存省的是')
    expect(await readFile(result.files.draft, 'utf8')).toContain('第17篇成稿')
    expect(await readFile(join(assetRoot, 'Prompt缓存.mp4'), 'utf8')).toBe('not a real video')
    expect(await readFile(join(contentRoot, '小红书运营.md'), 'utf8')).toContain('第17篇-Prompt缓存')
    expect(result.files.video).toBe(join(assetRoot, 'Prompt缓存.mp4'))
  })

  it('writes no post files when a gate rejects the copy', async () => {
    const { contentRoot, options, video } = await fixture()
    await expect(publishPost(
      fakeContext({ detect: 'Total AI pattern hits: 0\nVerdict: PASS', scan: '判定：🔴 1 处 · 🟡 0 处', scanExit: 1 }),
      options,
      request({ videoPath: video }),
      new AbortController().signal,
    )).rejects.toThrow(/gates rejected/)
    await expect(readFile(join(contentRoot, '素材库', '第17篇-Prompt缓存', '第17篇-发布版.txt'))).rejects.toThrow()
  })
})
