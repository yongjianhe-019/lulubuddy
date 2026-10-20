/**
 * Defensive decoding for the finance tool cards. A finance tool result reaches
 * the client as model-facing text — optional `Data warnings:` lines followed by
 * one fenced JSON object — so every field is read as unknown JSON and narrowed
 * here before any component renders it. A value this module cannot recognize
 * yields `null`, and the owning card renders the raw text instead.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/model
 */

import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the `finance` session-projection key merge this module adds.
import type {} from '@deepseek-ai/dsh-session-projection/types'
import type { FinanceViewKey } from './locales.ts'

/** Frozen running-or-settled Tool call node supplied by ui-tool. */
export type ToolBlock = ToolCallViewProps['block']

/** Settled Tool result node. */
export type SettledBlock = Extract<ToolBlock, { kind: 'tool-result' }>

/** One labelled cell of a card, with an optional dictionary key for its label. */
export interface FieldModel {
  /** Verbatim document field name, or a document-supplied label. */
  readonly label: string
  /** Dictionary key when the label names a known fact; unknown keys stay null. */
  readonly labelKey: FinanceViewKey | null
  readonly value: string
}

/** One index-scoring dimension. */
export interface DimensionModel {
  readonly name: string
  /** Maximum parsed from the dimension's parenthesized suffix, when present. */
  readonly max: number | null
  readonly score: number | null
  readonly fields: readonly FieldModel[]
}

/** CSI 300 / CSI 2000 score document. */
export interface IndexAnalysisModel {
  readonly index: string | null
  readonly asOf: string | null
  readonly close: number | null
  readonly totalScore: number
  readonly season: string | null
  readonly action: string | null
  readonly pePercentile: number | null
  readonly icePoint: boolean | null
  /** Ice-point threshold; the document omits it for an index without one. */
  readonly threshold: number | null
  readonly dimensions: readonly DimensionModel[]
  /** Three-channel buy detail, when the index publishes one. */
  readonly buyChannel: readonly FieldModel[] | null
}

/** One index's leg of the composed timing signal. */
export interface TimingLegModel {
  readonly key: 'csi300' | 'csi2000'
  readonly score: number | null
  readonly icePoint: boolean | null
  readonly action: string | null
  readonly level: string | null
  readonly reasons: readonly string[]
  readonly recoveryPercent: number | null
  readonly sellPercent: number | null
}

/** Composed monthly timing signal over both indexes. */
export interface MarketTimingModel {
  readonly date: string | null
  readonly legs: readonly TimingLegModel[]
  readonly advice: string | null
}

/** Macro facts with their dates. */
export interface MacroSnapshotModel {
  readonly asOf: string | null
  readonly latest: readonly FieldModel[]
  readonly valuation: readonly MacroRowModel[]
  readonly bondYield: readonly MacroRowModel[]
  readonly historyRows: number | null
}

/** One dated macro row. */
export interface MacroRowModel {
  readonly date: string | null
  readonly fields: readonly FieldModel[]
}

/** One refreshed dataset's coverage. */
export interface DatasetModel {
  readonly rows: number | null
  readonly firstDate: string | null
  readonly lastDate: string | null
}

/** One named refreshed dataset. */
export interface NamedDatasetModel extends DatasetModel {
  readonly name: string
}

/** One cache file with its last modification time. */
export interface CacheFileModel {
  readonly file: string
  readonly modified: string | null
}

/** Market-data refresh document. */
export interface RefreshModel {
  readonly force: boolean | null
  readonly datasets: readonly NamedDatasetModel[]
  readonly macro: DatasetModel | null
  readonly cacheDirectory: string | null
  /** Cache files, most recently modified first. */
  readonly cacheFiles: readonly CacheFileModel[]
}

/** Parsed finance tool result: the decoded document plus its warnings and text. */
export interface FinanceResult {
  readonly document: Record<string, unknown>
  readonly warnings: readonly string[]
  readonly text: string
}

