/**
 * The composed market-timing card: a KPI row over both index scores, one signal
 * card per index carrying its action, level, and reasons, and the overall
 * position advice line.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/MarketTimingView
 */

import { useMemo } from 'react'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  candlestickModel, chartSeries, comparisonPanels, deriveMarketTiming, formatDate, formatNumber,
  formatPercent, indexLabelKey, parseFinanceResult, resultCharts, timeSeries,
  type TimingLegModel,
} from './model.ts'
import {
  Card, chartCaption, chartRangeText, Kpi, KpiRow, PlainResult, SectionTitle, trendPanels,
  WarningList,
  type FinanceTranslate, type FinanceViewProps,
} from './parts.tsx'
import { CandlestickChart, TrendChart } from './charts.tsx'
import css from './FinanceView.module.css'

/** The tag palette a per-index action reads as. */
function actionTone(action: string): TagTone {
  switch (action) {
    case 'BUY': return 'success'
    case 'SELL': return 'danger'
    case 'RESTORE': return 'info'
    default: return 'neutral'
  }
}

/** One labelled leg field. */
function LegField({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.legField}>
      <dt className={css.legFieldLabel}>{label}</dt>
      <dd className={css.legFieldValue}>{value}</dd>
    </div>
  )
}

/** One index's signal card. */
function LegCard({ leg, t }: { leg: TimingLegModel; t: FinanceTranslate }) {
  return (
    <section className={css.leg} aria-label={t(indexLabelKey(leg.key))}>
      <div className={css.legHeader}>
        <span className={css.legTitle}>{t(indexLabelKey(leg.key))}</span>
        {leg.action !== null ? <Tag tone={actionTone(leg.action)}>{leg.action}</Tag> : null}
        {leg.icePoint !== null
          ? <Tag tone={leg.icePoint ? 'warning' : 'quiet'}>{leg.icePoint ? t('kpi.iceYes') : t('kpi.iceNo')}</Tag>
          : null}
      </div>
      <dl className={css.legFields}>
        {leg.score !== null ? <LegField label={t('timing.score')} value={formatNumber(leg.score)} /> : null}
        {leg.level !== null ? <LegField label={t('timing.level')} value={leg.level} /> : null}
        {leg.sellPercent !== null
          ? <LegField label={t('timing.sellPercent')} value={t('unit.percent', { value: formatPercent(leg.sellPercent) })} />
          : null}
        {leg.recoveryPercent !== null
          ? <LegField label={t('timing.recoveryPercent')} value={t('unit.percent', { value: formatPercent(leg.recoveryPercent) })} />
          : null}
      </dl>
      {leg.reasons.length > 0 ? (
        <div className={css.reasons}>
          <span className={css.reasonsLabel}>{t('timing.reasons')}</span>
          <ul className={css.reasonList}>
            {leg.reasons.map(reason => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/**
 * Render one `market_timing_signal` result.
 * @param props - keyed toolview owner data plus the finance locale seat.
 * @returns the timing card, or the plain fallback.
 */
export function MarketTimingView({ block, t }: FinanceViewProps) {
  const model = useMemo(() => {
    const parsed = parseFinanceResult(block)
    if (parsed === null) return null
    const timing = deriveMarketTiming(parsed.document)
    if (timing === null) return null
    const charts = resultCharts(block)
    const series = timeSeries(charts, 'index_comparison')
    return {
      parsed,
      timing,
      comparison: series === null ? null : { series, panels: comparisonPanels(series) },
      // Each leg's own bars: the price action the leg's action describes.
      prices: timing.legs.map(leg => ({
        key: leg.key,
        model: candlestickModel(chartSeries(charts, `price_${leg.key}`)),
      })),
    }
  }, [block])
  if (model === null) return <PlainResult block={block} title={t('card.marketTiming')} t={t} />

  const { parsed, timing, comparison } = model
  return (
    <Card title={t('card.marketTiming')}>
      <WarningList warnings={parsed.warnings} t={t} />
      <KpiRow>
        {timing.date !== null ? <Kpi label={t('kpi.signalDate')} value={formatDate(timing.date)} /> : null}
        {timing.legs.map(leg => leg.score === null ? null : (
          <Kpi key={leg.key} label={t(indexLabelKey(leg.key))} value={formatNumber(leg.score)} />
        ))}
      </KpiRow>
      {model.prices.some(entry => entry.model !== null) ? (
        <section>
          <SectionTitle>{t('chart.price')}</SectionTitle>
          {model.prices.map(({ key, model: price }) => price === null ? null : (
            <CandlestickChart
              key={key}
              title={t(indexLabelKey(key))}
              rangeText={chartRangeText(price.dates, t)}
              caption={chartCaption(price.dates, t)}
              dates={price.dates}
              open={price.open}
              high={price.high}
              low={price.low}
              close={price.close}
              volume={price.volume}
            />
          ))}
        </section>
      ) : null}

      {comparison !== null && comparison.panels.length > 0 ? (
        <section>
          <SectionTitle>{t('chart.comparison')}</SectionTitle>
          <TrendChart panels={trendPanels(comparison.panels, t)} caption={chartCaption(comparison.series.dates, t)} />
        </section>
      ) : null}
      <div className={css.legGrid}>
        {timing.legs.map(leg => <LegCard key={leg.key} leg={leg} t={t} />)}
      </div>
      {timing.advice !== null ? (
        <section>
          <SectionTitle>{t('timing.advice')}</SectionTitle>
          <p className={css.advice}>{timing.advice}</p>
        </section>
      ) : null}
    </Card>
  )
}
