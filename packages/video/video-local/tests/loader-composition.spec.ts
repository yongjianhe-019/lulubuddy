/**
 * Real Loader composition: a test-only cordis.yml mounts both entries of the
 * video package over the real tool registry and the real local subprocess
 * provider, and the only mocked boundaries are the three external programs (a
 * stub node, a stub package manager, and a stub edge-tts that writes the audio
 * a real one would).
 *
 * The assertion is the model-visible tool result, which is what a deployment's
 * 短视频 agent receives from a session composed on the video preset.
 */

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** Stub package manager: writes the manifests a prepared project carries. */
const STUB_NPM = `#!/bin/sh
mkdir -p "$PWD/node_modules/remotion" "$PWD/node_modules/@remotion/renderer"
printf '%s' '{"version":"4.0.529"}' > "$PWD/node_modules/remotion/package.json"
printf '%s' '{"version":"4.0.529"}' > "$PWD/node_modules/@remotion/renderer/package.json"
printf '%s\\n' 'added 251 packages'
`

/** Stub node: answers the render driver's two commands without rendering anything. */
const STUB_NODE = `#!/bin/sh
if [ "$2" = "--browser" ]; then
  printf '%s\\n' '{"ok":true,"browser":"ready"}'
  exit 0
fi
output="$3"
mkdir -p "$(dirname "$output")"
printf 'MP4' > "$output"
printf '%s\\n' "{\\"ok\\":true,\\"output\\":\\"$output\\",\\"width\\":1080,\\"height\\":1920,\\"fps\\":30,\\"durationInFrames\\":186,\\"bytes\\":3}"
`

/**
 * Stub edge-tts: answers the plugin's probes, creates the environment it asks
 * for, and writes the real narration and subtitle fixtures for a synthesis.
 * The fixture paths are baked in because a stub has no way to be told them.
 */
const STUB_PYTHON = `#!/bin/sh
media=""
subs=""
previous=""
for argument in "$@"; do
  case "$previous" in
    --write-media) media="$argument" ;;
    --write-subtitles) subs="$argument" ;;
  esac
  previous="$argument"
done
case "$*" in
  *"--list-voices"*) printf 'zh-CN-XiaoxiaoNeural  Female  News, Novel\\nzh-CN-YunxiNeural  Male  Novel\\n'; exit 0 ;;
  *"import edge_tts"*) exit 0 ;;
  *"importlib.metadata"*) printf '7.2.8'; exit 0 ;;
  *"pip install"*) exit 0 ;;
  *venv*) mkdir -p .venv/bin; printf '#!/bin/sh\\n' > .venv/bin/python; chmod +x .venv/bin/python; exit 0 ;;
esac
if [ -n "$media" ]; then
  mkdir -p "$(dirname "$media")"
  cp '${join(FIXTURES, 'narration.mp3')}' "$media"
  cp '${join(FIXTURES, 'narration.srt')}' "$subs"
fi
exit 0
`

let root: string | undefined
let projectRoot: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
  projectRoot = undefined
})

/**
 * Write one executable stub.
 * @param path - where to write it.
 * @param body - the script body.
 */
function stub(path: string, body: string): void {
  writeFileSync(path, body)
  chmodSync(path, 0o755)
}

/**
 * Build the throwaway deployment, the test-only cordis.yml, and boot the Loader.
 * @param overrides - a project root to use instead of a fresh one.
 * @returns the booted context.
 */
async function boot(overrides: { readonly projectRoot?: string } = {}): Promise<Context> {
  root = mkdtempSync(join(tmpdir(), 'dsh-video-loader-'))
  projectRoot = overrides.projectRoot ?? join(root, 'project')
  const npm = join(root, 'stub-npm')
  const node = join(root, 'stub-node')
  const python = join(root, 'stub-python')
  stub(npm, STUB_NPM)
  stub(node, STUB_NODE)
  stub(python, STUB_PYTHON)

  const configPath = join(root, 'cordis.yml')
  writeFileSync(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-subprocess-local'",
    "- name: '@deepseek-ai/dsh-video-local'",
    '  config:',
    `    projectRoot: '${projectRoot}'`,
    `    nodePath: '${node}'`,
    `    npmPath: '${npm}'`,
    `    ttsPython: '${python}'`,
    "- name: '@deepseek-ai/dsh-video-local/tools'",
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
    callId: ToolCallId(`loader-${name}`),
    name,
    arguments: args,
  })
}