/** Dictionary key of every macro-fact name the cards label themselves. */
const MACRO_LABELS: Readonly<Record<string, FinanceViewKey>> = {
  usd_cny: 'macro.field.usdCny',
  jpy_cny: 'macro.field.jpyCny',
  cn_10y: 'macro.field.cn10y',
  us_10y: 'macro.field.us10y',
  cn_2y: 'macro.field.cn2y',
  us_2y: 'macro.field.us2y',
  spread_10y: 'macro.field.spread10y',
  spread_2y: 'macro.field.spread2y',
  gold_price: 'macro.field.goldPrice',
  cpi_yoy: 'macro.field.cpiYoy',
  social_finance: 'macro.field.socialFinance',
  real_estate: 'macro.field.realEstate',
  house_price_index: 'macro.field.housePriceIndex',
  pmi_manufacturing: 'macro.field.pmiManufacturing',
  m1_yoy: 'macro.field.m1Yoy',
  m2_yoy: 'macro.field.m2Yoy',
  m1_m2_scissors: 'macro.field.m1M2Scissors',
  ppi_yoy: 'macro.field.ppiYoy',
  retail_yoy: 'macro.field.retailYoy',
  fed_rate: 'macro.field.fedRate',
  margin_balance: 'macro.field.marginBalance',
  cn_term_spread: 'macro.field.cnTermSpread',
  us_term_spread: 'macro.field.usTermSpread',
}

/** Row-level labels the macro card localizes; every other row key stays verbatim. */
const MACRO_ROW_LABELS: Readonly<Record<string, FinanceViewKey>> = {
  pe: 'macro.pe',
  pb: 'macro.pb',
  yield_10y: 'macro.yield',
}

/** Trailing parenthesized maximum of a dimension name, signed bonus included. */
const DIMENSION_MAX = /\(\s*([+-]?\d+(?:\.\d+)?)\s*\)\s*$/

