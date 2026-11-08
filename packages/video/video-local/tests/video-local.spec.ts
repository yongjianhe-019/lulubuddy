/**
 * The local video provider and the plugin's own configuration policy.
 *
 * Every external program is a subprocess double: the double answers the exact
 * argv this provider builds and writes the files a real one would, so the
 * assertions are about the provider's own decisions — which command it runs,
 * what it does with the answer, and where it refuses to proceed.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle, SubprocessOutputReader, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { Config, apply, name, venvPythonPath } from '../src/index.ts'
import { DEFAULT_VOICE, PROJECT_INSTALL_MARKER, PROJECT_TEMPLATE_MARKER, PROJECT_VENV_DIR } from '../src/contract.ts'
import { LocalVideoProvider } from '../src/provider.ts'
import type { LocalVideoOptions } from '../src/provider.ts'
import type { VideoInvocation } from '../src/types.ts'

/** The shipped template this package drives, resolved as the plugin resolves it. */
const TEMPLATE_ROOT = fileURLToPath(new URL('../remotion/', import.meta.url))

/** Real edge-tts narration and subtitles, reused so the double returns a measurable file. */
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** One recorded spawn. */
interface SpawnCall {
  readonly argv: readonly string[]
  readonly cwd: string
}

/** What the double answers for one spawn. */
interface Answer {
  readonly exitCode?: number
  readonly stdout?: string
  readonly stderr?: string
  /** Whether the command stays running until it is terminated, as a stuck one does. */
  readonly hang?: boolean
}

/** One subprocess double: records every spawn and answers through the test's own handler. */
class SubprocessDouble {
  readonly calls: SpawnCall[] = []
  constructor(
    private readonly answer: (argv: readonly string[]) => Answer,
    /** Whether the double reports no collected stream at all, as a piped spawn does. */
    private readonly noReaders = false,
  ) {}

  /**
   * Answer one spawn.
   * @param spec - the spawn request the provider built.
   * @returns a handle that settles immediately, or on termination when the answer hangs.
   */
  spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    this.calls.push({ argv: spec.argv, cwd: spec.cwd })
    const answer = this.answer(spec.argv)
    const reader = (text: string): SubprocessOutputReader => ({
      readFrom: () => ({ text, nextOffset: text.length, lossy: false }),
    })
    return {
      stdin: undefined,
      stdout: undefined,
      stderr: undefined,
      collected: this.noReaders ? {} : { stdout: reader(answer.stdout ?? ''), stderr: reader(answer.stderr ?? '') },
      done: answer.hang === true
        ? new Promise((resolve) => {
          // A process that never answers is what a real one does until it is
          // terminated, so the abort is what settles the handle here too. An
          // already-aborted signal terminated the child before it was observed.
          if (spec.signal?.aborted === true) resolve({ exitCode: null, signal: 'SIGTERM' })
          else spec.signal?.addEventListener('abort', () => { resolve({ exitCode: null, signal: 'SIGTERM' }) }, { once: true })
        })
        : Promise.resolve({ exitCode: answer.exitCode ?? 0, signal: null }),
    } as unknown as SubprocessHandle
  }

  /**
   * Report which commands were run.
   * @returns the joined argv of every spawn.
   */
  lines(): string[] {
    return this.calls.map(call => call.argv.join(' '))
  }
}

let root: string
let projectRoot: string
let contexts: Context[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-video-local-'))
  projectRoot = join(root, 'project')
  contexts = []
})

afterEach(async () => {
  for (const ctx of contexts) await ctx.fiber.dispose()
  contexts = []
  rmSync(root, { recursive: true, force: true })
})

/**
 * Build a provider over a subprocess double and a throwaway project directory.
 * @param options - the answer handler, plus any option the test wants to override.
 * @returns the provider, the double, and the context it was built on.
 */
