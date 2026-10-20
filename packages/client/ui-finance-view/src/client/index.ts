/**
 * Finance view plugin, browser half: five keyed `tool.call.toolview` cards,
 * one per finance analysis tool, each rendering the tool's own document shape
 * with bars, a threshold gauge, KPI capsules, and compact tables. Unknown or
 * malformed results fall back to the raw text.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-tool SlotMap merge (the tool.call.toolview seat).
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { Csi2000AnalysisView, Csi300AnalysisView } from './IndexAnalysisView.tsx'
import { MacroSnapshotView } from './MacroSnapshotView.tsx'
import { MarketDataRefreshView } from './MarketDataRefreshView.tsx'
import { MarketTimingView } from './MarketTimingView.tsx'
import { FinanceTurnTail } from './FinanceTurnTail.tsx'
import { en, NS, zh, type FinanceViewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The finance tool cards' copy. */
    finance: FinanceViewKey
  }
}

/** Required services: the slot registry and the locale registry. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the five keyed cards.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-finance-view: dictionaries')
  // The turn footer is outside the process disclosure's fold, so the newest
  // analysis stays visible after the turn closes.
  ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'finance-turn-tail',
    locale: NS,
  }, FinanceTurnTail)), 'ui-finance-view: turn footer')

  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'csi300_analysis', locale: NS }, Csi300AnalysisView)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'csi2000_analysis', locale: NS }, Csi2000AnalysisView)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'market_timing_signal', locale: NS }, MarketTimingView)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'macro_snapshot', locale: NS }, MacroSnapshotView)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'market_data_refresh', locale: NS }, MarketDataRefreshView)
  })
}
