/**
 * Shared presentation pieces for the five finance tool cards: the card shell,
 * KPI capsules, warning list, field table, and the plain-text fallback every
 * card renders when its result is not a recognized document.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/parts
 */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { TrendPanel } from './charts.tsx'
import {
  chartRange, formatNumber, formatPercent, formatRate, isSettled, resultText,
  type ChartPanelModel, type FieldModel, type ToolBlock, type ValuationPercentilesModel,
} from './model.ts'
import css from './FinanceView.module.css'

/** Full props of a registered finance card: ui-tool owner data plus the locale seat. */
export type FinanceViewProps = ToolCallViewProps & PropsLocale<'finance'>

/** The card's bound translate function. */
export type FinanceTranslate = FinanceViewProps['t']

/** One card shell: localized title over the card body. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={css.card} data-finance-view>
      <header className={css.cardHeader}>
        <span className={css.cardTitle}>{title}</span>
      </header>
      <div className={css.cardBody}>{children}</div>
    </section>
  )
}

/** One horizontal KPI capsule: a label and its value. */
export function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <span className={css.kpi}>
      <span className={css.kpiLabel}>{label}</span>
      <span className={css.kpiValue}>{value}</span>
    </span>
  )
}

/** The wrapped row every card's KPI capsules share. */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className={css.kpiRow}>{children}</div>
}

/** One section heading inside a card. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className={css.sectionTitle}>{children}</div>
}

/** The labelled field name: a localized fact label or the document's own key. */
export function fieldLabel(field: FieldModel, t: FinanceTranslate): string {
  return field.labelKey === null ? field.label : t(field.labelKey)
}

/**
 * The localized first-to-last label of one published axis.
 * @param dates - the series' date axis.
 * @param t - the card's bound translate function.
 * @returns the axis label, or the empty string for an axis with no label.
 */
export function chartRangeText(dates: readonly string[], t: FinanceTranslate): string {
  const range = chartRange(dates)
  return range === null ? '' : t('chart.range', { from: range[0], to: range[1] })
}

/**
 * The accessible summary of one published axis.
 * @param dates - the series' date axis.
 * @param t - the card's bound translate function.
 * @returns the summary, or the empty string for an axis with no label.
 */
export function chartCaption(dates: readonly string[], t: FinanceTranslate): string {
  const range = chartRange(dates)
  return range === null ? '' : t('chart.caption', { count: String(dates.length), from: range[0], to: range[1] })
}

/** One panel's readout: its latest value against its own range. */
function panelReadout(panel: ChartPanelModel, t: FinanceTranslate): string {
  const values = panel.points.filter((value): value is number => value !== null)
  const last = values[values.length - 1]
  if (last === undefined) return ''
  const format = (value: number): string => {
    if (panel.unit === 'fraction') return t('unit.percent', { value: formatPercent(value) })
    if (panel.unit === 'percent') return t('unit.percent', { value: formatRate(value) })
    return formatNumber(value)
  }
  return t('chart.readout', {
    last: format(last),
    min: format(Math.min(...values)),
    max: format(Math.max(...values)),
  })
}

/** One percentile bar row: a position on the shared axis and its own value text. */
export interface PercentileRow {
  /** The published category key; also the row's render key. */
  readonly key: string
  readonly label: string
  /** The bar's position on the shared 0-100 axis. */
  readonly score: number
  readonly valueText: string
}

/**
 * Adapt the valuation percentiles into bar rows on their own 0-100 axis.
 * @param model - the card's percentile model.
 * @param t - the card's bound translate function.
 * @returns one row per drawn percentile.
 */
export function percentileRows(
  model: ValuationPercentilesModel,
  t: FinanceTranslate,
): readonly PercentileRow[] {
  return model.bars.map(bar => ({
    key: bar.key,
    label: t(bar.labelKey),
    // A percentile is quoted 0-100, and its own value is the 0-1 fraction.
    score: Number((bar.value * 100).toFixed(1)),
    valueText: t('unit.percent', { value: formatPercent(bar.value) }),
  }))
}

/**
 * Adapt derived panels into the chart's own panel data.
 * @param panels - the panels a card draws.
 * @param t - the card's bound translate function.
 * @returns one chart panel per derived panel.
 */
export function trendPanels(
  panels: readonly ChartPanelModel[],
  t: FinanceTranslate,
): readonly TrendPanel[] {
  return panels.map(panel => ({
    key: panel.key,
    label: t(panel.labelKey),
    readout: panelReadout(panel, t),
    points: panel.points,
  }))
}

/** The data-source warnings a result carries; renders nothing when there are none. */
export function WarningList({ warnings, t }: { warnings: readonly string[]; t: FinanceTranslate }) {
  if (warnings.length === 0) return null
  return (
    <section className={css.warnings} aria-label={t('warnings.title')}>
      <SectionTitle>{t('warnings.title')}</SectionTitle>
      <ul className={css.warningList}>
        {warnings.map(warning => <li key={warning} className={css.warningItem}>{warning}</li>)}
      </ul>
    </section>
  )
}

/** A two-column table of labelled fields. */
export function FieldTable({ fields, t }: { fields: readonly FieldModel[]; t: FinanceTranslate }) {
  if (fields.length === 0) return null
  return (
    <table className={css.table}>
      <thead>
        <tr>
          <th scope="col">{t('dimension.field')}</th>
          <th scope="col">{t('dimension.value')}</th>
        </tr>
      </thead>
      <tbody>
        {fields.map(field => (
          <tr key={field.label}>
            <th scope="row" className={css.tableKey}>{fieldLabel(field, t)}</th>
            <td className={css.tableValue}>{field.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The fallback every card renders for a running, empty, or unrecognized result:
 * the state notice, or the result's own text.
 * @param props.block - the frozen running-or-settled Tool call node.
 * @param props.title - the localized card title to keep.
 * @param props.t - the card's bound translate function.
 * @returns the plain card.
 */
export function PlainResult({ block, title, t }: {
  block: ToolBlock
  title: string
  t: FinanceTranslate
}) {
  const text = resultText(block)
  return (
    <Card title={title}>
      {!isSettled(block)
        ? <p className={css.notice}>{t('state.running')}</p>
        : text === null
          ? <p className={css.notice}>{t('state.empty')}</p>
          : <pre className={css.raw}>{text}</pre>}
    </Card>
  )
}