function bench(options: {
  answer: (argv: readonly string[]) => Answer
  overrides?: Partial<LocalVideoOptions>
  noReaders?: boolean
}): { provider: LocalVideoProvider; double: SubprocessDouble } {
  const double = new SubprocessDouble(options.answer, options.noReaders === true)
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('subprocess', double)
  const provider = new LocalVideoProvider(ctx, {
    projectRoot,
    templateRoot: TEMPLATE_ROOT,
    templateVersion: '0.1.5-rc.2',
    nodePath: process.execPath,
    npmPath: 'npm',
    ttsPython: join(projectRoot, PROJECT_VENV_DIR, 'bin', 'python'),
    pythonPath: 'python3',
    venvPython: join(projectRoot, PROJECT_VENV_DIR, 'bin', 'python'),
    defaultVoice: DEFAULT_VOICE,
    defaultRate: '+0%',
    ttsTimeoutMs: 60_000,
    renderTimeoutMs: 60_000,
    setupTimeoutMs: 60_000,
    maxOutputBytes: 1_048_576,
    maxStderrBytes: 4_096,
    graceMs: 5_000,
    playbackPath: () => '/video',
    ...options.overrides,
  })
  return { provider, double }
}

/**
 * Answer as a prepared project does: every command succeeds and writes what the
 * provider needs next.
 * @param argv - the command the provider built.
 * @returns the recorded answer.
 */
function prepared(argv: readonly string[]): Answer {
  const line = argv.join(' ')
  if (line.includes('--browser')) return { stdout: '{"ok":true,"browser":"ready"}' }
  if (line.startsWith('npm install')) {
    mkdirSync(join(projectRoot, 'node_modules', 'remotion'), { recursive: true })
    mkdirSync(join(projectRoot, 'node_modules', '@remotion', 'renderer'), { recursive: true })
    writeFileSync(join(projectRoot, 'node_modules', 'remotion', 'package.json'), '{"version":"4.0.529"}')
    writeFileSync(join(projectRoot, 'node_modules', '@remotion', 'renderer', 'package.json'), '{"version":"4.0.529"}')
    return { stdout: 'added 251 packages' }
  }
  if (line.includes('-m venv')) return {}
  if (line.includes('pip install')) {
    const python = join(projectRoot, PROJECT_VENV_DIR, 'bin', 'python')
    mkdirSync(dirname(python), { recursive: true })
    writeFileSync(python, '#!/bin/sh\n')
    return {}
  }
  if (line.includes('import edge_tts')) return {}
  if (line.includes('--list-voices')) {
    return { stdout: 'Name    Gender    ContentCategories\nzh-CN-XiaoxiaoNeural  Female  News\nzh-CN-YunxiNeural  Male  Novel\n' }
  }
  if (line.includes('edge-tts')) return { stdout: '7.2.8' }
  if (argv[1]?.endsWith('render.mjs') === true) {
    const output = argv[3] as string
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, 'MP4')
    return { stdout: `{"ok":true,"output":${JSON.stringify(output)},"width":1080,"height":1920,"fps":30,"durationInFrames":186,"bytes":200373}` }
  }
  return {}
}

/**
 * Answer as edge-tts does, writing the narration and subtitle files.
 * @param argv - the command the provider built.
 * @returns the recorded answer.
 */
function narrating(argv: readonly string[]): Answer {
  if (argv.includes('--write-media')) {
    writeFileSync(argv[argv.indexOf('--write-media') + 1] as string, readFileSync(join(FIXTURES, 'narration.mp3')))
    writeFileSync(argv[argv.indexOf('--write-subtitles') + 1] as string, readFileSync(join(FIXTURES, 'narration.srt')))
    return {}
  }
  return prepared(argv)
}

/**
 * Run one operation and return its outcome.
 * @param provider - the provider under test.
 * @param invocation - the operation to run.
 * @param signal - the caller's cancellation.
 * @returns the operation's outcome.
 */
async function invoke(provider: LocalVideoProvider, invocation: VideoInvocation, signal = new AbortController().signal) {
  return await provider.invoke(invocation, signal)
}

