/**
 * Local provider for the short-video production seam.
 *
 * Three external programs do the work and this provider is what orders them: the
 * configured node runs the render project's own driver, edge-tts speaks each
 * scene, and the project's package manager installs what a first run needs. Each
 * step is one short-lived process through `ctx.subprocess`, and every bound the
 * deployment configured is applied here.
 *
 * The project lives in one directory the deployment names rather than one per
 * session, because its `node_modules` is the toolchain a render needs and not
 * session data; rendered videos land in that directory's `out/`, which is also
 * what the playback route serves.
 *
 * @module @deepseek-ai/dsh-video-local/provider
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  PROJECT_AUDIO_DIR,
  PROJECT_CACHE_DIR,
  PROJECT_DRIVER,
  PROJECT_INSTALL_MARKER,
  PROJECT_MARKER,
  PROJECT_OUTPUT_DIR,
  PROJECT_PROPS_FILE,
  PROJECT_TEMPLATE_MARKER,
  PROJECT_VENV_DIR,
  PROJECT_WORK_DIR,
  VIDEO_PAYLOAD_VERSION,
} from './contract.ts'
import { driverSucceeded, readDriverResult } from './driver.ts'
import type { DriverResult } from './driver.ts'
import { clipCues, mp3DurationMs, narrationKey, parseSrt, parseVoiceList } from './narration.ts'
import { VideoRuntime } from './service.ts'
import { normalizeSpec, planVideo } from './storyboard.ts'
import type { NarrationAudio, NormalizedScene } from './storyboard.ts'
import type { VideoInvocation, VideoOutcome, VideoRender, VideoSceneResult, VideoSpec } from './types.ts'

/** Most voices one listing may return, so a wide locale cannot flood a request. */
export const MAX_LISTED_VOICES = 60

/** Name of the marker whose content is the template version last laid down. */
const TEMPLATE_MARKER = PROJECT_TEMPLATE_MARKER

/** Resolved deployment inputs for one provider instance. */
export interface LocalVideoOptions {
  /** Directory holding the render project, its caches, and its rendered videos. */
  readonly projectRoot: string
  /** Shipped render project template this provider lays down. */
  readonly templateRoot: string
  /** Version stamped into the project, so an upgraded template is re-laid. */
  readonly templateVersion: string
  /** Node executable that runs the render driver. */
  readonly nodePath: string
  /** Package-manager executable the project installs with. */
  readonly npmPath: string
  /** Interpreter that runs edge-tts; the project's own when the deployment named none. */
  readonly ttsPython: string
  /** Interpreter the project's own virtual environment is created from. */
  readonly pythonPath: string
  /** Interpreter inside the project's virtual environment. */
  readonly venvPython: string
  /** Voice the create operation uses when a storyboard names none. */
  readonly defaultVoice: string
  /** Rate the create operation uses when a storyboard names none. */
  readonly defaultRate: string
  /** Wall-clock bound for one narration synthesis, in milliseconds. */
  readonly ttsTimeoutMs: number
  /** Wall-clock bound for one render, in milliseconds. */
  readonly renderTimeoutMs: number
  /** Wall-clock bound for one setup step, in milliseconds. */
  readonly setupTimeoutMs: number
  /** In-memory cap on one command's captured stdout, in bytes. */
  readonly maxOutputBytes: number
  /** In-memory cap on captured stderr, used only for failure diagnostics. */
  readonly maxStderrBytes: number
  /** Grace period the subprocess provider may use for termination and drain. */
  readonly graceMs: number
  /** Browser path prefix the playback route serves under, or null when none is mounted. */
  readonly playbackPath: () => string | null
}

/** One finished process, as the provider reads it. */
interface ExecResult {
  /** Whether the command reported success. */
  readonly ok: boolean
  readonly stdout: string
  /** Captured stderr, trimmed; used only in failure diagnostics. */
  readonly stderr: string
}

/** One setup step's answer, so the document can report what a setup actually did. */
interface SetupReport {
  /** Whether the render project's files were laid down or refreshed. */
  readonly laid: boolean
  /** Whether the project's packages were installed. */
  readonly packages: boolean
  /** Whether the browser a render needs is ready, which installing it is what achieves. */
  readonly browserReady: boolean
}

