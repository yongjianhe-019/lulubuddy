// @vitest-environment jsdom
/**
 * The Xiaohongshu post card: payload narrowing, the copy package, the keyed
 * registration, and the card's visible sections.
 */

import { Context } from '@deepseek-ai/cordis'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { XhsPostView } from '../src/client/XhsPostView.tsx'
import { en, NS, zh } from '../src/client/locales.ts'
import { postFromBlock, publishCopy, type PostModel } from '../src/client/model.ts'
import { apply as applyHost } from '../src/index.ts'

const meta = {
  version: 1,
  number: 16,
  topic: 'HyperFrames',
  title: 'HyperFrames：HTML变视频',
  body: 'HyperFrames 是一个开源的视频渲染框架。\n\n它把页面稳定变成视频。',
  tags: ['#HyperFrames', '#AI视频', '#HTML'],
  pinnedComment: '动画不要用 Date.now 计时。',
  video: {
    url: '/xhs-assets/hyperframes.mp4',
    path: '/Users/hyj/Documents/素材图/hyperframes.mp4',
    durationMs: 78_900,
    width: 1080,
    height: 1920,
    fps: 30,
    bytes: 10_800_000,
  },
  checks: {
    detect: { passed: true, verdict: 'PASS', hits: 0 },
    scan: { passed: true, hard: 0, soft: 1 },
  },
  files: {
    draft: '/wiki/第16篇-成稿.md',
    publish: '/wiki/第16篇-发布版.txt',
    video: '/Users/hyj/Documents/素材图/hyperframes.mp4',
  },
  warnings: [],
  createdAt: '2026-10-20T10:00:00.000Z',
}

/** One settled tool block carrying the payload. */
function block(payload: unknown = meta): never {
  return {
    kind: 'tool-result',
    seq: 1,
    time: 0,
    callId: 'call-1',
    call: null,
    callTime: null,
    content: [{ type: 'text', text: 'packaged' }],
    isError: false,
    meta: payload,
  } as never
}

/** A bound translate function over the Chinese dictionary. */
function translate(key: string, params?: Record<string, string>): string {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? `{${name}}`)
}

describe('post payload', () => {
  it('narrows a packaged post', () => {
    const post = postFromBlock(block())
    expect(post).toMatchObject({ number: 16, title: 'HyperFrames：HTML变视频' })
    expect(post?.checks.scan.soft).toBe(1)
    expect(post?.video.url).toBe('/xhs-assets/hyperframes.mp4')
  })

  it('drops a payload with an unknown revision or a missing member', () => {
    expect(postFromBlock(block({ ...meta, version: 2 }))).toBeNull()
    expect(postFromBlock(block({ ...meta, tags: undefined }))).toBeNull()
    expect(postFromBlock(block({ ...meta, video: { ...meta.video, width: 0 } }))).toBeNull()
  })

  it('builds the package a user pastes into Xiaohongshu', () => {
    const post = postFromBlock(block()) as PostModel
    expect(publishCopy(post)).toContain('HyperFrames：HTML变视频')
    expect(publishCopy(post)).toContain('#HyperFrames #AI视频 #HTML')
    expect(publishCopy(post, true)).toContain('置顶评论：动画不要用 Date.now 计时。')
  })
})

describe('the card', () => {
  it('shows the video, copy, tags, pinned comment, and both gates', () => {
    const props = { block: block(), t: translate } as unknown as Parameters<typeof XhsPostView>[0]
    render(<XhsPostView {...props} />)
    expect(screen.getAllByText('HyperFrames：HTML变视频').length).toBeGreaterThan(0)
    expect(screen.getByText(/HyperFrames 是一个开源的视频渲染框架/)).toBeTruthy()
    expect(screen.getByText('#HyperFrames')).toBeTruthy()
    expect(screen.getByText('动画不要用 Date.now 计时。')).toBeTruthy()
    expect(screen.getByText('PASS · 0 处命中')).toBeTruthy()
    expect(screen.getByText('🔴0 · 🟡1')).toBeTruthy()
    expect(screen.getByText('生成完成，未自动发布。复制后到小红书手动发布。')).toBeTruthy()
  })

  it('falls back to raw text for an unknown payload', () => {
    const props = { block: block({ version: 2 }), t: translate } as unknown as Parameters<typeof XhsPostView>[0]
    render(<XhsPostView {...props} />)
    expect(screen.getByText('packaged')).toBeTruthy()
  })
})

describe('registration', () => {
  it('keeps both dictionary sides on the same keys and the xhs namespace', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(NS).toBe('xhs')
  })

  it('keeps the host Loader entry inert and declares its services', () => {
    expect(() => { applyHost() }).not.toThrow()
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the xhs_post card and removes it with the fiber', async () => {
    const ctx = new Context()
    const slots = new SlotRegistry(ctx)
    slots.register({
      name: 'root',
      children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
    } as never, () => null)
    const dictionaries: string[] = []
    ctx.provide('locale', {
      register(namespace: string) {
        dictionaries.push(namespace)
        return () => undefined
      },
    })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    onTestFinished(async () => { await fiber.dispose() })
    await fiber.await()
    const entries = slots.entries('tool.call.toolview')
    expect(entries.map(entry => entry.options.key)).toEqual(['xhs_post'])
    expect(entries[0]?.component).toBe(XhsPostView)
    expect(entries[0]?.locale).toBe(NS)
    expect(dictionaries).toEqual([NS])
    await fiber.dispose()
    expect(slots.entries('tool.call.toolview')).toHaveLength(0)
  })
})
