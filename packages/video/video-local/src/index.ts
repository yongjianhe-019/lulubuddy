/**
 * Local short-video production capability, host half: the `ctx.video` Service
 * Definition, the local provider that drives a Remotion render project and
 * edge-tts, and the playback route that serves what a render produced.
 *
 * The model-facing tools that consume this service ship as the package's
 * separate `tools` entry, because a session's agent owns which tools it sees
 * while the deployment owns which render project exists. Mounting this row alone
 * provides the service and registers no tool.
 *
 * The render project is the one directory the deployment names. It is not laid
 * down here: the setup operation does that, so loading this plugin never writes
 * hundreds of megabytes for a deployment that never makes a video.
 *
 * @module @deepseek-ai/dsh-video-local
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_VOICE, PROJECT_DRIVER, PROJECT_VENV_DIR, VIDEO_ROUTE_PREFIX } from './contract.ts'
import { LocalVideoProvider } from './provider.ts'
import type { LocalVideoOptions } from './provider.ts'
import { installVideoRoute } from './route.ts'

export { LocalVideoProvider } from './provider.ts'
export type { LocalVideoOptions } from './provider.ts'
export { VideoRuntime } from './service.ts'
export { readVideoRender } from './payload.ts'
export { parseSrt, mp3DurationMs, parseVoiceList } from './narration.ts'
export { normalizeSpec, planVideo, slugify } from './storyboard.ts'
export { readDriverResult } from './driver.ts'
export { parseRange, resolveWithin, contentType } from './route.ts'
export type { VideoPlan, NarrationAudio, NormalizedSpec, NormalizedScene } from './storyboard.ts'
export type { DriverFailure, DriverResult, DriverSuccess } from './driver.ts'
export type { ByteRange } from './route.ts'
export type {
  VideoInvocation,
  VideoOperation,
  VideoOutcome,
  VideoProps,
  VideoRender,
  VideoRequestMap,
  VideoSceneLayout,
  VideoSceneProps,
  VideoSceneResult,
  VideoSceneSpec,
  VideoSpec,
  VideoSubtitleCue,
  VideoVoice,
} from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'video-local'

/**
 * The subprocess capability this provider spawns through. The playback route is
 * not listed: it is a Web-only nicety, and requiring the web server would keep
 * this capability from loading in a profile that has none.
 */
export const inject = ['subprocess']

/** First path segments inside the project that hold the interpreter the plugin owns. */
const VENV_PYTHON = { win32: join('Scripts', 'python.exe'), posix: join('bin', 'python') } as const

/**
 * Resolve the interpreter inside the virtual environment the setup step creates.
 *
 * A Windows environment keeps its executables in a different directory from
 * every other platform, so the layout is the platform's and not a deployment
 * choice. A deployment that supplies its own `ttsPython` never reads this path.
 * @param platform - the platform whose layout to use.
 * @returns the interpreter's path relative to the environment directory.
 */
export function venvPythonPath(platform: NodeJS.Platform): string {
  return platform === 'win32' ? VENV_PYTHON.win32 : VENV_PYTHON.posix
}

/**
 * Plugin config. The render project's location is the one field a deployment
 * almost certainly wants to set; everything else has a working default, and a
 * value that names a path is validated at load so a typo fails there rather than
 * after a four-minute install.
 */
export interface Config {
  /**
   * Directory holding the render project, its caches, and its rendered videos.
   * Defaults to `video` under the harness home.
   */
  projectRoot?: string
  /** Node executable that runs the render driver. Defaults to the running process's own. */
  nodePath?: string
  /** Package manager the render project installs with. Defaults to `npm`. */
  npmPath?: string
  /**
   * Interpreter that already provides edge-tts. When set, the plugin installs
   * nothing for narration and the project's own virtual environment is unused.
   */
  ttsPython?: string
  /** Interpreter the project's own virtual environment is created from. Defaults to `python3`. */
  pythonPath?: string
  /** Voice the create tool uses when a storyboard names none. */
  defaultVoice?: string
  /** Rate the create tool uses when a storyboard names none. Defaults to `+0%`. */
  defaultRate?: string
  /** Wall-clock bound for one narration synthesis, in milliseconds. Defaults to 180000. */
  ttsTimeoutMs?: number
  /** Wall-clock bound for one render, in milliseconds. Defaults to 1800000. */
  renderTimeoutMs?: number
  /** Wall-clock bound for one setup step, in milliseconds. Defaults to 1800000. */
  setupTimeoutMs?: number
  /** In-memory cap on one command's captured stdout in bytes. Defaults to 8388608. */
  maxOutputBytes?: number
  /** In-memory cap on captured stderr in bytes. Defaults to 262144. */
  maxStderrBytes?: number
  /** Termination and drain grace period in milliseconds. Defaults to 5000. */
  graceMs?: number
}