/**
 * Join one command line for a diagnostic message.
 * @param argv - the command and its arguments.
 * @returns the joined line, with each argument quoted.
 */
function commandLine(argv: readonly string[]): string {
  return argv.map(argument => `'${argument}'`).join(' ')
}

/**
 * Run the short-video production project through its own driver and edge-tts.
 *
 * Each invocation is a sequence of short-lived processes: narration is
 * synthesized once per distinct line, the storyboard is planned from the audio
 * that came back, and one node process bundles and encodes the video.
 */
export class LocalVideoProvider extends VideoRuntime {
  private readonly options: LocalVideoOptions

  constructor(ctx: Context, options: LocalVideoOptions) {
    super(ctx)
    this.options = options
  }

  /**
   * Run one production operation.
   * @param invocation - the operation and that operation's arguments.
   * @param signal - cancels the invocation and terminates its processes.
   * @returns the operation's document plus non-fatal production facts.
   */
  override async invoke(invocation: VideoInvocation, signal: AbortSignal): Promise<VideoOutcome> {
    switch (invocation.operation) {
      case 'setup': return await this.setup(signal)
      case 'voices': return await this.voices(invocation.arguments.locale, signal)
      case 'create': return await this.create(invocation.arguments, signal)
    }
  }

  /**
   * Run one command in the render project and collect its output.
   * @param argv - the command and its arguments.
   * @param options - the invocation's label, bound, and whether a non-zero exit is tolerated.
   * @returns the command's exit status and captured output.
   * @throws when the command fails and failure is not tolerated, when it exceeds its bound, or when the caller cancels.
   */
  private async exec(
    argv: readonly string[],
    options: { readonly signal: AbortSignal; readonly timeoutMs: number; readonly label: string; readonly tolerate?: boolean },
  ): Promise<ExecResult> {
    const timeout = new AbortController()
    const timer = setTimeout(() => { timeout.abort() }, options.timeoutMs)
    try {
      const handle = this.ctx.subprocess.spawn({
        argv: [...argv],
        cwd: this.options.projectRoot,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: this.options.maxOutputBytes },
          stderr: { maxBytes: this.options.maxStderrBytes },
        },
        graceMs: this.options.graceMs,
        signal: AbortSignal.any([options.signal, timeout.signal]),
      })
      const outcome = await handle.done
      const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
      const stderr = (handle.collected.stderr?.readFrom(0).text ?? '').trim()
      if (options.signal.aborted) throw new Error(`video ${options.label} was cancelled`)
      if (timeout.signal.aborted) throw new Error(`video ${options.label} exceeded ${String(options.timeoutMs)} ms`)
      const ok = outcome.exitCode === 0 && outcome.signal === null
      if (ok || options.tolerate === true) return { ok, stdout, stderr }
      const detail = stderr.length > 0 ? `: ${stderr}` : ''
      throw new Error(`video ${options.label} failed (${commandLine(argv)})${detail}`)
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Lay the shipped template into the project when it is absent or stale.
   *
   * The marker is what makes this idempotent, and it is also what makes a
   * plugin upgrade refresh a project whose template predates it. Every entry is
   * copied: the template carries only sources and manifests, while everything a
   * render accumulates — packages, narration, output — lives in directories the
   * template has no entry for.
   * @returns whether anything was written.
   */
  private async layTemplate(): Promise<boolean> {
    const marker = join(this.options.projectRoot, TEMPLATE_MARKER)
    let recorded: string | null = null
    try {
      recorded = (await readFile(marker, 'utf8')).trim()
    } catch {
      // A missing marker is the state a never-set-up project is in; nothing else
      // can fail here, because reading one small file has no other outcome.
      recorded = null
    }
    const present = existsSync(join(this.options.projectRoot, PROJECT_MARKER))
    if (present && recorded === this.options.templateVersion) return false
    await mkdir(this.options.projectRoot, { recursive: true })
    for (const entry of await readdir(this.options.templateRoot)) {
      await cp(join(this.options.templateRoot, entry), join(this.options.projectRoot, entry), { recursive: true, force: true })
    }
    await writeFile(marker, `${this.options.templateVersion}\n`)
    return true
  }