/** Fenced JSON body, with or without an info string. */
const JSON_FENCE = /```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/

/**
 * Whether a Tool node carries its settled result.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns whether the node is the settled `tool-result` form.
 */
export function isSettled(block: ToolBlock): block is SettledBlock {
  return 'kind' in block
}

/**
 * Narrow a value to a non-array JSON object.
 * @param value - any decoded JSON value.
 * @returns the object, or null for every other value.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Narrow a value to a finite number.
 * @param value - any decoded JSON value.
 * @returns the number, or null for every other value.
 */
export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Narrow a value to a non-empty string.
 * @param value - any decoded JSON value.
 * @returns the string, or null for every other value.
 */
export function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Narrow a value to a boolean.
 * @param value - any decoded JSON value.
 * @returns the boolean, or null for every other value.
 */
export function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/**
 * Narrow a value to an array.
 * @param value - any decoded JSON value.
 * @returns the array, or null for every other value.
 */
export function asArray(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null
}

/**
 * Collect the string members of an array value.
 * @param value - any decoded JSON value.
 * @returns the string members; a non-array yields none.
 */
export function asStringArray(value: unknown): readonly string[] {
  const array = asArray(value)
  if (array === null) return []
  const items: string[] = []
  for (const entry of array) {
    const text = asString(entry)
    if (text !== null) items.push(text)
  }
  return items
}

/**
 * Render a number for display: integers verbatim, fractions rounded to six places.
 * @param value - the number to render.
 * @returns its display text.
 */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
}

/**
 * Render a value for display under the generic-text contract.
 * @param value - any decoded JSON value.
 * @returns its display text.
 */
export function formatValue(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return '—'
  return JSON.stringify(value)
}

/**
 * Render a 0–1 fraction as a one-decimal percentage number, without the sign.
 * @param fraction - the fraction to render.
 * @returns the percentage number as text.
 */
export function formatPercent(fraction: number): string {
  return (fraction * 100).toFixed(1)
}

/**
 * Render a rate that is already a percentage, without the sign. A rate is
 * data, not prose, so two decimals is the most a readout should claim; the
 * scored document keeps its own precision.
 * @param rate - the percentage number to render.
 * @returns the rate as text.
 */
export function formatRate(rate: number): string {
  return String(Number(rate.toFixed(2)))
}

/**
 * Name the dictionary key of one index in the composed timing signal.
 * @param key - the index's leg key.
 * @returns that index's dictionary key.
 */
export function indexLabelKey(key: 'csi300' | 'csi2000'): FinanceViewKey {
  return key === 'csi300' ? 'index.csi300' : 'index.csi2000'
}

/**
 * Take the date part of an ISO timestamp.
 * @param value - the ISO timestamp.
 * @returns its `yyyy-mm-dd` prefix.
 */
export function formatDate(value: string): string {
  return value.slice(0, 10)
}

/**
 * Take the date and minute part of an ISO timestamp.
 * @param value - the ISO timestamp.
 * @returns its `yyyy-mm-dd hh:mm` prefix.
 */
export function formatTimestamp(value: string): string {
  return value.replace('T', ' ').slice(0, 16)
}

/**
 * Parse a dimension name's trailing maximum, e.g. `估值温度(30)` or
 * `ERP极端信号(+15)`.
 * @param name - the dimension's document key.
 * @returns the maximum, or null when the name carries no parenthesized number.
 */
export function parseDimensionMax(name: string): number | null {
  const match = DIMENSION_MAX.exec(name)
  return match?.[1] === undefined ? null : Number(match[1])
}

/**
 * A dimension's own score: `得分`, falling back to the `总分` key one dimension
 * publishes instead.
 * @param entry - one dimension's field object.
 * @returns the score, or null when the dimension is detail-only.
 */
export function dimensionScore(entry: Record<string, unknown>): number | null {
  return asNumber(entry['得分']) ?? asNumber(entry['总分'])
}

/**
 * Every field of a dimension except its own score, in document order.
 * @param entry - one dimension's field object.
 * @returns the labelled fields the card lists as detail.
 */
export function dimensionFields(entry: Record<string, unknown>): readonly FieldModel[] {
  const scoreKey = asNumber(entry['得分']) !== null ? '得分' : '总分'
  const fields: FieldModel[] = []
  for (const [label, value] of Object.entries(entry)) {
    if (label === scoreKey) continue
    fields.push({ label, labelKey: null, value: formatValue(value) })
  }
  return fields
}

/**
 * Read the text a settled Tool result exposes.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns the joined text, or null while the call has no result text.
 */
export function resultText(block: ToolBlock): string | null {
  if (!isSettled(block)) return null
  const parts: string[] = []
  for (const item of block.content) {
    parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  }
  return parts.length > 0 ? parts.join('\n') : null
}

/**
 * Decode the document from a tool result's text: the fenced JSON body, or the
 * whole text when it is a bare object.
 * @param text - the tool result's text.
 * @returns the document object, or null when the text is not one.
 */
export function extractDocument(text: string): Record<string, unknown> | null {
  const body = JSON_FENCE.exec(text)?.[1] ?? text
  const trimmed = body.trim()
  if (!trimmed.startsWith('{')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Truncated or streaming text is ordinary input at this boundary; the
    // caller renders the raw text instead.
    return null
  }
  return asRecord(parsed)
}

/**
 * Warnings from the `Data warnings:` preamble and from an embedded top-level
 * `warnings` array, deduplicated in first-seen order.
 * @param text - the tool result's text.
 * @param document - the decoded document.
 * @returns the warning strings to surface.
 */
export function extractWarnings(text: string, document: Record<string, unknown>): readonly string[] {
  const fenceAt = text.indexOf('```')
  const preamble = fenceAt === -1 ? text : text.slice(0, fenceAt)
  const warnings: string[] = []
  for (const line of preamble.split('\n')) {
    const item = /^\s*[-*]\s+(\S.*)$/.exec(line)
    if (item?.[1] !== undefined) warnings.push(item[1])
  }
  for (const entry of asStringArray(document['warnings'])) warnings.push(entry)
  return [...new Set(warnings)]
}

/**
 * Parse one finance tool result into its document and warnings.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns the parsed result, or null when the node has no decodable document.
 */
