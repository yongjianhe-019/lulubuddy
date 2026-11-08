/**
 * Service Definition for the short-video production capability seam
 * (`ctx.video`): one bounded production invocation over a named operation.
 * Narration synthesis, render-project materialization, and video encoding
 * belong to the provider; operation selection, argument validation, and
 * presentation belong to the consumer.
 *
 * @module @deepseek-ai/dsh-video-local/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { VideoInvocation, VideoOutcome } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    video: VideoRuntime
  }
}

/**
 * Abstract short-video production service. Subclass it, implement
 * {@link invoke}, and load the subclass as a plugin — it registers as
 * `ctx.video` (one implementation per context; loading a second throws, which
 * is cordis' standard duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - {@link invoke} resolves with the operation's JSON document; a failure to
 *   produce one (missing render project, refused install, failed synthesis,
 *   failed encode, exceeded bound) rejects rather than returning a partial
 *   document.
 * - The caller's signal cancels in-flight work, and the provider records no
 *   result for a cancelled invocation.
 * - Warnings describe non-fatal production facts (reused cached narration, a
 *   missing playback route, a system voice that no longer exists); they never
 *   carry the video's content.
 */
export abstract class VideoRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'video')
  }

  /**
   * Run one production operation and return its document.
   * @param invocation - the operation and that operation's arguments.
   * @param signal - cancels the invocation.
   * @returns the operation's JSON document plus non-fatal production facts.
   */
  abstract invoke(invocation: VideoInvocation, signal: AbortSignal): Promise<VideoOutcome>
}

export default VideoRuntime