  /**
   * Whether the project already carries the packages a render needs.
   * @returns whether both render-side packages resolve from the project.
   */
  private hasPackages(): boolean {
    return existsSync(join(this.options.projectRoot, 'node_modules', 'remotion', 'package.json'))
      && existsSync(join(this.options.projectRoot, 'node_modules', '@remotion', 'renderer', 'package.json'))
  }

  /**
   * Digest of the dependency set the shipped template declares.
   *
   * Both dependency sections are covered and the entries are sorted, so the
   * digest answers "is this the set the template now asks for" rather than
   * "does a package directory happen to exist" or "were the keys written in this
   * order".
   * @returns the digest the install marker records.
   * @throws when the template's manifest is unreadable, which means the installation is broken.
   */
  private async dependencyDigest(): Promise<string> {
    const manifest: unknown = JSON.parse(await readFile(join(this.options.templateRoot, 'package.json'), 'utf8'))
    const record = manifest as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const declared = Object.entries({ ...record.dependencies, ...record.devDependencies })
      .sort(([left], [right]) => left.localeCompare(right))
    return createHash('sha256').update(JSON.stringify(declared)).digest('hex').slice(0, 16)
  }

  /**
   * Read the dependency digest the project's last install satisfied.
   * @returns the recorded digest, or null when nothing has been installed.
   */
  private async recordedInstall(): Promise<string | null> {
    try {
      return (await readFile(join(this.options.projectRoot, PROJECT_INSTALL_MARKER), 'utf8')).trim()
    } catch {
      // A missing marker is the state a never-installed project is in; reading
      // one small file has no other outcome.
      return null
    }
  }

  /**
   * Whether an interpreter can import edge-tts.
   * @param python - the interpreter to probe.
   * @param signal - cancels the probe.
   * @returns whether the import succeeded.
   */
  private async hasVoice(python: string, signal: AbortSignal): Promise<boolean> {
    if (!existsSync(python)) return false
    const result = await this.exec([python, '-c', 'import edge_tts'], {
      signal,
      timeoutMs: this.options.ttsTimeoutMs,
      label: 'voice probe',
      tolerate: true,
    })
    return result.ok
  }

  /**
   * Create the project's virtual environment and install edge-tts into it.
   *
   * A deployment that named its own interpreter has nothing to install: this
   * step then only reports whether that interpreter can speak at all. The answer
   * is always a fresh probe, never an assumption that an install worked.
   * @param signal - cancels the install.
   * @returns whether an interpreter with edge-tts is ready.
   */
  private async installVoice(signal: AbortSignal): Promise<boolean> {
    const owns = this.options.ttsPython === this.options.venvPython
    if (!owns) return await this.hasVoice(this.options.ttsPython, signal)
    if (await this.hasVoice(this.options.venvPython, signal)) return true
    const venvDir = join(this.options.projectRoot, PROJECT_VENV_DIR)
    if (!existsSync(this.options.venvPython)) {
      await this.exec([this.options.pythonPath, '-m', 'venv', venvDir], {
        signal,
        timeoutMs: this.options.setupTimeoutMs,
        label: 'virtual environment',
      })
    }
    await this.exec([this.options.venvPython, '-m', 'pip', 'install', '--disable-pip-version-check', 'edge-tts'], {
      signal,
      timeoutMs: this.options.setupTimeoutMs,
      label: 'narration voice install',
    })
    return await this.hasVoice(this.options.venvPython, signal)
  }