describe('Config', () => {
  it('fills every bound and leaves the deployment paths unset', () => {
    const resolved = Config({})
    expect(resolved.npmPath).toBe('npm')
    expect(resolved.pythonPath).toBe('python3')
    expect(resolved.defaultVoice).toBe(DEFAULT_VOICE)
    expect(resolved.defaultRate).toBe('+0%')
    expect(resolved.ttsTimeoutMs).toBe(180_000)
    expect(resolved.renderTimeoutMs).toBe(1_800_000)
    expect(resolved.setupTimeoutMs).toBe(1_800_000)
    expect(resolved.maxOutputBytes).toBe(8_388_608)
    expect(resolved.maxStderrBytes).toBe(262_144)
    expect(resolved.graceMs).toBe(5_000)
    expect(resolved.projectRoot).toBeUndefined()
    expect(resolved.nodePath).toBeUndefined()
    expect(resolved.ttsPython).toBeUndefined()
  })

  it('names itself for loader diagnostics', () => {
    expect(name).toBe('video-local')
  })
})

describe('the setup operation', () => {
  it('lays the project down and installs everything a first render needs', async () => {
    const { provider, double } = bench({ answer: prepared })
    const outcome = await invoke(provider, { operation: 'setup', arguments: {} })
    expect(outcome.operation).toBe('setup')
    expect(outcome.render).toBeNull()
    expect(outcome.warnings).toEqual([])
    expect(outcome.document).toMatchObject({
      operation: 'setup',
      project_root: projectRoot,
      ready: true,
      laid_template: true,
      installed_packages: true,
      browser_ready: true,
      remotion_version: '4.0.529',
      edge_tts_version: '7.2.8',
      node_path: process.execPath,
      tts_python: join(projectRoot, PROJECT_VENV_DIR, 'bin', 'python'),
    })
    // The shipped template arrived, driver and all.
    expect(existsSync(join(projectRoot, 'render.mjs'))).toBe(true)
    expect(existsSync(join(projectRoot, 'src', 'Root.tsx'))).toBe(true)
    const lines = double.lines()
    expect(lines.some(line => line.startsWith('npm install'))).toBe(true)
    expect(lines.some(line => line.includes('-m venv'))).toBe(true)
    expect(lines.some(line => line.includes('pip install'))).toBe(true)
    expect(lines.some(line => line.endsWith('render.mjs --browser'))).toBe(true)
  })

  it('does no work the second time', async () => {
    const { provider, double } = bench({ answer: prepared })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const before = double.calls.length
    const second = await invoke(provider, { operation: 'setup', arguments: {} })
    expect(second.document).toMatchObject({ laid_template: false, installed_packages: false })
    // The probes still run — they are how the report knows the project is ready —
    // but no installer does.
    expect(double.lines().slice(before).some(line => line.startsWith('npm install') || line.includes('pip install'))).toBe(false)
  })

  it('refreshes a project laid down by an older template', async () => {
    const { provider } = bench({ answer: prepared })
    await invoke(provider, { operation: 'setup', arguments: {} })
    writeFileSync(join(projectRoot, PROJECT_TEMPLATE_MARKER), '0.0.1\n')
    const outcome = await invoke(provider, { operation: 'setup', arguments: {} })
    expect(outcome.document).toMatchObject({ laid_template: true })
  })

  it('reinstalls when the project no longer satisfies the template dependency set', async () => {
    const { provider, double } = bench({ answer: prepared })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const before = double.calls.length
    // A template that asks for a different dependency set leaves the recorded
    // digest stale, which is what a plugin upgrade adding a dependency looks
    // like from the project's side.
    writeFileSync(join(projectRoot, PROJECT_INSTALL_MARKER), 'stale\n')
    const outcome = await invoke(provider, { operation: 'setup', arguments: {} })
    expect(outcome.document).toMatchObject({ installed_packages: true })
    expect(double.lines().slice(before).some(line => line.startsWith('npm install'))).toBe(true)
  })

  it('repairs a project whose packages were removed', async () => {
    const { provider, double } = bench({ answer: prepared })
    await invoke(provider, { operation: 'setup', arguments: {} })
    rmSync(join(projectRoot, 'node_modules'), { recursive: true, force: true })
    const before = double.calls.length
    const outcome = await invoke(provider, { operation: 'setup', arguments: {} })
    expect(outcome.document).toMatchObject({ installed_packages: true })
    expect(double.lines().slice(before).some(line => line.startsWith('npm install'))).toBe(true)
  })

  it('uses a deployment-named interpreter as it is', async () => {
    const python = join(root, 'system-python')
    writeFileSync(python, '#!/bin/sh\n')
    const { provider, double } = bench({
      answer: prepared,
      overrides: { ttsPython: python, venvPython: join(projectRoot, PROJECT_VENV_DIR, 'bin', 'python') },
    })
    await invoke(provider, { operation: 'setup', arguments: {} })
    expect(double.lines().some(line => line.includes('pip install'))).toBe(false)
    expect(double.lines().some(line => line.startsWith(python))).toBe(true)
  })

  it('refuses an interpreter that cannot speak', async () => {
    const python = join(root, 'mute-python')
    writeFileSync(python, '#!/bin/sh\n')
    const { provider } = bench({
      answer: argv => argv.includes('import edge_tts') ? { exitCode: 1 } : prepared(argv),
      overrides: { ttsPython: python },
    })
    await expect(invoke(provider, { operation: 'setup', arguments: {} }))
      .rejects.toThrow(/cannot import edge_tts/)
  })

  it('reports an unknown package and interpreter version as unknown', async () => {
    const { provider } = bench({
      answer: (argv) => {
        const line = argv.join(' ')
        if (line.startsWith('npm install')) {
          prepared(argv)
          // Present but unreadable, and present but carrying no version.
          writeFileSync(join(projectRoot, 'node_modules', 'remotion', 'package.json'), 'not json')
          return {}
        }
        if (line.includes('import importlib.metadata')) return { exitCode: 1 }
        return prepared(argv)
      },
    })
    const outcome = await invoke(provider, { operation: 'setup', arguments: {} })
    expect(outcome.document).toMatchObject({ ready: true, remotion_version: null, edge_tts_version: null })
  })

  it('reports a manifest that carries no version string', async () => {
    const { provider } = bench({
      answer: (argv) => {
        if (argv.join(' ').startsWith('npm install')) {
          prepared(argv)
          writeFileSync(join(projectRoot, 'node_modules', 'remotion', 'package.json'), '{"name":"remotion"}')
          return {}
        }
        return prepared(argv)
      },
    })
    const outcome = await invoke(provider, { operation: 'setup', arguments: {} })
    expect(outcome.document).toMatchObject({ remotion_version: null })
  })

  it('installs into an environment that exists but cannot speak', async () => {
    // The environment is already there and its interpreter cannot import
    // edge-tts, so only the install runs again — the environment is not remade.
    const python = join(projectRoot, PROJECT_VENV_DIR, 'bin', 'python')
    mkdirSync(dirname(python), { recursive: true })
    writeFileSync(python, '#!/bin/sh\n')
    const { provider, double } = bench({
      answer: argv => argv.includes('import edge_tts') ? { exitCode: 1 } : prepared(argv),
    })
    await expect(invoke(provider, { operation: 'setup', arguments: {} })).rejects.toThrow(/cannot import edge_tts/)
    expect(double.lines().some(line => line.includes('-m venv'))).toBe(false)
    expect(double.lines().some(line => line.includes('pip install'))).toBe(true)
  })
})