/**
 * Execute one tool and return its model-facing text.
 * @param ctx - the booted context.
 * @param name - the tool to call.
 * @param args - its arguments.
 * @returns the joined text blocks.
 */
async function call(ctx: Context, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await execute(ctx, name, args)
  expect(result.isError).toBe(false)
  return result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
}

describe.skipIf(process.platform === 'win32')('video-local real Loader composition', () => {
  it('registers the three tools and prepares the project through them', async () => {
    const ctx = await boot()
    expect(ctx.get('video')).toBeDefined()
    expect(ctx.tools.schemas().map(schema => schema.name).sort())
      .toEqual(['video_create', 'video_setup', 'video_voices'])

    const text = await call(ctx, 'video_setup', {})
    expect(text).toContain('"ready": true')
    expect(text).toContain('"laid_template": true')
    expect(text).toContain('"installed_packages": true')
    expect(text).toContain('"remotion_version": "4.0.529"')
    expect(text).toContain('"edge_tts_version": "7.2.8"')
    expect(readFileSync(join(projectRoot as string, 'render.mjs'), 'utf8')).toContain('renderMedia')
    expect(readFileSync(join(projectRoot as string, 'src', 'Root.tsx'), 'utf8')).toContain('COMPOSITION_ID')
  }, 120_000)

  it('lists the voices a locale offers', async () => {
    const ctx = await boot()
    await call(ctx, 'video_setup', {})
    const text = await call(ctx, 'video_voices', { locale: 'zh-CN' })
    expect(text).toContain('"count": 2')
    expect(text).toContain('zh-CN-YunxiNeural')
  }, 120_000)

  it('produces a video and keeps its playback URL out of the model text', async () => {
    const ctx = await boot()
    await call(ctx, 'video_setup', {})
    const result = await execute(ctx, 'video_create', {
      title: '沪深300 估值速览',
      scenes: [
        { narration: '第一句，市场估值处于历史中位。', layout: 'title' },
        { heading: '要点', narration: '第二句，耐心等待更好的价格。', bullets: ['估值中位'] },
      ],
    })
    expect(result.isError).toBe(false)
    const text = result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
    // The model reads the file's own path and the per-scene timings it decided.
    expect(text).toContain(join(projectRoot as string, 'out', '沪深300-估值速览.mp4'))
    expect(text).toContain('"duration_ms": 13584')
    expect(text).toContain('"narration_cached": false')
    expect(text).not.toContain('/video/out/')
    expect(text).not.toContain('"video"')
    // The card reads the payload instead, which is the only place a URL belongs.
    expect(result.meta).toMatchObject({
      version: 1,
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 13584,
      title: '沪深300 估值速览',
      voice: 'zh-CN-XiaoxiaoNeural',
      scenes: [
        { index: 0, startMs: 0, endMs: 6792 },
        { index: 1, startMs: 6792, endMs: 13584 },
      ],
    })
    // The props document the driver received carries the same numbers.
    const props = JSON.parse(readFileSync(join(projectRoot as string, '.work', 'props.json'), 'utf8')) as {
      totalMs: number
      scenes: { durationMs: number; subtitles: unknown[] }[]
    }
    expect(props.totalMs).toBe(13584)
    expect(props.scenes[1]?.durationMs).toBe(6792)
    expect(props.scenes[0]?.subtitles).toHaveLength(2)
  }, 120_000)

  it('fails the Loader when the configured project root cannot be prepared', async () => {
    // A project root that is a regular file can be neither laid into nor read.
    const fileRoot = join(tmpdir(), `dsh-video-not-a-dir-${String(process.pid)}`)
    writeFileSync(fileRoot, '')
    try {
      const ctx = await boot({ projectRoot: fileRoot })
      const result = await execute(ctx, 'video_setup', {})
      expect(result.isError).toBe(true)
    } finally {
      rmSync(fileRoot, { force: true })
    }
  }, 120_000)
})
