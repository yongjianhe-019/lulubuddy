/**
 * The `finance` session projection: the newest chart payload any finance tool
 * result published in this session.
 *
 * The payload is the result's own presentation metadata, so this unit adds no
 * data the session log does not already carry and the fold is a pure read of
 * it — replaying a session reproduces the same value. Being session state, it
 * is what a surface outside the conversation tree reads: the turn footer draws
 * the newest analysis even while the Tool call that produced it sits inside a
 * collapsed process disclosure.
 *
 * @module @deepseek-ai/dsh-finance-local/projection
 */

import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { readFinanceCharts } from './charts.ts'
import type { FinanceCharts } from './types.ts'

/**
 * The client-visible value: the newest payload and where it came from.
 *
 * Only the newest result is retained. The payload is several kilobytes, and a
 * session's whole history of them would grow the persisted projection cache
 * without bound, so a reader that wants an older analysis reads its own
 * result rather than this unit.
 */
export interface FinanceProjection {
  /** The newest series set, or null before any finance result landed. */
  readonly charts: FinanceCharts | null
  /** Turn that produced `charts`; a turn footer shows only its own turn's value. */
  readonly turn: number | null
  /** Seq of the result that published `charts`, so a reader can order it. */
  readonly seq: number | null
}

/** Host fold state. The value is the view, so the two never disagree. */
export interface FinanceProjectionState {
  readonly current: FinanceProjection
}

/** The columns object every series carries: one numeric array per column name. */
const chartColumnsSchema = zod.record(zod.string(), zod.array(zod.number().nullable()))

/** One published series, either on a date axis or on a category axis. */
const chartSeriesSchema = zod.union([
  zod.object({
    id: zod.string().min(1),
    kind: zod.union([zod.literal('candlestick'), zod.literal('line')]),
    dates: zod.array(zod.string()),
    columns: chartColumnsSchema,
  }).strict(),
  zod.object({
    id: zod.string().min(1),
    kind: zod.literal('bar'),
    categories: zod.array(zod.string()),
    columns: chartColumnsSchema,
    reference: zod.number().optional(),
  }).strict(),
])

/** The payload revision and its bounded series list. */
const chartsSchema = zod.object({
  version: zod.number().int().nonnegative(),
  series: zod.array(chartSeriesSchema),
}).strict()

/** Wire value: the newest payload, or null before one lands. */
const financeProjectionSchema: ZodType<FinanceProjection> = zod.object({
  charts: chartsSchema.nullable(),
  turn: zod.number().int().nonnegative().nullable(),
  seq: zod.number().int().nonnegative().nullable(),
}).strict() as unknown as ZodType<FinanceProjection>

/** Persisted state carries the same value under `current`. */
const financeProjectionStateSchema: ZodType<FinanceProjectionState> = zod.object({
  current: financeProjectionSchema,
}).strict()

const EMPTY: FinanceProjection = { charts: null, turn: null, seq: null }

/**
 * Fold one committed session event into the projection.
 *
 * An event that is not a Tool result, or a result that published no drawable
 * series, returns the same state reference — the framework turns that into zero
 * downstream work.
 * @param state - the projection covering all prior events.
 * @param event - the next committed session event.
 * @returns the next projection.
 */
export function applyFinanceProjection(
  state: FinanceProjectionState,
  event: SessionEvent,
): FinanceProjectionState {
  if (event.type !== 'tool/result') return state
  const charts = readFinanceCharts(event.data.meta)
  if (charts.series.length === 0) return state
  return { current: { charts, turn: event.data.turn, seq: event.seq } }
}

/** The `finance` unit: newest payload as session state, published to clients. */
export const financeProjectionDefinition = {
  key: 'finance',
  stateSchema: financeProjectionStateSchema,
  init: (): FinanceProjectionState => ({ current: EMPTY }),
  apply: applyFinanceProjection,
  wire: { viewSchema: financeProjectionSchema, view: state => state.current },
  stateVersion: 1,
} satisfies ProjectionDefinition<'finance', FinanceProjectionState>
