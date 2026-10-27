import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { MarketView } from './MarketView.tsx'
import { en, NS, zh, type MarketViewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { market: MarketViewKey }
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-market-view: dictionaries')
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'market_overview', locale: NS }, MarketView)
  })
}