  /**
   * Materialize and prepare the render project, idempotently.
   * @param signal - cancels the work.
   * @returns what this call changed.
   * @throws when a step fails or the prepared project cannot speak.
   */
  /**
   * Materialize and prepare the render project, idempotently.
   *
   * The install runs when the project does not satisfy the template's current
   * dependency set, or when its packages are absent — so a template upgrade that
   * adds a dependency reconciles, and a project whose `node_modules` was removed
   * is repaired rather than left as a dead end.
   * @param signal - cancels the work.
   * @returns what this call changed.
   * @throws when a step fails or the prepared project cannot speak.
   */
  private async prepare(signal: AbortSignal): Promise<SetupReport> {
    const laid = await this.layTemplate()
    const digest = await this.dependencyDigest()
    let packages = false
    if (await this.recordedInstall() !== digest || !this.hasPackages()) {
      await this.exec([this.options.npmPath, 'install', '--no-audit', '--no-fund'], {
        signal,
        timeoutMs: this.options.setupTimeoutMs,
        label: 'render project install',
      })
      await writeFile(join(this.options.projectRoot, PROJECT_INSTALL_MARKER), `${digest}\n`)
      packages = true
    }
    const voice = await this.installVoice(signal)
    if (!voice) throw new Error(`video: ${this.options.ttsPython} cannot import edge_tts`)
    const browserReady = await this.installBrowser(signal)
    return { laid, packages, browserReady }
  }

  /**
   * Install the browser a render needs, which is a no-op once it is cached.
   * @param signal - cancels the download.
   * @returns whether the browser is ready.
   */
  private async installBrowser(signal: AbortSignal): Promise<boolean> {
    const result = await this.exec(
      [this.options.nodePath, join(this.options.projectRoot, PROJECT_DRIVER), '--browser'],
      { signal, timeoutMs: this.options.setupTimeoutMs, label: 'browser install' },
    )
    return driverSucceeded(result.stdout)
  }

  /**
   * Read one installed package's version.
   * @param relative - path of the package's manifest inside the project.
   * @returns the version, or null when the manifest is absent or unreadable.
   */
  private async installedVersion(relative: string): Promise<string | null> {
    try {
      const manifest: unknown = JSON.parse(await readFile(join(this.options.projectRoot, relative), 'utf8'))
      const version = (manifest as { version?: unknown }).version
      return typeof version === 'string' ? version : null
    } catch {
      // An absent or unreadable manifest is reported as an unknown version; the
      // setup document is a report, and a missing version must not fail a
      // finished install.
      return null
    }
  }

  /**
   * Read the version of the installed edge-tts.
   * @param signal - cancels the probe.
   * @returns the version, or null when the interpreter does not report one.
   */
  private async voiceVersion(signal: AbortSignal): Promise<string | null> {
    const result = await this.exec(
      [this.options.ttsPython, '-c', 'import importlib.metadata as m; print(m.version("edge-tts"))'],
      { signal, timeoutMs: this.options.ttsTimeoutMs, label: 'voice version', tolerate: true },
    )
    const version = result.stdout.trim()
    return result.ok && version.length > 0 ? version : null
  }

  /**
   * Run the setup operation.
   * @param signal - cancels the work.
   * @returns the project's location and what it now carries.
   */
  private async setup(signal: AbortSignal): Promise<VideoOutcome> {
    const report = await this.prepare(signal)
    const remotion = await this.installedVersion(join('node_modules', 'remotion', 'package.json'))
    const edgeTts = await this.voiceVersion(signal)
    return {
      operation: 'setup',
      document: {
        operation: 'setup',
        project_root: this.options.projectRoot,
        // `prepare` threw unless all four hold, so a returned document is a ready project.
        ready: true,
        laid_template: report.laid,
        installed_packages: report.packages,
        browser_ready: report.browserReady,
        remotion_version: remotion,
        edge_tts_version: edgeTts,
        node_path: this.options.nodePath,
        tts_python: this.options.ttsPython,
      } as unknown as Record<string, JsonValue>,
      warnings: [],
      render: null,
    }
  }