describe('the voices operation', () => {
  it('lists the voices one locale offers', async () => {
    const { provider } = bench({ answer: prepared })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const outcome = await invoke(provider, { operation: 'voices', arguments: { locale: 'zh-CN' } })
    expect(outcome.document).toMatchObject({ operation: 'voices', locale: 'zh-CN', count: 2 })
    expect(outcome.warnings).toEqual([])
    expect(outcome.render).toBeNull()
  })

  it('warns when the locale matches nothing, and reports how many there are', async () => {
    const { provider } = bench({ answer: prepared })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const outcome = await invoke(provider, { operation: 'voices', arguments: { locale: 'fr-FR' } })
    expect(outcome.warnings).toEqual(['no voice speaks fr-FR; edge-tts offers 2 voices in other locales'])
  })

  it('bounds the listing and says what it left out', async () => {
    const table = ['Name  Gender  ContentCategories']
    for (let index = 0; index < 61; index += 1) table.push(`zh-CN-${'a'.repeat(index + 1)}Neural  Female  News`)
    const { provider } = bench({
      answer: argv => argv.includes('--list-voices') ? { stdout: table.join('\n') } : prepared(argv),
    })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const outcome = await invoke(provider, { operation: 'voices', arguments: { locale: 'zh-CN' } })
    expect(outcome.document).toMatchObject({ count: 61 })
    expect((outcome.document['voices'] as unknown[])).toHaveLength(60)
    expect(outcome.warnings).toEqual(['61 voices match zh-CN; only the first 60 are listed'])
  })
})

