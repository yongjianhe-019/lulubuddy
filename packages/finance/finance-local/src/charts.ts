/**
 * Narrowing and bounds for the chart payload a finance tool publishes as its
 * presentation metadata. The value crosses the bridge's process boundary as
 * unknown JSON, so it is validated here before any card draws it: a series that
 * does not match the payload's own contract is dropped rather than repaired,
 * and an over-long payload keeps what a reader needs most — the leading series
 * and the most recent points.
 *
 * @module @deepseek-ai/dsh-finance-local/charts
 */

import type { FinanceChartSeries, FinanceCharts } from './types.ts'

/** Payload revision this package publishes; a payload declaring another revision is not drawn. */
export const FINANCE_CHARTS_VERSION = 1

/** Series one payload may carry; later series are dropped. */
export const MAX_CHART_SERIES = 8

/** Points one series may carry; older points are dropped. */
export const MAX_CHART_POINTS = 240

/** Columns a candlestick series must carry to be drawable. */
const CANDLESTICK_COLUMNS = ['open', 'high', 'low', 'close'] as const

/** The column a bar series draws. */
const BAR_COLUMN = 'value'

/** Whether a value is a non-array JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one series' axis labels, keeping its most recent entries. A category
 * axis and a date axis carry the same validation, so they share one reader.
 * @param value - the candidate `dates` or `categories` member.
 * @returns the labels, or null when the member is not a non-empty string array.
 */
function readAxisLabels(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const labels: string[] = []
  for (const item of value.slice(-MAX_CHART_POINTS)) {
    if (typeof item !== 'string') return null
    labels.push(item)
  }
  return labels
}

/**
 * Read one column against the axis it must align with.
 * @param value - the candidate column.
 * @param length - the axis length every column has to match.
 * @returns the points, or null when the column is not an aligned numeric array.
 */
function readColumn(value: unknown, length: number): (number | null)[] | null {
  if (!Array.isArray(value)) return null
  const points: unknown[] = value.slice(-MAX_CHART_POINTS)
  if (points.length !== length) return null
  const column: (number | null)[] = []
  for (const item of points) {
    if (item !== null && typeof item !== 'number') return null
    column.push(item)
  }
  return column
}

/**
 * Read one series' optional reference value.
 * @param value - the candidate `reference` member.
 * @returns the value, or undefined for an absent or non-finite member; the
 * bars stay drawable without it, so a bad reference costs only the marker.
 */
function readReference(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Read one series, dropping the columns that do not align with its axis.
 * @param value - the candidate series.
 * @returns the series, or null when it carries no drawable column.
 */
function readSeries(value: unknown): FinanceChartSeries | null {
  if (!isRecord(value)) return null
  const { id, kind } = value
  if (typeof id !== 'string' || id === '') return null
  if (kind !== 'candlestick' && kind !== 'line' && kind !== 'bar') return null
  const axis = readAxisLabels(kind === 'bar' ? value['categories'] : value['dates'])
  if (axis === null) return null
  if (!isRecord(value['columns'])) return null
  const columns: Record<string, (number | null)[]> = {}
  for (const [name, raw] of Object.entries(value['columns'])) {
    const column = readColumn(raw, axis.length)
    if (column !== null) columns[name] = column
  }
  if (Object.keys(columns).length === 0) return null
  if (kind === 'bar') {
    if (!(BAR_COLUMN in columns)) return null
    const reference = readReference(value['reference'])
    return { id, kind, categories: axis, columns, ...reference === undefined ? {} : { reference } }
  }
  if (kind === 'candlestick' && !CANDLESTICK_COLUMNS.every(name => name in columns)) return null
  return { id, kind, dates: axis, columns }
}

/**
 * Narrow one bridge `charts` value into the payload the tool cards draw.
 * @param value - the bridge response's `charts` member, as unknown JSON.
 * @returns the payload; an unrecognized value yields an empty one, so no
 * consumer has to distinguish "no charts" from "charts it cannot read".
 */
export function readFinanceCharts(value: unknown): FinanceCharts {
  const empty: FinanceCharts = { version: FINANCE_CHARTS_VERSION, series: [] }
  if (!isRecord(value) || value['version'] !== FINANCE_CHARTS_VERSION) return empty
  const raw = value['series']
  if (!Array.isArray(raw)) return empty
  const series: FinanceChartSeries[] = []
  for (const item of raw.slice(0, MAX_CHART_SERIES)) {
    const parsed = readSeries(item)
    if (parsed !== null) series.push(parsed)
  }
  return { version: FINANCE_CHARTS_VERSION, series }
}
