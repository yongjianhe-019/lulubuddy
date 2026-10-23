/**
 * Local motion-graphics capability, host half: the `ctx.motion` Service
 * Definition and the provider over the user's motion-studio project.
 *
 * @module @deepseek-ai/dsh-motion-local
 */

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LocalMotionProvider } from './provider.ts'
import type { LocalMotionOptions } from './provider.ts'

export { LocalMotionProvider } from './provider.ts'
export type { LocalMotionOptions } from './provider.ts'
export { MotionRuntime } from './service.ts'
export type { MotionInvocation } from './service.ts'
export type { MotionOperation, MotionOutcome, MotionRequestMap } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'motion-local'

/** The host has no extra service dependency beyond the plugin loader. */
export const inject: string[] = []

/** Plugin config: the external motion-studio project and its local tools. */
export interface Config {
  /** motion-studio root, containing skill/motion-video. */
  motionRoot: string
  /** Node executable that runs the motion-studio scripts. Defaults to this host process. */
  nodePath?: string
  /** Absolute playwright-core path; defaults to this package's dependency. */
  playwrightCore?: string
  /** Optional Chromium executable. */
  chromeBin?: string
  /** Per-operation wall-clock bound in milliseconds. Defaults to 900000. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  motionRoot: z.string().required(),
  nodePath: z.string(),
  playwrightCore: z.string(),
  chromeBin: z.string(),
  timeoutMs: z.number().step(1).min(1).default(900_000),
})

/** Resolve and validate the project before the provider starts. */
function resolveOptions(config: Config): LocalMotionOptions {
  const root = config.motionRoot
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`motion-local: motionRoot is not a directory: ${root}`)
  }
  if (!existsSync(join(root, 'skill', 'motion-video', 'scripts', 'render.mjs'))) {
    throw new Error(`motion-local: motionRoot has no skill/motion-video/scripts/render.mjs: ${root}`)
  }
  return {
    motionRoot: root,
    timeoutMs: config.timeoutMs ?? 900_000,
    ...config.nodePath === undefined ? {} : { nodePath: config.nodePath },
    ...config.playwrightCore === undefined ? {} : { playwrightCore: config.playwrightCore },
    ...config.chromeBin === undefined ? {} : { chromeBin: config.chromeBin },
  }
}

/**
 * Register the motion capability.
 * @param ctx - context receiving the provider.
 * @param config - validated project path and optional local tools.
 */
export function apply(ctx: Context, config: Config): void {
  new LocalMotionProvider(ctx, resolveOptions(config))
}