export function parseFinanceResult(block: ToolBlock): FinanceResult | null {
  const text = resultText(block)
  if (text === null) return null
  const document = extractDocument(text)
  if (document === null) return null
  // A bridge failure object is not a document: render it as plain text.
  if (document['ok'] === false) return null
  return { document, warnings: extractWarnings(text, document), text }
}

/**
 * Resolve the dictionary key of a known macro-fact name.
 * @param key - the document's fact key.
 * @returns the dictionary key, or null for an unknown key.
 */
export function macroLabel(key: string): FinanceViewKey | null {
  return MACRO_LABELS[key] ?? null
}

/**
 * Resolve the dictionary key of a known macro-row field.
 * @param key - the document's row field key.
 * @returns the dictionary key, or null for an unknown key.
 */
export function macroRowLabel(key: string): FinanceViewKey | null {
  return MACRO_ROW_LABELS[key] ?? null
}

/** Build one field from a document entry, localizing a known fact label. */
function field(label: string, labelKey: FinanceViewKey | null, value: unknown): FieldModel {
  return { label, labelKey, value: formatValue(value) }
}

/** The three-channel buy detail, when the index publishes one. */
function deriveBuyChannel(value: unknown): readonly FieldModel[] | null {
  const detail = asRecord(asRecord(value)?.['detail'])
  if (detail === null) return null
  const fields: FieldModel[] = []
  for (const [label, entry] of Object.entries(detail)) fields.push(field(label, null, entry))
  return fields.length > 0 ? fields : null
}

/**
 * Derive one index's score card model.
 * @param document - the decoded tool document.
 * @returns the card model, or null when the document carries no total score.
 */
export function deriveIndexAnalysis(document: Record<string, unknown>): IndexAnalysisModel | null {
  const score = asRecord(document['score'])
  const totalScore = score === null ? null : asNumber(score['total_score'])
  if (score === null || totalScore === null) return null
  const dimensions: DimensionModel[] = []
  const details = asRecord(score['details'])
  if (details !== null) {
    for (const [name, raw] of Object.entries(details)) {
      const entry = asRecord(raw)
      if (entry === null) continue
      dimensions.push({
        name,
        max: parseDimensionMax(name),
        score: dimensionScore(entry),
        fields: dimensionFields(entry),
      })
    }
  }
  return {
    index: asString(document['index']),
    asOf: asString(document['as_of']),
    close: asNumber(document['close']),
    totalScore,
    season: asString(score['season']),
    action: asString(score['action']),
    pePercentile: asNumber(document['pe_percentile']),
    icePoint: asBoolean(document['ice_point']),
    threshold: asNumber(document['ice_point_threshold']),
    dimensions,
    buyChannel: deriveBuyChannel(document['buy_channel']),
  }
}

/** One index's leg of the composed signal. */
function timingLeg(signal: Record<string, unknown>, key: 'csi300' | 'csi2000'): TimingLegModel {
  const suffix = key === 'csi300' ? '300' : '2000'
  const leg = asRecord(signal[`leg_${suffix}`]) ?? {}
  return {
    key,
    score: asNumber(signal[`score_${suffix}`]),
    icePoint: asBoolean(signal[`ice_${suffix}`]),
    action: asString(signal[`action_${suffix}`]),
    level: asString(leg['level']),
    reasons: asStringArray(leg['reasons']),
    recoveryPercent: asNumber(leg['recovery_pct']),
    sellPercent: asNumber(leg['sell_pct']),
  }
}

/**
 * Derive the composed timing-signal card model.
 * @param document - the decoded tool document.
 * @returns the card model, or null when no index leg carries a signal.
 */
export function deriveMarketTiming(document: Record<string, unknown>): MarketTimingModel | null {
  const signal = asRecord(document['signal'])
  if (signal === null) return null
  const legs = [timingLeg(signal, 'csi300'), timingLeg(signal, 'csi2000')]
  if (legs.every(leg => leg.score === null && leg.action === null)) return null
  return {
    date: asString(signal['date']),
    legs,
    advice: asString(signal['position_advice']),
  }
}