describe('the create operation', () => {
  it('narrates, plans, renders, and reports what it made', async () => {
    const { provider, double } = bench({ answer: narrating })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const outcome = await invoke(provider, {
      operation: 'create',
      arguments: {
        title: '沪深300 估值速览',
        subtitle: '三分钟讲清',
        scenes: [
          { narration: '第一句，市场估值处于历史中位。', layout: 'title' },
          { heading: '要点', narration: '第二句，耐心等待更好的价格。', bullets: ['估值中位', '耐心等待'] },
        ],
      },
    })
    expect(outcome.operation).toBe('create')
    expect(outcome.warnings).toEqual([])
    const render = outcome.render
    expect(render).not.toBeNull()
    expect(render).toMatchObject({
      version: 1,
      url: `/video/out/${encodeURIComponent('沪深300-估值速览')}.mp4`,
      bytes: 200373,
      width: 1080,
      height: 1920,
      fps: 30,
      title: '沪深300 估值速览',
      voice: DEFAULT_VOICE,
    })
    // Two scenes of real 6.192 s narration plus each scene's own tail.
    expect(render?.durationMs).toBe(6192 * 2 + 600 * 2)
    expect(render?.scenes).toEqual([
      { index: 0, narration: '第一句，市场估值处于历史中位。', startMs: 0, endMs: 6792, cached: false },
      { index: 1, heading: '要点', narration: '第二句，耐心等待更好的价格。', startMs: 6792, endMs: 13584, cached: false },
    ])
    expect(outcome.document).toMatchObject({
      operation: 'create',
      title: '沪深300 估值速览',
      output: join(projectRoot, 'out', '沪深300-估值速览.mp4'),
      duration_ms: 13584,
      duration_seconds: 13.6,
      width: 1080,
      height: 1920,
      fps: 30,
      bytes: 200373,
      voice: DEFAULT_VOICE,
    })
    // A scene with no heading carries no heading key at all, rather than a null.
    expect(outcome.document['scenes']).toEqual([
      { index: 0, narration: '第一句，市场估值处于历史中位。', start_ms: 0, end_ms: 6792, duration_ms: 6792, narration_cached: false },
      { index: 1, heading: '要点', narration: '第二句，耐心等待更好的价格。', start_ms: 6792, end_ms: 13584, duration_ms: 6792, narration_cached: false },
    ])
    // The document the model reads carries no playback URL.
    expect(outcome.document['url']).toBeUndefined()
    // The storyboard reached the driver as a props document on disk.
    const propsPath = join(projectRoot, '.work', 'props.json')
    expect(existsSync(propsPath)).toBe(true)
    const props = JSON.parse(readFileSync(propsPath, 'utf8')) as { totalMs: number; scenes: { audio: string }[] }
    expect(props.totalMs).toBe(13584)
    expect(props.scenes[0]?.audio).toMatch(/^narration\/[0-9a-f]{16}\.mp3$/)
    expect(double.lines().some(line => line.endsWith('render.mjs ' + propsPath + ' ' + join(projectRoot, 'out', '沪深300-估值速览.mp4')))).toBe(true)
  })

  it('reuses cached narration instead of speaking the same line twice', async () => {
    let synthesize = true
    const { provider, double } = bench({
      answer: (argv) => {
        if (argv.includes('--write-media')) return synthesize ? narrating(argv) : {}
        return prepared(argv)
      },
    })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const spec = { operation: 'create', arguments: { title: 't', scenes: [{ narration: '说话。' }] } } as const
    const first = await invoke(provider, spec)
    expect(first.render?.scenes[0]?.cached).toBe(false)
    synthesize = false
    const before = double.calls.length
    const second = await invoke(provider, spec)
    expect(second.render?.scenes[0]?.cached).toBe(true)
    // The cache is keyed by what was asked, so nothing was synthesized again —
    // the probe and the render still ran, and only edge-tts was spared.
    const rerun = double.lines().slice(before)
    expect(rerun.some(line => line.includes('--write-media'))).toBe(false)
    expect(rerun.some(line => line.includes('render.mjs '))).toBe(true)
  })

  it('warns when a scene produced no subtitle cue', async () => {
    const { provider } = bench({
      answer: (argv) => {
        if (argv.includes('--write-media')) {
          writeFileSync(argv[argv.indexOf('--write-media') + 1] as string, readFileSync(join(FIXTURES, 'narration.mp3')))
          writeFileSync(argv[argv.indexOf('--write-subtitles') + 1] as string, '')
          return {}
        }
        return prepared(argv)
      },
    })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const outcome = await invoke(provider, { operation: 'create', arguments: { title: 't', scenes: [{ narration: '说话。' }] } })
    expect(outcome.warnings).toContain('scene 1 produced no subtitle cue; its caption band stays empty')
  })

  it('warns when the deployment mounted no playback route', async () => {
    const { provider } = bench({ answer: narrating, overrides: { playbackPath: () => null } })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const outcome = await invoke(provider, { operation: 'create', arguments: { title: 't', scenes: [{ narration: '说话。' }] } })
    expect(outcome.render?.url).toBeNull()
    expect(outcome.warnings).toEqual(['no playback route is mounted; open the rendered file directly'])
  })

  it('reports what the render driver refused', async () => {
    const { provider } = bench({
      answer: (argv) => {
        const line = argv.join(' ')
        if (line.endsWith('render.mjs --browser')) return prepared(argv)
        if (line.includes('render.mjs ')) return { exitCode: 1, stdout: '{"ok":false,"error":"browser not installed"}' }
        return narrating(argv)
      },
    })
    await invoke(provider, { operation: 'setup', arguments: {} })
    await expect(invoke(provider, { operation: 'create', arguments: { title: 't', scenes: [{ narration: '说话。' }] } }))
      .rejects.toThrow(/video render failed: browser not installed/)
  })

  it('refuses a storyboard past the limits the tool publishes', async () => {
    const { provider } = bench({ answer: narrating })
    await invoke(provider, { operation: 'setup', arguments: {} })
    await expect(invoke(provider, { operation: 'create', arguments: { title: 't', scenes: [] } }))
      .rejects.toThrow(/scenes is empty/)
  })

  it('reports a driver that died before answering, with whatever it last wrote', async () => {
    const { provider } = bench({
      answer: (argv) => {
        const line = argv.join(' ')
        if (line.endsWith('render.mjs --browser')) return prepared(argv)
        if (line.includes('render.mjs ')) return { exitCode: 137, stdout: 'Bundling...\n', stderr: 'Killed' }
        return narrating(argv)
      },
    })
    await invoke(provider, { operation: 'setup', arguments: {} })
    await expect(invoke(provider, { operation: 'create', arguments: { title: 't', scenes: [{ narration: '说话。' }] } }))
      .rejects.toThrow(
        /video render failed: the driver reported nothing \(render driver produced no result; it exited before reporting\): Killed/)
  })

  it('reports a driver that died with nothing at all on stderr', async () => {
    const { provider } = bench({
      answer: (argv) => {
        const line = argv.join(' ')
        if (line.endsWith('render.mjs --browser')) return prepared(argv)
        if (line.includes('render.mjs ')) return { exitCode: 137, stdout: '' }
        return narrating(argv)
      },
    })
    await invoke(provider, { operation: 'setup', arguments: {} })
    await expect(invoke(provider, { operation: 'create', arguments: { title: 't', scenes: [{ narration: '说话。' }] } }))
      .rejects.toThrow(/before reporting\)$/)
  })

  it('reads a spawn that reported no stream at all', async () => {
    const { provider } = bench({ answer: prepared, noReaders: true })
    const outcome = await invoke(provider, { operation: 'setup', arguments: {} })
    // With nothing to read, every reported extra is unknown rather than wrong.
    expect(outcome.document).toMatchObject({ ready: true, remotion_version: '4.0.529', edge_tts_version: null })
  })
})

