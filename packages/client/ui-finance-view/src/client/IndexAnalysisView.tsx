/**
 * The CSI 300 / CSI 2000 score card: a KPI row, one bar per scoring dimension
 * whose scale comes from the dimension name's parenthesized maximum, the
 * total-score ice-point gauge, and each dimension's remaining fields as a
 * disclosure. The two index tools publish the same shape, so they share this
 * renderer under two keyed registrations.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/IndexAnalysisView
 */

import { useMemo } from 'react'
import {
  candlestickModel, chartSeries, deriveIndexAnalysis, erpPanels, formatDate, formatNumber,
  formatPercent, parseFinanceResult, resultCharts, timeSeries, valuationPercentiles,
  valuationPanels,
  type DimensionModel,
} from './model.ts'
import {
  Card, chartCaption, chartRangeText, FieldTable, Kpi, KpiRow, percentileRows, PlainResult,
  SectionTitle, trendPanels, WarningList,
  type FinanceTranslate, type FinanceViewProps,
} from './parts.tsx'
import { CandlestickChart, ScoreBar, ThresholdGauge, TrendChart } from './charts.tsx'
import css from './FinanceView.module.css'

/** The index scores are reported out of 100 and the document carries no scale. */
const SCORE_SCALE = 100

/** A percentile is quoted on a 0-100 axis, which is also where its boundary sits. */
const PERCENTILE_SCALE = 100

/** One dimension's bar plus its remaining fields. */
function DimensionRow({ dimension, t }: { dimension: DimensionModel; t: FinanceTranslate }) {
  const { score, max } = dimension
  return (
    <li className={css.dimension}>
      {score !== null && max !== null ? (
        <ScoreBar
          label={dimension.name}
          score={score}
          max={max}
          valueText={t('unit.score', { score: formatNumber(score), max: formatNumber(max) })}
        />
      ) : (
        <div className={css.barRow}>
          <span className={css.barLabel}>{dimension.name}</span>
          <span className={css.barNoScore}>{t('dimension.noScore')}</span>
        </div>
      )}
      {dimension.fields.length > 0 ? (
        <details className={css.dimensionDetails}>
          <summary className={css.dimensionSummary}>{t('dimension.details')}</summary>
          <FieldTable fields={dimension.fields} t={t} />
        </details>
      ) : null}
    </li>
  )
}