  /**
   * Run the voices operation.
   * @param locale - the locale to list, such as `zh-CN`.
   * @param signal - cancels the listing.
   * @returns the voices edge-tts offers for that locale.
   */
  private async voices(locale: string, signal: AbortSignal): Promise<VideoOutcome> {
    await this.assertReady(signal)
    const result = await this.exec([this.options.ttsPython, '-m', 'edge_tts', '--list-voices'], {
      signal,
      timeoutMs: this.options.ttsTimeoutMs,
      label: 'voice listing',
    })
    const all = parseVoiceList(result.stdout)
    const matching = all.filter(voice => voice.locale.toLowerCase() === locale.trim().toLowerCase())
    const listed = matching.slice(0, MAX_LISTED_VOICES)
    const warnings: string[] = []
    if (matching.length > listed.length) {
      warnings.push(`${String(matching.length)} voices match ${locale}; only the first ${String(MAX_LISTED_VOICES)} are listed`)
    }
    if (matching.length === 0) {
      warnings.push(`no voice speaks ${locale}; edge-tts offers ${String(all.length)} voices in other locales`)
    }
    return {
      operation: 'voices',
      document: {
        operation: 'voices',
        locale,
        count: matching.length,
        voices: listed.map(voice => ({ ...voice })),
      } as unknown as Record<string, JsonValue>,
      warnings,
      render: null,
    }
  }

  /**
   * Refuse a production call on a project that is not ready.
   * @param signal - cancels the probe.
   * @throws when the project is missing, stale, or cannot speak.
   */
  private async assertReady(signal: AbortSignal): Promise<void> {
    if (!existsSync(join(this.options.projectRoot, PROJECT_MARKER))) {
      throw new Error(`video: no render project at ${this.options.projectRoot}; call video_setup first`)
    }
    if (!this.hasPackages()) {
      throw new Error(`video: the render project at ${this.options.projectRoot} has no packages installed; call video_setup first`)
    }
    if (!await this.hasVoice(this.options.ttsPython, signal)) {
      throw new Error(`video: ${this.options.ttsPython} cannot import edge_tts; call video_setup first`)
    }
  }

  /**
   * Ensure one scene's narration audio and cues exist, synthesizing them when the cache misses.
   * @param scene - the normalized scene.
   * @param voice - the voice that speaks every scene.
   * @param rate - the rate adjustment.
   * @param signal - cancels the synthesis.
   * @returns the scene's audio path, measured length, cues, and whether the cache was reused.
   */
  private async narrate(
    scene: NormalizedScene,
    voice: string,
    rate: string,
    signal: AbortSignal,
  ): Promise<NarrationAudio> {
    const key = narrationKey({ text: scene.narration, voice, rate })
    const media = join(this.options.projectRoot, PROJECT_CACHE_DIR, `${key}.mp3`)
    const subtitles = join(this.options.projectRoot, PROJECT_CACHE_DIR, `${key}.srt`)
    const cached = existsSync(media) && existsSync(subtitles)
    if (!cached) {
      await mkdir(dirname(media), { recursive: true })
      await this.exec([
        this.options.ttsPython, '-m', 'edge_tts',
        '--voice', voice,
        '--rate', rate,
        '--text', scene.narration,
        '--write-media', media,
        '--write-subtitles', subtitles,
      ], { signal, timeoutMs: this.options.ttsTimeoutMs, label: 'narration' })
    }
    const cues = clipCues(parseSrt(await readFile(subtitles, 'utf8')))
    return {
      audioSrc: `${PROJECT_AUDIO_DIR}/${key}.mp3`,
      durationMs: mp3DurationMs(await readFile(media)),
      cues,
      cached,
    }
  }