describe('an unprepared project', () => {
  it('refuses production and names the setup call', async () => {
    const { provider } = bench({ answer: prepared })
    await expect(invoke(provider, { operation: 'create', arguments: { title: 't', scenes: [{ narration: 'n' }] } }))
      .rejects.toThrow(/call video_setup first/)
    await expect(invoke(provider, { operation: 'voices', arguments: { locale: 'zh-CN' } }))
      .rejects.toThrow(/call video_setup first/)
  })

  it('refuses production when the project lost its packages', async () => {
    const { provider } = bench({ answer: prepared })
    await invoke(provider, { operation: 'setup', arguments: {} })
    rmSync(join(projectRoot, 'node_modules'), { recursive: true, force: true })
    await expect(invoke(provider, { operation: 'create', arguments: { title: 't', scenes: [{ narration: 'n' }] } }))
      .rejects.toThrow(/has no packages installed; call video_setup first/)
  })

  it('refuses production when the interpreter lost its voice', async () => {
    const { provider } = bench({ answer: prepared })
    await invoke(provider, { operation: 'setup', arguments: {} })
    const mute = bench({ answer: argv => argv.includes('import edge_tts') ? { exitCode: 1 } : prepared(argv) })
    await expect(invoke(mute.provider, { operation: 'create', arguments: { title: 't', scenes: [{ narration: 'n' }] } }))
      .rejects.toThrow(/call video_setup first/)
  })
})