/** Shared index-score renderer behind the two keyed toolviews. */
function IndexAnalysis({ block, t, title }: FinanceViewProps & { title: string }) {
  const model = useMemo(() => {
    const parsed = parseFinanceResult(block)
    if (parsed === null) return null
    const analysis = deriveIndexAnalysis(parsed.document)
    return analysis === null ? null : { parsed, analysis }
  }, [block])
  const charts = useMemo(() => {
    const payload = resultCharts(block)
    const price = candlestickModel(chartSeries(payload, 'price'))
    const valuation = timeSeries(payload, 'valuation')
    const erp = timeSeries(payload, 'erp')
    return {
      price,
      valuation: valuation === null ? null : { series: valuation, panels: valuationPanels(valuation) },
      erp: erp === null ? null : { series: erp, panels: erpPanels(erp) },
      percentiles: valuationPercentiles(chartSeries(payload, 'percentiles')),
    }
  }, [block])
  if (model === null) return <PlainResult block={block} title={title} t={t} />

  const { parsed, analysis } = model
  const gaugeValue = t('unit.score', { score: formatNumber(analysis.totalScore), max: formatNumber(SCORE_SCALE) })
  const valuation = charts.valuation
  const erp = charts.erp
  const percentiles = charts.percentiles
  const percentileReference = percentiles === null || percentiles.reference === null
    ? undefined
    : percentiles.reference * PERCENTILE_SCALE
  return (
    <Card title={title}>
      <WarningList warnings={parsed.warnings} t={t} />
      <KpiRow>
        {analysis.index !== null ? <Kpi label={t('kpi.index')} value={analysis.index} /> : null}
        {analysis.close !== null ? <Kpi label={t('kpi.close')} value={formatNumber(analysis.close)} /> : null}
        <Kpi label={t('kpi.totalScore')} value={formatNumber(analysis.totalScore)} />
        {analysis.season !== null ? <Kpi label={t('kpi.season')} value={analysis.season} /> : null}
        {analysis.action !== null ? <Kpi label={t('kpi.action')} value={analysis.action} /> : null}
        {analysis.pePercentile !== null
          ? <Kpi label={t('kpi.pePercentile')} value={t('unit.percent', { value: formatPercent(analysis.pePercentile) })} />
          : null}
        {analysis.icePoint !== null
          ? <Kpi label={t('kpi.icePoint')} value={analysis.icePoint ? t('kpi.iceYes') : t('kpi.iceNo')} />
          : null}
        {analysis.asOf !== null ? <Kpi label={t('kpi.asOf')} value={formatDate(analysis.asOf)} /> : null}
      </KpiRow>

      {charts.price !== null ? (
        <CandlestickChart
          title={t('chart.price')}
          rangeText={chartRangeText(charts.price.dates, t)}
          caption={chartCaption(charts.price.dates, t)}
          dates={charts.price.dates}
          open={charts.price.open}
          high={charts.price.high}
          low={charts.price.low}
          close={charts.price.close}
          volume={charts.price.volume}
        />
      ) : null}

      {analysis.threshold !== null ? (
        <ThresholdGauge
          label={t('gauge.label')}
          value={analysis.totalScore}
          threshold={analysis.threshold}
          max={SCORE_SCALE}
          valueText={gaugeValue}
          thresholdText={t('gauge.thresholdText', { value: formatNumber(analysis.threshold) })}
        />
      ) : null}

      {percentiles !== null ? (
        <section>
          <SectionTitle>{t('chart.percentiles')}</SectionTitle>
          <div className={css.categoryBars}>
            {percentileRows(percentiles, t).map(row => (
              <ScoreBar
                key={row.key}
                label={row.label}
                score={row.score}
                max={PERCENTILE_SCALE}
                valueText={row.valueText}
                reference={percentileReference}
              />
            ))}
          </div>
          {percentileReference === undefined ? null : (
            <p className={css.categoryNote}>
              {t('chart.percentileReference', { value: formatNumber(percentileReference) })}
            </p>
          )}
        </section>
      ) : null}

      {valuation !== null && valuation.panels.length > 0 ? (
        <section>
          <SectionTitle>{t('chart.valuation')}</SectionTitle>
          <TrendChart panels={trendPanels(valuation.panels, t)} caption={chartCaption(valuation.series.dates, t)} />
        </section>
      ) : null}

      {erp !== null && erp.panels.length > 0 ? (
        <section>
          <SectionTitle>{t('chart.erp')}</SectionTitle>
          <TrendChart panels={trendPanels(erp.panels, t)} caption={chartCaption(erp.series.dates, t)} />
        </section>
      ) : null}

      {analysis.dimensions.length > 0 ? (
        <section>
          <SectionTitle>{t('dimension.details')}</SectionTitle>
          <ul className={css.dimensions}>
            {analysis.dimensions.map(dimension => (
              <DimensionRow key={dimension.name} dimension={dimension} t={t} />
            ))}
          </ul>
        </section>
      ) : null}

      {analysis.buyChannel !== null ? (
        <section>
          <SectionTitle>{t('buyChannel.title')}</SectionTitle>
          <FieldTable fields={analysis.buyChannel} t={t} />
        </section>
      ) : null}
    </Card>
  )
}

/** CSI 300 score card. */
export function Csi300AnalysisView(props: FinanceViewProps) {
  return <IndexAnalysis {...props} title={props.t('card.csi300')} />
}

/** CSI 2000 score card. */
export function Csi2000AnalysisView(props: FinanceViewProps) {
  return <IndexAnalysis {...props} title={props.t('card.csi2000')} />
}
