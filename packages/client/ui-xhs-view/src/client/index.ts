/**
 * Xiaohongshu post card, browser half: one keyed `tool.call.toolview` card for
 * `xhs_post`. Unknown or malformed results fall back to the raw text.
 *
 * @module @deepseek-ai/dsh-client-ui-xhs-view/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-tool SlotMap merge (the tool.call.toolview seat).
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { XhsPostView } from './XhsPostView.tsx'
import { en, NS, zh, type XhsViewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Xiaohongshu post card's copy. */
    xhs: XhsViewKey
  }
}

/** Required services: the slot registry and the locale registry. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the keyed card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-xhs-view: dictionaries')
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'xhs_post', locale: NS }, XhsPostView)
  })
}