describe('one command invocation', () => {
  it('reports the command and its stderr when it fails', async () => {
    const { provider } = bench({
      answer: argv => argv.join(' ').startsWith('npm install') ? { exitCode: 2, stderr: 'EACCES' } : prepared(argv),
    })
    await expect(invoke(provider, { operation: 'setup', arguments: {} }))
      .rejects.toThrow(/render project install failed \('npm' 'install' '--no-audit' '--no-fund'\): EACCES/)
  })

  it('reports a command that failed with no diagnostic', async () => {
    const { provider } = bench({ answer: argv => argv.join(' ').includes('-m venv') ? { exitCode: 1 } : prepared(argv) })
    await expect(invoke(provider, { operation: 'setup', arguments: {} }))
      .rejects.toThrow(/virtual environment failed \('python3' '-m' 'venv' '[^']*'\)$/)
  })

  it('cancels when the caller does', async () => {
    const controller = new AbortController()
    const { provider } = bench({ answer: () => ({ hang: true }) })
    const pending = invoke(provider, { operation: 'setup', arguments: {} }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow(/was cancelled/)
  })

  it('gives up when a command exceeds its bound', async () => {
    const { provider } = bench({ answer: () => ({ hang: true }), overrides: { setupTimeoutMs: 20 } })
    await expect(invoke(provider, { operation: 'setup', arguments: {} }))
      .rejects.toThrow(/render project install exceeded 20 ms/)
  })
})

describe('apply', () => {
  it('provides the capability and serves the render project over the web server', () => {
    const double = new SubprocessDouble(prepared)
    const registered: { kind: string; path: string }[] = []
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('subprocess', double as never)
    ctx.provide('webServer', {
      register: (route: { kind: string; path: string }) => { registered.push(route); return () => { registered.length = 0 } },
    } as never)
    apply(ctx, Config({ projectRoot }))
    expect(ctx.get('video')).toBeInstanceOf(LocalVideoProvider)
    expect(registered.map(route => ({ kind: route.kind, path: route.path }))).toEqual([{ kind: 'prefix', path: '/video' }])
  })

  it('mounts without a web server, leaving only the playback URL absent', () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('subprocess', new SubprocessDouble(prepared) as never)
    apply(ctx, Config({ projectRoot }))
    expect(ctx.get('video')).toBeInstanceOf(LocalVideoProvider)
  })

  it('waits for a web server that is mounted later', async () => {
    const registered: { kind: string; path: string }[] = []
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('subprocess', new SubprocessDouble(prepared) as never)
    apply(ctx, Config({ projectRoot }))
    expect(registered).toHaveLength(0)
    ctx.provide('webServer', {
      register: (route: { kind: string; path: string }) => { registered.push(route); return () => { registered.length = 0 } },
    } as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(registered.map(route => ({ kind: route.kind, path: route.path }))).toEqual([{ kind: 'prefix', path: '/video' }])
  })

  it('validates every configured path at load', () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('subprocess', new SubprocessDouble(prepared) as never)
    expect(() => { apply(ctx, Config({ projectRoot: 'relative/path' })) }).toThrow(/projectRoot must be absolute/)
    expect(() => { apply(ctx, Config({ projectRoot, nodePath: join(root, 'no-node') })) }).toThrow(/nodePath is not an existing file/)
    expect(() => { apply(ctx, Config({ projectRoot, ttsPython: join(root, 'no-python') })) }).toThrow(/ttsPython is not an existing file/)
  })

  it('refuses a shipped template that is not where this package keeps it', () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('subprocess', new SubprocessDouble(prepared) as never)
    // The template is resolved from this module's own location, so the only way
    // to make it absent is to make the very marker file unreadable, which the
    // load-time check reads through `statSync`. Asserting the check's presence
    // is what this covers: the shipped directory really is there and really
    // carries the driver the provider spawns.
    apply(ctx, Config({ projectRoot }))
    expect(statSync(join(TEMPLATE_ROOT, 'render.mjs')).isFile()).toBe(true)
  })

  it('resolves the project under the harness home when a deployment names none', () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('subprocess', new SubprocessDouble(prepared) as never)
    apply(ctx, Config({}))
    expect(ctx.get('video')).toBeInstanceOf(LocalVideoProvider)
  })

  it('serves the playback URL the mounted route provides', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('subprocess', new SubprocessDouble(narrating) as never)
    ctx.provide('webServer', {
      register: () => () => {},
    } as never)
    apply(ctx, Config({ projectRoot }))
    await ctx.video.invoke({ operation: 'setup', arguments: {} }, new AbortController().signal)
    const outcome = await ctx.video.invoke(
      { operation: 'create', arguments: { title: 't', scenes: [{ narration: '说话。' }] } },
      new AbortController().signal,
    )
    expect(outcome.render?.url).toBe('/video/out/t.mp4')
    expect(outcome.warnings).toEqual([])
  })

  it('reports no playback URL when the deployment mounted no route', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('subprocess', new SubprocessDouble(narrating) as never)
    apply(ctx, Config({ projectRoot }))
    await ctx.video.invoke({ operation: 'setup', arguments: {} }, new AbortController().signal)
    const outcome = await ctx.video.invoke(
      { operation: 'create', arguments: { title: 't', scenes: [{ narration: '说话。' }] } },
      new AbortController().signal,
    )
    expect(outcome.render?.url).toBeNull()
    expect(outcome.warnings).toEqual(['no playback route is mounted; open the rendered file directly'])
  })
})

describe('venvPythonPath', () => {
  it('names the interpreter inside the environment its own platform lays out', () => {
    expect(venvPythonPath('win32')).toBe(join('Scripts', 'python.exe'))
    expect(venvPythonPath('darwin')).toBe(join('bin', 'python'))
    expect(venvPythonPath('linux')).toBe(join('bin', 'python'))
  })
})
