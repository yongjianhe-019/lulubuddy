/**
 * Vocabulary for the financial-analysis capability seam (`ctx.finance`): the
 * closed set of analysis operations, each operation's arguments, and the bounded
 * JSON document one invocation returns. The concrete data sources, thresholds,
 * and scoring live in the external analysis project the provider runs, so no
 * type here repeats them.
 *
 * @module @deepseek-ai/dsh-finance-local/types
 */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { FinanceProjection, FinanceProjectionState } from './projection.ts'

/**
 * One financial-analysis operation. The name is the bridge protocol's operation
 * verb and the provider's dispatch key; the model-facing tool names are separate
 * and belong to the consumer.
 */
export type FinanceOperation =
  | 'refresh'
  | 'csi300_analysis'
  | 'csi2000_analysis'
  | 'market_signal'
  | 'macro_snapshot'
  | 'dashboard'
  | 'ice_check'
  | 'opportunity_radar'
  | 'dragon_head'
  | 'positions'
  | 'journal_append'
  | 'strategy_doc'

/** Each operation's arguments, keyed by operation. */
export interface FinanceRequestMap {
  /** Incremental data refresh; `force` redownloads even a fresh cache. */
  readonly refresh: { readonly force?: boolean }
  /** Five-dimension CSI 300 score plus the ice-point verdict. */
  readonly csi300_analysis: Record<string, never>
  /** CSI 2000 score plus its three-channel buy signal. */
  readonly csi2000_analysis: Record<string, never>
  /** Composed monthly timing signal over both indexes. */
  readonly market_signal: Record<string, never>
  /** Latest macro row, recent history, valuation, and bond yield. */
  readonly macro_snapshot: Record<string, never>
  /** Full daily snapshot: core signals, satellite radar, dragon gate, and plan. */
  readonly dashboard: { readonly force?: boolean; readonly record?: boolean }
  /** CSI2000 ice-point gate: trigger, channel, position, and what is missing. */
  readonly ice_check: { readonly force?: boolean }
  /** Satellite ETF opportunity scan with R:R, conditional win rate, and EV. */
  readonly opportunity_radar: { readonly force?: boolean }
  /** Latest dragon-head post-close review and tracked candidates. */
  readonly dragon_head: { readonly as_of?: string }
  /** Human-maintained positions and satellite radar state. */
  readonly positions: Record<string, never>
  /** Append one entry to the core or satellite trade journal. */
  readonly journal_append: { readonly kind?: 'core' | 'satellite'; readonly entry: string }
  /** Read one whitelisted StockMarket strategy document. */
  readonly strategy_doc: { readonly name?: 'mindset' | 'progress' | 'readme' }
}

/** One fully-specified capability request: an operation and its own arguments. */
export type FinanceInvocation = {
  readonly [K in FinanceOperation]: {
    readonly operation: K
    readonly arguments: FinanceRequestMap[K]
  }
}[FinanceOperation]

/** The members every published series carries, whatever its axis. */
interface FinanceChartSeriesBase {
  /**
   * Protocol identity of the series, stable across deployments because the
   * client resolves its localized label from this token. The bridge emits
   * `price`, `valuation`, `erp`, `percentiles`, and `index_comparison`.
   */
  readonly id: string
  /** Named columns over the series' own axis; every column carries one point per axis entry, `null` where the source had no value. */
  readonly columns: Readonly<Record<string, readonly (number | null)[]>>
}

/** One series on a date axis: daily bars or a drawn trend. */
export interface FinanceTimeSeries extends FinanceChartSeriesBase {
  /** How the series is drawn: `candlestick` needs open/high/low/close; `line` draws each column. */
  readonly kind: 'candlestick' | 'line'
  /** One `YYYY-MM-DD` label per point, oldest first. */
  readonly dates: readonly string[]
}

/** One series on a category axis: one bar per named reading. */
export interface FinanceCategorySeries extends FinanceChartSeriesBase {
  readonly kind: 'bar'
  /** One protocol category key per bar; the client resolves each to its own localized label. */
  readonly categories: readonly string[]
  /** The axis value the bars are read against, when the scored dimension has such a boundary. */
  readonly reference?: number
}

/** One bounded numeric series the tool cards draw, with the axis its points sit on. */
export type FinanceChartSeries = FinanceTimeSeries | FinanceCategorySeries

/**
 * The series one operation publishes for a UI: the history the scored document
 * deliberately summarizes away. It is not model-facing, so it may carry the
 * hundreds of points an analysis is usually read against.
 */
export interface FinanceCharts {
  /** Payload revision; a client that does not know this value draws nothing. */
  readonly version: number
  readonly series: readonly FinanceChartSeries[]
}

/**
 * One operation's result: the analysis project's own JSON document, plus the
 * non-fatal data-source facts the model must weigh and the series a UI draws.
 * The document is opaque JSON here because the external project owns its
 * fields; the consumer's tool output schema is the model-facing statement of
 * them.
 */
export interface FinanceOutcome {
  /** The operation that produced this outcome. */
  readonly operation: FinanceOperation
  /** The analysis project's JSON document for this operation. */
  readonly document: Readonly<Record<string, JsonValue>>
  /** Non-fatal facts: unavailable optional data sources and skipped enrichments. */
  readonly warnings: readonly string[]
  /** The series the operation's cards draw; empty for an operation with no chart. */
  readonly charts: FinanceCharts
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Host fold state of the newest finance chart payload. */
    finance: FinanceProjectionState
  }
  interface SessionProjectionMap {
    /** The newest finance chart payload this session published. */
    finance: FinanceProjection
  }
}
