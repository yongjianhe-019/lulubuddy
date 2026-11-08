/**
 * Real end-to-end render against the deployment's own render project.
 *
 * The test boots the shipped package through the Loader and runs the real
 * driver: the configured node bundles the composition, the real edge-tts speaks
 * the narration, and Remotion encodes a video file. It self-skips without the
 * project root, so keyless CI and a machine that never set the project up stay
 * green.
 *
 * Environment:
 *   DSH_VIDEO_ROOT  the prepared render project directory
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as VideoLocal from '@deepseek-ai/dsh-video-local'
import * as VideoTools from '@deepseek-ai/dsh-video-local/tools'

const PROJECT_ROOT = process.env['DSH_VIDEO_ROOT']

const configured = PROJECT_ROOT !== undefined && PROJECT_ROOT.length > 0

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the shipped package through the real Loader against the configured project. */
async function boot(): Promise<Context> {
  root = mkdtempSync(join(tmpdir(), 'dsh-video-real-'))
  const configPath = join(root, 'cordis.yml')
  writeFileSync(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-subprocess-local'",
    "- name: '@deepseek-ai/dsh-video-local'",
    '  config:',
    `    projectRoot: '${String(PROJECT_ROOT)}'`,
    '    setupTimeoutMs: 1800000',
    '    renderTimeoutMs: 1800000',
    "- name: '@deepseek-ai/dsh-video-local/tools'",
    '  config:',
    '    timeoutMs: 3600000',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-subprocess-local', LocalSubprocessRuntime],
    ['@deepseek-ai/dsh-video-local', VideoLocal],
    ['@deepseek-ai/dsh-video-local/tools', VideoTools],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

/**
 * Execute one tool through the real registry.
 * @param ctx - the booted context.
 * @param name - the tool to call.
 * @param args - its arguments.
 * @returns the settled result.
 */
async function execute(ctx: Context, name: string, args: Record<string, unknown>) {
  return await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`real-${name}`),
    name,
    arguments: args,
  })
}

describe.skipIf(!configured)('video-local real render', () => {
  it('prepares the project, speaks a storyboard, and encodes a playable file', async () => {
    const ctx = await boot()
    const setup = await execute(ctx, 'video_setup', {})
    expect(setup.isError).toBe(false)

    const result = await execute(ctx, 'video_create', {
      title: '真机渲染验证',
      subtitle: '两句话的竖版短视频',
      slug: 'real-render-check',
      scenes: [
        { narration: '第一句，市场估值处于历史中位。', layout: 'title' },
        { heading: '两个要点', narration: '第二句，耐心等待更好的价格。', bullets: ['估值中位', '耐心等待'] },
      ],
    })
    expect(result.isError).toBe(false)

    const payload = result.meta as unknown as {
      version: number
      output: string
      url: string | null
      bytes: number
      width: number
      height: number
      fps: number
      durationMs: number
      scenes: { index: number; startMs: number; endMs: number; cached: boolean }[]
    }
    expect(payload.version).toBe(1)
    // The composition is the vertical one this preset produces.
    expect([payload.width, payload.height, payload.fps]).toEqual([1080, 1920, 30])
    expect(payload.scenes).toHaveLength(2)
    expect(payload.scenes[1]?.startMs).toBe(payload.scenes[0]?.endMs)
    expect(payload.durationMs).toBe(payload.scenes[1]?.endMs)

    // The file is a real MP4: the `ftyp` box is the format's own signature, and
    // the size is far past anything a truncated write would leave.
    expect(existsSync(payload.output)).toBe(true)
    const written = statSync(payload.output).size
    expect(written).toBe(payload.bytes)
    expect(written).toBeGreaterThan(20_000)
    const header = readFileSync(payload.output).subarray(0, 12)
    expect(header.subarray(4, 8).toString('ascii')).toBe('ftyp')

    // The model reads the timings it decided and the file's own path, never the
    // playback URL a browser needs.
    const text = result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
    expect(text).toContain(payload.output)
    expect(text).toContain(`"duration_ms": ${String(payload.durationMs)}`)
    expect(text).not.toContain('"url"')
    expect(text).not.toContain('"video"')
    // This composition mounts no web server, so the render reports the one thing
    // a viewer loses without it rather than pretending a URL exists.
    expect(payload.url).toBeNull()
    expect(text).toContain('no playback route is mounted')
  }, 1_800_000)
})