export const Config: z<Config> = z.object({
  projectRoot: z.string(),
  nodePath: z.string(),
  npmPath: z.string().default('npm'),
  ttsPython: z.string(),
  pythonPath: z.string().default('python3'),
  defaultVoice: z.string().default(DEFAULT_VOICE),
  defaultRate: z.string().default('+0%'),
  ttsTimeoutMs: z.number().step(1).min(1).default(180_000),
  renderTimeoutMs: z.number().step(1).min(1).default(1_800_000),
  setupTimeoutMs: z.number().step(1).min(1).default(1_800_000),
  maxOutputBytes: z.number().step(1).min(1).default(8_388_608),
  maxStderrBytes: z.number().step(1).min(1).default(262_144),
  graceMs: z.number().step(1).min(1).default(5_000),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Omit<Config, 'projectRoot' | 'nodePath' | 'ttsPython'>> & Config

/**
 * Absolute path of the shipped render project template, resolved from this
 * module so the source launch and the built `lib/` entry agree. It is a
 * package-internal artifact, not a deployment choice: the composition's protocol
 * is what this provider implements, so pointing it elsewhere would be a
 * different provider.
 */
const TEMPLATE_ROOT = fileURLToPath(new URL('../remotion/', import.meta.url))

/**
 * Version of the shipped template, read from this package's own manifest at load.
 *
 * It is the value the planted project records, so bumping the plugin is what
 * refreshes a project whose template predates it.
 * @returns the package version.
 * @throws when the manifest beside this module is unreadable, which means the installation is broken.
 */
function templateVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const version = (manifest as { version?: unknown }).version
  /* v8 ignore next -- the manifest is this package's own and always carries a version. */
  if (typeof version !== 'string') throw new Error('video-local: package.json carries no version')
  return version
}

/**
 * Require one configured executable to exist.
 * @param field - config field name, for the diagnostic.
 * @param path - the configured path.
 * @throws when the path is not an existing file.
 */
function assertExecutable(field: string, path: string): void {
  const info = statSync(path, { throwIfNoEntry: false })
  if (info?.isFile() !== true) throw new Error(`video-local: ${field} is not an existing file: ${path}`)
}

/** Every provider option except the playback path, which `apply` supplies once the route exists. */
type ResolvedOptions = Omit<LocalVideoOptions, 'playbackPath'>

/**
 * Project one resolved section into the provider's options, validating every
 * configured path. The policy is self-contained, so misconfiguration fails here
 * at load rather than after a first render.
 * @param config - the currently authoritative section.
 * @returns options for one provider instance.
 */
function resolveOptions(config: ResolvedConfig): ResolvedOptions {
  const projectRoot = config.projectRoot ?? join(resolveDshHome(), 'video')
  if (!isAbsolute(projectRoot)) throw new Error(`video-local: projectRoot must be absolute: ${projectRoot}`)
  const nodePath = config.nodePath ?? process.execPath
  assertExecutable('nodePath', nodePath)
  // A deployment-named interpreter is used as it is, so it must be there now;
  // the project's own is created by setup and cannot be checked at load.
  if (config.ttsPython !== undefined) assertExecutable('ttsPython', config.ttsPython)
  // The template ships inside this package, so reaching either check below
  // means the installation itself is broken rather than that a run entered a
  // state a test could have set up.
  /* v8 ignore start */
  const template = statSync(TEMPLATE_ROOT, { throwIfNoEntry: false })
  if (template?.isDirectory() !== true) {
    throw new Error(`video-local: shipped template is missing at ${TEMPLATE_ROOT}`)
  }
  if (!existsSync(join(TEMPLATE_ROOT, PROJECT_DRIVER))) {
    throw new Error(`video-local: shipped template at ${TEMPLATE_ROOT} carries no ${PROJECT_DRIVER}`)
  }
  /* v8 ignore stop */
  const venvPython = join(projectRoot, PROJECT_VENV_DIR, venvPythonPath(process.platform))
  return {
    projectRoot,
    templateRoot: TEMPLATE_ROOT,
    templateVersion: templateVersion(),
    nodePath,
    npmPath: config.npmPath,
    ttsPython: config.ttsPython ?? venvPython,
    pythonPath: config.pythonPath,
    venvPython,
    defaultVoice: config.defaultVoice,
    defaultRate: config.defaultRate,
    ttsTimeoutMs: config.ttsTimeoutMs,
    renderTimeoutMs: config.renderTimeoutMs,
    setupTimeoutMs: config.setupTimeoutMs,
    maxOutputBytes: config.maxOutputBytes,
    maxStderrBytes: config.maxStderrBytes,
    graceMs: config.graceMs,
  }
}

/**
 * Register the video capability: one `ctx.video` provider, and the playback
 * route when this deployment has a web server. Both registrations are
 * fiber-scoped, so disposing this plugin removes the service and the route.
 * @param ctx - context receiving the provider.
 * @param config - validated deployment paths and bounds.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const options = resolveOptions(config as ResolvedConfig)
  // The route answers before the provider exists, so the flag it reads is set by
  // the registration itself rather than by this function's own ordering.
  let mounted = false
  new LocalVideoProvider(ctx, {
    ...options,
    playbackPath: () => mounted ? VIDEO_ROUTE_PREFIX : null,
  })
  const mount = (webCtx: Context): void => {
    webCtx.effect(() => {
      const dispose = installVideoRoute(webCtx, options.projectRoot)
      mounted = true
      return () => {
        mounted = false
        dispose()
      }
    }, 'video-local: playback route')
  }
  // A profile without a web server still gets the capability; only the URL a
  // card would play is then absent, which the render reports as a warning.
  if (ctx.get('webServer') === undefined) ctx.inject(['webServer'], mount)
  else mount(ctx)
}