/** One dated row's fields, excluding its date. */
function macroRow(raw: unknown): MacroRowModel | null {
  const row = asRecord(raw)
  if (row === null) return null
  const fields: FieldModel[] = []
  for (const [label, value] of Object.entries(row)) {
    if (label === 'date') continue
    fields.push(field(label, macroRowLabel(label), value))
  }
  return { date: asString(row['date']), fields }
}

/** Every dated row of a macro-snapshot array. */
function macroRows(value: unknown): readonly MacroRowModel[] {
  const rows: MacroRowModel[] = []
  for (const entry of asArray(value) ?? []) {
    const row = macroRow(entry)
    if (row !== null) rows.push(row)
  }
  return rows
}

/**
 * Derive the macro-snapshot card model.
 * @param document - the decoded tool document.
 * @returns the card model, or null when the document carries no latest row.
 */
export function deriveMacroSnapshot(document: Record<string, unknown>): MacroSnapshotModel | null {
  const latest = asRecord(document['latest'])
  if (latest === null) return null
  const facts: FieldModel[] = []
  for (const [key, value] of Object.entries(latest)) facts.push(field(key, macroLabel(key), value))
  if (facts.length === 0) return null
  const recent = asArray(document['recent'])
  return {
    asOf: asString(document['as_of']),
    latest: facts,
    valuation: macroRows(document['valuation']),
    bondYield: macroRows(document['bond_yield_10y']),
    historyRows: recent === null ? null : recent.length,
  }
}

/** One dataset's coverage from its document row. */
function datasetOf(row: Record<string, unknown> | null): DatasetModel | null {
  if (row === null) return null
  return {
    rows: asNumber(row['rows']),
    firstDate: asString(row['first_date']),
    lastDate: asString(row['last_date']),
  }
}

/**
 * Derive the market-data refresh card model.
 * @param document - the decoded tool document.
 * @returns the card model, or null when the document carries no dataset map.
 */
export function deriveMarketDataRefresh(document: Record<string, unknown>): RefreshModel | null {
  const datasets = asRecord(document['datasets'])
  if (datasets === null) return null
  const named: NamedDatasetModel[] = []
  for (const [name, raw] of Object.entries(datasets)) {
    const dataset = datasetOf(asRecord(raw))
    if (dataset !== null) named.push({ name, ...dataset })
  }
  const cache = asRecord(document['cache'])
  const cacheFiles: CacheFileModel[] = []
  for (const entry of asArray(cache?.['files']) ?? []) {
    const row = asRecord(entry)
    const file = row === null ? null : asString(row['file'])
    if (file === null) continue
    cacheFiles.push({ file, modified: asString(row?.['modified']) })
  }
  cacheFiles.sort((left, right) => (right.modified ?? '').localeCompare(left.modified ?? ''))
  return {
    force: asBoolean(document['force']),
    datasets: named,
    macro: datasetOf(asRecord(document['macro'])),
    cacheDirectory: asString(cache?.['directory']),
    cacheFiles,
  }
}

/**
 * One series a finance tool published as its result presentation metadata. The
 * payload's authority is the producing package's `FinanceChartSeries`
 * (`@deepseek-ai/dsh-finance-local`); a card re-narrows it here because the
 * browser half may not runtime-import another package's values, and because a
 * replayed log may predate the current payload.
 */
interface ChartSeriesModelBase {
  readonly id: string
  readonly columns: Readonly<Record<string, readonly (number | null)[]>>
}

/** One published series on a date axis. */
export interface TimeSeriesModel extends ChartSeriesModelBase {
  readonly kind: 'candlestick' | 'line'
  readonly dates: readonly string[]
}

/** One published series on a category axis. */
export interface CategorySeriesModel extends ChartSeriesModelBase {
  readonly kind: 'bar'
  readonly categories: readonly string[]
  /** The axis value the bars are read against, when the producer named one. */
  readonly reference?: number
}

/** One published series, with the axis its points sit on. */
export type ChartSeriesModel = TimeSeriesModel | CategorySeriesModel

