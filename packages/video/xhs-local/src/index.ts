/**
 * Local Xiaohongshu packaging capability, host half: the `ctx.xhs` service and
 * the route that serves the finished video the Web card plays.
 *
 * The model-facing tool that consumes this service ships as the package's
 * separate `tools` entry, because a session's agent owns which tools it sees
 * while the deployment owns where the operating manual and rendered assets live.
 *
 * @module @deepseek-ai/dsh-xhs-local
 */

import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { XHS_ROUTE_PREFIX } from './contract.ts'
import { installXhsRoute } from './route.ts'
import { XhsRuntime } from './service.ts'
import type { PublishOptions } from './publish.ts'

export { XhsRuntime } from './service.ts'
export { publishPost, parseDetect, parseScan, validatePost, normalizeTag, topicStem } from './publish.ts'
export { installXhsRoute, parseRange, resolveWithin, contentType } from './route.ts'
export { XHS_PAYLOAD_VERSION, XHS_ROUTE_PREFIX, INDEX_MARKER, RECENT_MARKER, LOG_MARKER, LIBRARY_MARKER } from './contract.ts'
export type { PublishOptions } from './publish.ts'
export type { XhsChecks, XhsFiles, XhsGate, XhsPostResult, XhsPublishRequest, XhsVideo } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'xhs-local'

/**
 * The subprocess capability this provider drives the two gates through. The
 * playback route is not listed: it is Web-only, and requiring the web server
 * would keep the capability from loading in a profile that has none.
 */
export const inject = ['subprocess']

/** Plugin config. Every path has a personal default, and a configured path is validated at load. */
export interface Config {
  /** Operating manual directory. Defaults to `~/Documents/mywiki/小红书运营`. */
  contentRoot?: string
  /** Finished-video directory served by the route. Defaults to `~/Documents/素材图`. */
  assetRoot?: string
  /** HTTP prefix the finished-video route serves under. Defaults to `/xhs-assets`. */
  routePrefix?: string
  /** de-AI prose scan script. Defaults to `~/.claude/skills/de-aigc-ch/scripts/detect.py`. */
  detectScript?: string
  /** Outbound-contact scan script. Defaults to `<contentRoot>/技术方案/发布前扫描.py`. */
  scanScript?: string
  /** Wall-clock bound for one gate, in milliseconds. Defaults to 120000. */
  checkTimeoutMs?: number
  /** In-memory cap on one gate's captured stdout in bytes. Defaults to 8388608. */
  maxOutputBytes?: number
  /** In-memory cap on captured stderr in bytes. Defaults to 262144. */
  maxStderrBytes?: number
  /** Termination and drain grace period in milliseconds. Defaults to 5000. */
  graceMs?: number
}

export const Config: z<Config> = z.object({
  contentRoot: z.string(),
  assetRoot: z.string(),
  routePrefix: z.string().default(XHS_ROUTE_PREFIX),
  detectScript: z.string(),
  scanScript: z.string(),
  checkTimeoutMs: z.number().step(1).min(1).default(120_000),
  maxOutputBytes: z.number().step(1).min(1).default(8_388_608),
  maxStderrBytes: z.number().step(1).min(1).default(262_144),
  graceMs: z.number().step(1).min(1).default(5_000),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Project one resolved section into the provider's options, validating every
 * configured path and URL prefix.
 * @param config - the currently authoritative section.
 * @returns options for one provider instance.
 */
function resolveOptions(config: ResolvedConfig): Omit<PublishOptions, 'playbackPath'> {
  const home = homedir()
  const contentRoot = config.contentRoot ?? join(home, 'Documents', 'mywiki', '小红书运营')
  const assetRoot = config.assetRoot ?? join(home, 'Documents', '素材图')
  if (!isAbsolute(contentRoot)) throw new Error(`xhs-local: contentRoot must be absolute: ${contentRoot}`)
  if (!isAbsolute(assetRoot)) throw new Error(`xhs-local: assetRoot must be absolute: ${assetRoot}`)
  const prefix = config.routePrefix
  if (!prefix.startsWith('/') || prefix.endsWith('/')) {
    throw new Error(`xhs-local: routePrefix must start with / and carry no trailing slash: ${prefix}`)
  }
  const detectScript = config.detectScript ?? join(home, '.claude', 'skills', 'de-aigc-ch', 'scripts', 'detect.py')
  const scanScript = config.scanScript ?? join(contentRoot, '技术方案', '发布前扫描.py')
  return {
    contentRoot,
    assetRoot,
    routePrefix: prefix,
    detectScript,
    scanScript,
    checkTimeoutMs: config.checkTimeoutMs,
    maxOutputBytes: config.maxOutputBytes,
    maxStderrBytes: config.maxStderrBytes,
    graceMs: config.graceMs,
  }
}

/**
 * Register the Xiaohongshu capability: one `ctx.xhs` service and, when this
 * deployment has a web server, the finished-video route.
 * @param ctx - context receiving the service.
 * @param config - validated deployment paths and bounds.
 */
export function apply(ctx: Context, config: Config): void {
  const options = resolveOptions(config as ResolvedConfig)
  let mounted = false
  new XhsRuntime(ctx, {
    ...options,
    playbackPath: () => mounted ? options.routePrefix : null,
  })
  const mount = (webCtx: Context): void => {
    webCtx.effect(() => {
      const dispose = installXhsRoute(webCtx, options.assetRoot, options.routePrefix)
      mounted = true
      return () => {
        mounted = false
        dispose()
      }
    }, 'xhs-local: playback route')
  }
  if (ctx.get('webServer') === undefined) ctx.inject(['webServer'], mount)
  else mount(ctx)
}
