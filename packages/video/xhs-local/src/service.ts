/**
 * Service Definition for the Xiaohongshu packaging capability (`ctx.xhs`): one
 * bounded publication call that turns a finished video and its copy into the
 * files and gates the operating brief requires.
 *
 * @module @deepseek-ai/dsh-xhs-local/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { publishPost, type PublishOptions } from './publish.ts'
import type { XhsPostResult, XhsPublishRequest } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    xhs: XhsRuntime
  }
}

/**
 * Local Xiaohongshu publication service.
 *
 * Implementations must honor these semantics:
 * - {@link publish} resolves with the card payload only after both publication
 *   gates pass; a rejected gate, missing video, or unreadable manual rejects
 *   instead of returning a partial payload.
 * - The caller's signal cancels the gates.
 * - Warnings describe non-fatal publication facts (no playback route, missing
 *   index marker, manual not updated); they never carry the post's content.
 */
export class XhsRuntime extends Service {
  readonly #options: PublishOptions

  /**
   * Register the service on `ctx.xhs`.
   * @param ctx - context receiving the service.
   * @param options - deployment paths and process bounds.
   */
  constructor(ctx: Context, options: PublishOptions) {
    super(ctx, 'xhs')
    this.#options = options
  }

  /**
   * Publish one post.
   * @param request - the post and its measured video.
   * @param signal - cancels the gates.
   * @returns the card payload.
   */
  async publish(request: XhsPublishRequest, signal: AbortSignal): Promise<XhsPostResult> {
    return await publishPost(this.ctx, this.#options, request, signal)
  }
}

export default XhsRuntime