/** The chart payload a finance result carries, already stripped of what cannot be drawn. */
export interface ChartPayloadModel {
  readonly series: readonly ChartSeriesModel[]
}

/**
 * Payload revision these cards know. It mirrors the producer's
 * `FINANCE_CHARTS_VERSION`: a result written by a newer producer draws nothing
 * rather than guessing at fields this revision never defined.
 */
const CHART_PAYLOAD_VERSION = 1

/** Columns a candlestick series must carry before a card draws it. */
const CANDLESTICK_COLUMNS = ['open', 'high', 'low', 'close'] as const

/** The column a bar series draws. */
const BAR_COLUMN = 'value'

/**
 * Narrow one published column, requiring it to align with its series' own axis.
 * @param value - the candidate column.
 * @param length - the axis length the column must match.
 * @returns the points, or null when the column is not an aligned numeric array.
 */
function readChartColumn(value: unknown, length: number): readonly (number | null)[] | null {
  const array = asArray(value)
  if (array === null || array.length !== length) return null
  const points: (number | null)[] = []
  for (const item of array) {
    if (item !== null && typeof item !== 'number') return null
    points.push(item)
  }
  return points
}

/**
 * Narrow one published series' axis labels.
 * @param value - the candidate `dates` or `categories` member.
 * @returns the labels, or null when the member is not a non-empty string array.
 */
function readAxisLabels(value: unknown): string[] | null {
  const labels = asArray(value)
  if (labels === null || labels.length === 0) return null
  const axis: string[] = []
  for (const item of labels) {
    if (typeof item !== 'string') return null
    axis.push(item)
  }
  return axis
}

/**
 * Narrow one published series.
 * @param value - the candidate series.
 * @returns the series, or null when it carries no drawable column.
 */
function readChartSeries(value: unknown): ChartSeriesModel | null {
  const record = asRecord(value)
  if (record === null) return null
  const id = asString(record['id'])
  const kind = record['kind']
  if (id === null || (kind !== 'candlestick' && kind !== 'line' && kind !== 'bar')) return null
  const axis = readAxisLabels(kind === 'bar' ? record['categories'] : record['dates'])
  if (axis === null) return null
  const published = asRecord(record['columns'])
  if (published === null) return null
  const columns: Record<string, readonly (number | null)[]> = {}
  for (const [name, raw] of Object.entries(published)) {
    const column = readChartColumn(raw, axis.length)
    if (column !== null) columns[name] = column
  }
  if (Object.keys(columns).length === 0) return null
  if (kind === 'bar') {
    if (!(BAR_COLUMN in columns)) return null
    const reference = asNumber(record['reference'])
    return { id, kind, categories: axis, columns, ...reference === null ? {} : { reference } }
  }
  if (kind === 'candlestick' && !CANDLESTICK_COLUMNS.every(name => name in columns)) return null
  return { id, kind, dates: axis, columns }
}

/**
 * Read the chart payload a settled finance result carries.
 * @param meta - the result node's presentation metadata, as unknown JSON.
 * @returns the drawable series; a result without a readable payload yields none.
 */
export function readChartPayload(meta: unknown): ChartPayloadModel {
  const record = asRecord(meta)
  if (record === null || record['version'] !== CHART_PAYLOAD_VERSION) return { series: [] }
  const raw = asArray(record['series'])
  if (raw === null) return { series: [] }
  const series: ChartSeriesModel[] = []
  for (const item of raw) {
    const parsed = readChartSeries(item)
    if (parsed !== null) series.push(parsed)
  }
  return { series }
}

/**
 * Find one published series by its protocol id.
 * @param payload - the result's chart payload.
 * @param id - the series id the card draws.
 * @returns the series, or null when the result does not carry it.
 */
export function chartSeries(payload: ChartPayloadModel, id: string): ChartSeriesModel | null {
  return payload.series.find(series => series.id === id) ?? null
}

/**
 * Find one published time series by its protocol id.
 * @param payload - the result's chart payload.
 * @param id - the series id the card draws.
 * @returns the series, or null when the result carries none under that id, or
 * carries a category series there, which no date-axis card can draw.
 */
