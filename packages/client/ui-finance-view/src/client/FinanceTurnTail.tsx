/**
 * The turn footer's finance summary: the newest analysis this turn published,
 * drawn under the answer.
 *
 * A Tool card lives inside its turn's process disclosure, and that disclosure
 * is folded once the turn closes, so a chart in the card is invisible until the
 * reader expands the call. The turn footer is outside that fold, which is the
 * whole reason this seat exists: the same payload, drawn where the answer is.
 *
 * Only the turn that produced the payload draws it, so a session's earlier
 * answers never repeat a later analysis.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/FinanceTurnTail
 */

import { useMemo, type ReactNode } from 'react'
import { CandlestickChart, ScoreBar } from './charts.tsx'
import {
  candlestickModel, chartSeries, readChartProjection, valuationPercentiles,
  type ChartSeriesModel,
} from './model.ts'
import { chartCaption, chartRangeText, percentileRows } from './parts.tsx'
import type { FinanceViewKey } from './locales.ts'
import type { PropsLocale, PropsRuntime, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-chat SlotMap merge (the turn-footer seat).
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only: pulls the Session standard `useProjection` seat.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import css from './FinanceView.module.css'

/**
 * Full component props: the chain's own match (this contribution claims every
 * closing turn and decides in the body whether it has anything to draw), the
 * projection seat, and the locale seat.
 */
export type FinanceTurnTailProps = PropsRuntime<'conversation.chat.turnTail'>
  & PropsLocale<'finance'>
  & Pick<SessionStandardProps, 'useProjection'>

/** A percentile is quoted on a 0-100 axis, which is also where its boundary sits. */
const TAIL_SCALE = 100

/** Bars in one footer: the three valuation percentiles the card also draws. */
const TAIL_BARS = 3

/** Panels the footer draws of each index's own bars, side by side. */
const TAIL_CANDLES = 2

/**
 * Bar titles for the series ids a finance result publishes. The id is the
 * protocol's own token, so an unknown one falls back to the generic title
 * rather than inventing a name.
 */
const CANDLE_TITLES: Readonly<Record<string, FinanceViewKey>> = {
  price: 'chart.price',
  price_csi300: 'index.csi300',
  price_csi2000: 'index.csi2000',
}

/** One candlestick panel the footer draws, with the title its series id names. */
interface TailCandle {
  readonly id: string
  readonly model: NonNullable<ReturnType<typeof candlestickModel>>
}

/** Every candlestick a payload published, in publication order, capped for the footer. */
function tailCandles(series: readonly ChartSeriesModel[]): readonly TailCandle[] {
  const candles: TailCandle[] = []
  for (const item of series) {
    const model = candlestickModel(item)
    if (model !== null) candles.push({ id: item.id, model })
    if (candles.length === TAIL_CANDLES) break
  }
  return candles
}

/**
 * Render the closing turn's analysis charts.
 * @param props - the matched closing turn, the projection seat, and localized copy.
 * @returns the footer summary, or null for a turn this payload did not come from.
 */
export function FinanceTurnTail({ turn, useProjection, t }: FinanceTurnTailProps): ReactNode {
  const projection = useProjection('finance')
  const current = useMemo(() => readChartProjection(projection), [projection])
  const charts = current.charts
  const percentiles = useMemo(
    () => charts === null ? null : valuationPercentiles(chartSeries(charts, 'percentiles')),
    [charts],
  )
  const candles = useMemo(() => charts === null ? [] : tailCandles(charts.series), [charts])
  if (charts === null || current.turn !== turn.turn) return null
  if (percentiles === null && candles.length === 0) return null
  return (
    <section className={css.turnTail} data-finance-tail>
      <div className={css.turnTailHead}>{t('tail.title')}</div>
      {percentiles === null ? null : (
        <div className={css.categoryBars}>
          {percentileRows(percentiles, t).slice(0, TAIL_BARS).map(row => (
            <ScoreBar
              key={row.key}
              label={row.label}
              score={row.score}
              max={TAIL_SCALE}
              valueText={row.valueText}
              reference={percentiles.reference === null ? undefined : percentiles.reference * TAIL_SCALE}
            />
          ))}
        </div>
      )}
      {candles.length === 0 ? null : (
        <div className={css.turnTailCharts}>
          {candles.map(({ id, model }) => (
            <CandlestickChart
              key={id}
              title={t(CANDLE_TITLES[id] ?? 'chart.price')}
              rangeText={chartRangeText(model.dates, t)}
              caption={chartCaption(model.dates, t)}
              dates={model.dates}
              open={model.open}
              high={model.high}
              low={model.low}
              close={model.close}
              volume={model.volume}
            />
          ))}
        </div>
      )}
    </section>
  )
}
