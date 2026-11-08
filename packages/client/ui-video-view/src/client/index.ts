/**
 * Video view plugin, browser half: one keyed `tool.call.toolview` card per video
 * tool that publishes something to draw — the rendered video with its scene
 * timeline, and the render environment's readiness report. Unknown or malformed
 * results fall back to the raw text.
 *
 * `video_voices` deliberately has no card of its own: its document is a plain
 * list a reader scans once, and the generic tool row already renders that.
 *
 * @module @deepseek-ai/dsh-client-ui-video-view/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-tool SlotMap merge (the tool.call.toolview seat).
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { VideoCreateView } from './VideoCreateView.tsx'
import { VideoSetupView } from './VideoSetupView.tsx'
import { en, NS, zh, type VideoViewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The video tool cards' copy. */
    video: VideoViewKey
  }
}

/** Required services: the slot registry and the locale registry. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the two keyed cards.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-video-view: dictionaries')
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'video_create', locale: NS }, VideoCreateView)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'video_setup', locale: NS }, VideoSetupView)
  })
}