export function timeSeries(payload: ChartPayloadModel, id: string): TimeSeriesModel | null {
  const series = chartSeries(payload, id)
  return series !== null && series.kind !== 'bar' ? series : null
}

/**
 * Read the chart payload a Tool call carries.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns the drawable series; a running or payload-less call yields none.
 */
export function resultCharts(block: ToolBlock): ChartPayloadModel {
  return isSettled(block) ? readChartPayload(block.meta) : { series: [] }
}

/** The bar columns of one candlestick series, already aligned to its date axis. */
export interface CandlestickModel {
  readonly dates: readonly string[]
  readonly open: readonly (number | null)[]
  readonly high: readonly (number | null)[]
  readonly low: readonly (number | null)[]
  readonly close: readonly (number | null)[]
  /** Traded volume per bar; empty when the series published none. */
  readonly volume: readonly (number | null)[]
}

/**
 * Read one series' candlestick columns.
 *
 * The payload contract makes a candlestick carry open/high/low/close, so a
 * series missing one is not a candlestick this card can draw; volume stays
 * optional because a source may publish bars without it.
 * @param series - the published series, or null.
 * @returns the columns, or null when the series is not a drawable candlestick.
 */
export function candlestickModel(series: ChartSeriesModel | null): CandlestickModel | null {
  if (series === null || series.kind !== 'candlestick') return null
  const { open, high, low, close } = series.columns
  if (open === undefined || high === undefined || low === undefined || close === undefined) return null
  return { dates: series.dates, open, high, low, close, volume: series.columns['volume'] ?? [] }
}

/** One column a card draws as its own trend panel. */
export interface ChartPanelModel {
  /** The published column name; also the panel's render key. */
  readonly key: string
  /** Dictionary key of the panel's label. */
  readonly labelKey: FinanceViewKey
  /**
   * How the panel's readout is formatted: a plain number, a number that is
   * already a percentage (the equity-risk premium), or a 0-1 fraction the
   * readout renders as a percentage (a percentile).
   */
  readonly unit: 'number' | 'percent' | 'fraction'
  readonly points: readonly (number | null)[]
}

/** The valuation columns the CSI 300 and CSI 2000 cards draw, in panel order. */
const VALUATION_PANELS = [
  { key: 'pe', labelKey: 'macro.pe', unit: 'number' },
  { key: 'pb', labelKey: 'macro.pb', unit: 'number' },
] as const satisfies readonly Omit<ChartPanelModel, 'points'>[]

/** The equity-risk-premium columns the CSI 300 card draws, in panel order. */
const ERP_PANELS = [
  { key: 'erp', labelKey: 'chart.erpLevel', unit: 'percent' },
  { key: 'erp_percentile', labelKey: 'chart.erpPercentile', unit: 'fraction' },
] as const satisfies readonly Omit<ChartPanelModel, 'points'>[]

/** The index columns the composed-timing card draws, in panel order. */
const COMPARISON_PANELS = [
  { key: 'csi300', labelKey: 'index.csi300', unit: 'number' },
  { key: 'csi2000', labelKey: 'index.csi2000', unit: 'number' },
] as const satisfies readonly Omit<ChartPanelModel, 'points'>[]

/**
 * Derive the panels one series draws, keeping only its published columns.
 * @param series - the published series, or null when the result carries none.
 * @param panels - the columns this card draws, in panel order.
 * @returns one panel per published column.
 */
function panelsOf(
  series: ChartSeriesModel | null,
  panels: readonly Omit<ChartPanelModel, 'points'>[],
): readonly ChartPanelModel[] {
  if (series === null) return []
  const models: ChartPanelModel[] = []
  for (const panel of panels) {
    const points = series.columns[panel.key]
    if (points !== undefined) models.push({ ...panel, points })
  }
  return models
}

/**
 * The valuation panels of an index result.
 * @param series - the published valuation series, or null.
 * @returns the panels to draw.
 */
export function valuationPanels(series: ChartSeriesModel | null): readonly ChartPanelModel[] {
  return panelsOf(series, VALUATION_PANELS)
}

