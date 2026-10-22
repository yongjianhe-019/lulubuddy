/**
 * Presentation card, browser half: one keyed toolview for `ppt_create` and
 * `ppt_export`. The card opens the generated HTML in the right-side document
 * iframe and hands the PPTX to the browser download manager.
 *
 * @module @deepseek-ai/dsh-client-ui-ppt-view/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-tool SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { PptView } from './PptView.tsx'
import { PptDownloadAction } from './DownloadAction.tsx'
import { en, NS, zh, type PptViewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The presentation card's copy. */
    ppt: PptViewKey
  }
}

/** Required services: the slot registry and the locale registry. */
export const inject = ['slots', 'locale']

/**
 * Register the dictionaries and the two keyed cards.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-ppt-view: dictionaries')
  ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.document.actions', id: 'ppt-download', locale: NS,
  }, PptDownloadAction))
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'ppt_create', locale: NS }, PptView)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'ppt_export', locale: NS }, PptView)
  })
}