  /**
   * Run the create operation.
   * @param spec - the storyboard the caller sent.
   * @param signal - cancels the production.
   * @returns the render's document and its card payload.
   */
  private async create(spec: VideoSpec, signal: AbortSignal): Promise<VideoOutcome> {
    await this.assertReady(signal)
    const normalized = normalizeSpec(spec, { voice: this.options.defaultVoice, rate: this.options.defaultRate })
    const warnings: string[] = []
    const narrations: NarrationAudio[] = []
    for (let index = 0; index < normalized.scenes.length; index += 1) {
      const audio = await this.narrate(normalized.scenes[index] as NormalizedScene, normalized.voice, normalized.rate, signal)
      if (audio.cues.length === 0) {
        warnings.push(`scene ${String(index + 1)} produced no subtitle cue; its caption band stays empty`)
      }
      narrations.push(audio)
    }
    const plan = planVideo(normalized, narrations)
    const propsPath = join(this.options.projectRoot, PROJECT_WORK_DIR, PROJECT_PROPS_FILE)
    await mkdir(dirname(propsPath), { recursive: true })
    await writeFile(propsPath, `${JSON.stringify(plan.props, null, 2)}\n`)
    const fileName = `${normalized.slug}.mp4`
    const outputPath = join(this.options.projectRoot, PROJECT_OUTPUT_DIR, fileName)
    await mkdir(dirname(outputPath), { recursive: true })
    // The driver reports its own failures as JSON on stdout and exits non-zero,
    // so the exit status is tolerated here and the message is what decides.
    const driver = await this.exec(
      [this.options.nodePath, join(this.options.projectRoot, PROJECT_DRIVER), propsPath, outputPath],
      { signal, timeoutMs: this.options.renderTimeoutMs, label: 'render', tolerate: true },
    )
    const result = readRenderResult(driver)
    if (!result.ok) throw new Error(`video render failed: ${result.error}`)
    const playback = this.options.playbackPath()
    if (playback === null) warnings.push('no playback route is mounted; open the rendered file directly')
    const render: VideoRender = {
      version: VIDEO_PAYLOAD_VERSION,
      output: result.output,
      url: playback === null ? null : `${playback}/${PROJECT_OUTPUT_DIR}/${encodeURIComponent(fileName)}`,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      fps: result.fps,
      durationMs: plan.durationMs,
      title: normalized.title,
      voice: normalized.voice,
      scenes: plan.scenes,
    }
    return {
      operation: 'create',
      document: createDocument(render) as unknown as Record<string, JsonValue>,
      warnings,
      render,
    }
  }
}

/** One scene's entry in the model-facing create document. */
interface SceneDocument {
  readonly index: number
  readonly heading?: string
  readonly narration: string
  readonly start_ms: number
  readonly end_ms: number
  readonly duration_ms: number
  readonly narration_cached: boolean
}

/** The model-facing create document. */
interface CreateDocument {
  readonly operation: 'create'
  readonly title: string
  readonly output: string
  readonly duration_ms: number
  readonly duration_seconds: number
  readonly width: number
  readonly height: number
  readonly fps: number
  readonly bytes: number
  readonly voice: string
  readonly scenes: readonly SceneDocument[]
}

/**
 * Read the render driver's answer, folding a driver that died before reporting
 * into a failure that carries whatever it last wrote.
 *
 * A driver that reports its own failure does so in the answer, so reaching the
 * fallback means the process itself was lost; the stderr is then the only
 * evidence of why.
 * @param driver - the finished render process.
 * @returns the driver's answer, or a failure naming what it left behind.
 */
function readRenderResult(driver: ExecResult): DriverResult {
  try {
    return readDriverResult(driver.stdout)
  } catch (error) {
    const detail = driver.stderr.length > 0 ? `: ${driver.stderr}` : ''
    return { ok: false, error: `the driver reported nothing (${(error as Error).message})${detail}` }
  }
}

/**
 * Project one render into the document the model reads.
 *
 * The playback URL is left out on purpose: it is how a browser reaches the file,
 * and the model needs the file's own path.
 * @param render - the finished render.
 * @returns the create document.
 */
function createDocument(render: VideoRender): CreateDocument {
  return {
    operation: 'create',
    title: render.title,
    output: render.output,
    duration_ms: render.durationMs,
    duration_seconds: Math.round(render.durationMs / 100) / 10,
    width: render.width,
    height: render.height,
    fps: render.fps,
    bytes: render.bytes,
    voice: render.voice,
    scenes: render.scenes.map((scene: VideoSceneResult): SceneDocument => ({
      index: scene.index,
      ...scene.heading === undefined ? {} : { heading: scene.heading },
      narration: scene.narration,
      start_ms: scene.startMs,
      end_ms: scene.endMs,
      duration_ms: scene.endMs - scene.startMs,
      narration_cached: scene.cached,
    })),
  }
}