/**
 * The equity-risk-premium panels of an index result.
 * @param series - the published premium series, or null.
 * @returns the panels to draw.
 */
export function erpPanels(series: ChartSeriesModel | null): readonly ChartPanelModel[] {
  return panelsOf(series, ERP_PANELS)
}

/**
 * The index panels of a composed-timing result.
 * @param series - the published comparison series, or null.
 * @returns the panels to draw.
 */
export function comparisonPanels(series: ChartSeriesModel | null): readonly ChartPanelModel[] {
  return panelsOf(series, COMPARISON_PANELS)
}

/** One percentile bar a card draws. */
export interface PercentileBarModel {
  /** The published category key; also the bar's render key. */
  readonly key: string
  /** Dictionary key of the bar's label. */
  readonly labelKey: FinanceViewKey
  /** The 0-1 percentile the bar is read at. */
  readonly value: number
}

/** The valuation percentiles one card draws, with the boundary it grades at. */
export interface ValuationPercentilesModel {
  /** The 0-1 boundary the valuation dimension grades at, or null when the producer named none. */
  readonly reference: number | null
  readonly bars: readonly PercentileBarModel[]
}

/**
 * The valuation percentile categories the CSI 300 card draws, in bar order. The
 * equity-risk-premium percentile is absent by design: the project scores it in
 * the opposite direction (higher is cheaper), so it cannot share this axis.
 */
const PERCENTILE_BARS = [
  { key: 'pe_percentile', labelKey: 'chart.pePercentile' },
  { key: 'pb_percentile', labelKey: 'chart.pbPercentile' },
  { key: 'mean_percentile', labelKey: 'chart.meanPercentile' },
] as const satisfies readonly Omit<PercentileBarModel, 'value'>[]

/**
 * Derive the valuation percentiles one result published.
 * @param series - the published percentile series, or null.
 * @returns the bars and their boundary, or null when the result draws none.
 */
export function valuationPercentiles(series: ChartSeriesModel | null): ValuationPercentilesModel | null {
  if (series === null || series.kind !== 'bar') return null
  const values = series.columns[BAR_COLUMN]
  if (values === undefined) return null
  const bars: PercentileBarModel[] = []
  for (const [index, category] of series.categories.entries()) {
    const entry = PERCENTILE_BARS.find(candidate => candidate.key === category)
    const value = values[index]
    if (entry === undefined || value === null || value === undefined) continue
    bars.push({ ...entry, value })
  }
  if (bars.length === 0) return null
  return { reference: series.reference ?? null, bars }
}

/**
 * The first and last labels of one published axis.
 * @param dates - the series' date axis.
 * @returns the two labels, or null when the axis is empty.
 */
export function chartRange(dates: readonly string[]): readonly [string, string] | null {
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first === undefined || last === undefined) return null
  return [formatDate(first), formatDate(last)]
}

/**
 * The client's view of the `finance` session projection value. The host's
 * `FinanceProjection` (`@deepseek-ai/dsh-finance-local`) is the authority; the
 * browser half re-declares it for the same reason it re-narrows the result
 * metadata, and narrows every field before a card draws it.
 */
export interface ChartProjectionModel {
  /** The newest published payload, or null before one landed. */
  readonly charts: ChartPayloadModel | null
  /** Turn that produced the payload, so a turn footer shows only its own turn. */
  readonly turn: number | null
  /** Seq of the result the payload came from. */
  readonly seq: number | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** The newest finance chart payload this session published, or null. */
    finance: ChartProjectionModel | null
  }
}

/**
 * Read the `finance` projection value one session published.
 * @param value - the projection value, as unknown JSON.
 * @returns the drawable payload; an absent or unreadable value yields none.
 */
export function readChartProjection(value: unknown): ChartProjectionModel {
  const record = asRecord(value)
  if (record === null) return { charts: null, turn: null, seq: null }
  const payload = readChartPayload(record['charts'])
  return {
    charts: payload.series.length === 0 ? null : payload,
    turn: asNumber(record['turn']),
    seq: asNumber(record['seq']),
  }
}
