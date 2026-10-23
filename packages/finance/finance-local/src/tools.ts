/**
 * Model-facing finance tools over `ctx.finance`, mounted as the package's
 * `tools` entry so a session's agent is what sees them. This module owns the
 * tool schemas, argument validation the schema cannot express, result
 * presentation, and the per-call timeout budget; the capability itself stays
 * behind the seam, so a different provider changes none of these contracts.
 *
 * @module @deepseek-ai/dsh-finance-local/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { readFinanceCharts } from './charts.ts'
import type { FinanceRuntime } from './service.ts'
import type { FinanceOutcome } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'finance-tools'

/**
 * The capability this entry presents and the registry it registers into. Both
 * are host-plane services, so a preset mounts this row over the deployment's
 * own provider rather than starting one.
 */
export const inject = ['tools', 'finance']

/** Default cooperative tool-call timeout budget, in milliseconds. */
export const DEFAULT_FINANCE_TOOL_TIMEOUT_MS = 180_000

/** Plugin config: the per-call budget the tool-call timeout policy enforces. */
export interface Config {
  /**
   * Cooperative timeout budget attached to every finance tool. It must not be
   * shorter than the provider's own invocation bound, or the tool-call policy
   * would cancel a bridge process the provider still considers within budget.
   * Defaults to 180000, the provider's default bound.
   */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_FINANCE_TOOL_TIMEOUT_MS),
})

/**
 * Project one outcome into the canonical tool value: the operation's document,
 * the data-source warnings the model must weigh, and the series its card draws.
 * The warnings and the series are the two members a model must not read, so
 * {@link renderFinanceDocument} is what decides the model-facing half.
 * @param outcome - the seam's outcome for one invocation.
 * @returns the canonical value the output schema validates.
 */
function toolValue(outcome: FinanceOutcome): Record<string, JsonValue> {
  return {
    ...outcome.document,
    warnings: [...outcome.warnings],
    // The payload is JSON by construction (the bridge encoded it, `readFinanceCharts`
    // re-narrowed it shape by shape), and the output schema is an open object.
    charts: outcome.charts as unknown as JsonValue,
  }
}

/**
 * Render one canonical finance value as model-facing text: the data-source
 * warnings first, then the complete document as JSON. The document is emitted
 * whole because the tools' value is in their numbers, and a hand-written
 * summary would drop the dimension details the model reasons over.
 *
 * The series is the one member left out: it exists so a UI can draw the history
 * the document summarizes away, and the model reads the analysis, not the bars.
 * @param value - the canonical tool output value.
 * @returns one text block.
 */
export function renderFinanceDocument(value: Record<string, JsonValue>): string {
  const { warnings, charts: _series, ...document } = value
  const parts: string[] = []
  if (Array.isArray(warnings) && warnings.length > 0) {
    parts.push(`Data warnings:\n${warnings.map(warning => `- ${renderWarning(warning)}`).join('\n')}`)
  }
  parts.push(`\`\`\`json\n${JSON.stringify(document, null, 2)}\n\`\`\``)
  return parts.join('\n\n')
}

/**
 * Publish one tool value's series as the call's presentation metadata, so a card
 * can draw it on the live path and on a session-log replay alike.
 * @param value - the canonical tool value.
 * @returns the narrowed chart payload.
 */
function chartMeta(value: JsonValue): JsonValue {
  // The output schema is an object and the value is validated against it before
  // this projector runs, so what arrives here is what `toolValue` built.
  const charts = (value as Record<string, JsonValue>)['charts']
  return readFinanceCharts(charts) as unknown as JsonValue
}

/**
 * Render one warning for the model. The bridge and the decoder both produce
 * strings, so the non-string arm exists only because the canonical value's
 * element type is `JsonValue`; JSON keeps such a value readable rather than
 * rendering it as `[object Object]`.
 * @param warning - one entry of the outcome's warnings array.
 * @returns the warning text.
 */
function renderWarning(warning: JsonValue): string {
  return typeof warning === 'string' ? warning : JSON.stringify(warning)
}


/** Read a JSON object without trusting its shape. */
function objectOf(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : null
}

/** Read a string, or the empty string. */
function stringOf(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/** Render the recent-analysis read as readable Markdown instead of raw JSON. */
function renderJournal(value: Record<string, JsonValue>): string {
  const document = objectOf(value)
  const entries = Array.isArray(document?.['entries']) ? document['entries'] : []
  const warnings = Array.isArray(value['warnings']) ? value['warnings'] : []
  const parts: string[] = []
  if (warnings.length > 0) parts.push(`Data warnings:\n${warnings.map(renderWarning).map(item => `- ${item}`).join('\n')}`)
  const markdown = stringOf(document?.['journal_markdown'])
  if (markdown !== '') parts.push(markdown)
  else parts.push(entries.length === 0 ? 'No recent analysis records.' : `${String(entries.length)} recent records.`)
  return parts.join('\n\n')
}

/** Render the multi-day dragon-head read as readable Markdown. */
function renderDragonHistory(value: Record<string, JsonValue>): string {
  const document = objectOf(value)
  const entries = Array.isArray(document?.['entries']) ? document['entries'] : []
  const warnings = Array.isArray(value['warnings']) ? value['warnings'] : []
  const parts: string[] = []
  if (warnings.length > 0) parts.push(`Data warnings:\n${warnings.map(renderWarning).map(item => `- ${item}`).join('\n')}`)
  if (entries.length === 0) {
    parts.push('No dragon-head daily reviews found.')
    return parts.join('\n\n')
  }
  const lines = ['## 龙头复盘历史', '']
  for (const item of entries) {
    const entry = objectOf(item)
    if (entry === null) continue
    const env = objectOf(entry['env'])
    const sentiment = objectOf(entry['sentiment'])
    const candidates = Array.isArray(entry['candidates']) ? entry['candidates'] : []
    const candidateText = candidates.slice(0, 5).map((candidate) => {
      const row = objectOf(candidate)
      return row === null ? '' : `${stringOf(row['name'])}(${stringOf(row['code'])})`
    }).filter(Boolean).join('、')
    lines.push(`- **${stringOf(entry['date']) || '—'}**：龙头闸门${env?.['strong'] === true ? '通过' : '否决'}；涨停 ${String(sentiment?.['limitup_total'] ?? '—')}、炸板 ${String(sentiment?.['broken'] ?? '—')}、最高 ${String(sentiment?.['max_streak'] ?? '—')} 板${candidateText === '' ? '' : `；候选 ${candidateText}`}`)
  }
  parts.push(lines.join('\n'))
  const track = Array.isArray(document?.['track']) ? document['track'] : []
  if (track.length > 0) parts.push(`跟踪台账：${String(track.length)} 条（最近 ${String(track.slice(0, 5).map(row => stringOf(objectOf(row)?.['date'])).filter(Boolean).join('、') || '—')}）`)
  return parts.join('\n\n')
}

/** The shared open-object output spec: every finance document is one JSON object. */
const DOCUMENT_SCHEMA = { type: 'object', additionalProperties: true } as const

/**
 * Register one index analysis tool: no arguments, one capability operation, and
 * the series its card draws published as the call's presentation metadata.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param finance - the capability instance the tool invokes.
 * @param timeoutMs - per-tool wall-clock budget.
 * @param name - the model-facing tool name.
 * @param description - the model-facing description.
 * @param operation - the capability operation the tool runs.
 */
function registerIndexTool(
  ctx: Context,
  finance: FinanceRuntime,
  timeoutMs: number,
  name: string,
  description: string,
  operation: 'csi300_analysis' | 'csi2000_analysis' | 'market_signal',
): void {
  ctx.tools.register(defineTool({
    name,
    description,
    parameters: {},
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
      presentationMeta: (_args, value) => chartMeta(value),
    },
    timeoutMs,
    async execute(_args, exec) {
      return toolValue(await finance.invoke({ operation, arguments: {} }, exec.signal))
    },
  }))
}

/**
 * Register the finance tools.
 *
 * Every tool is left at the registry's default exclusive scheduling: each
 * invocation writes the analysis project's cache, so overlapping calls would
 * race on those files.
 * @param ctx - context whose `tools` registry receives the registrations.
 * @param finance - the capability instance every tool invocation goes through.
 * @param timeoutMs - per-tool wall-clock budget enforced by the tool-call timeout policy.
 */
export function registerFinanceTools(ctx: Context, finance: FinanceRuntime, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'market_data_refresh',
    description: 'Refresh the cached A-share index, ETF, and macro datasets every other finance tool reads. The refresh is incremental: a cache written today is reused, so only stale series are downloaded. Call it before a first analysis or after a result reports stale data.',
    parameters: {
      force: { type: 'boolean', description: 'Download every series even when its cache is fresh. Defaults to false.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'refresh',
        arguments: { ...args.force === undefined ? {} : { force: args.force } },
      }, exec.signal))
    },
  }))

  registerIndexTool(ctx, finance, timeoutMs, 'csi300_analysis', 'Score the CSI 300 (沪深300) on valuation, equity risk premium, drawdown, volume exhaustion, and volatility convergence, plus ERP-extreme and macro-bottom bonus dimensions. Returns the total score out of 100, the season and action labels, per-dimension detail, the latest close, the PE percentile, and whether the index is at an ice point (score at least 50).', 'csi300_analysis')

  registerIndexTool(ctx, finance, timeoutMs, 'csi2000_analysis', 'Score the CSI 2000 (中证2000) on macro liquidity, trend momentum, relative strength against the CSI 300, market structure, macro-bottom confirmation, and margin-flush confirmation, then evaluate the three-channel buy signal (absolute score, five-year score percentile, r20 percentile, 250-day drawdown, and MA10 stabilization) with the position size it implies.', 'csi2000_analysis')

  registerIndexTool(ctx, finance, timeoutMs, 'market_timing_signal', 'Compose the monthly timing signal over both indexes: ice-point buy flags, bubble or trend-breakdown sell legs with their reasons, the per-index action (BUY, HOLD, SELL, or RESTORE), and the overall position advice. Use it for the strategy\'s complete current stance rather than reading the two index scores separately.', 'market_signal')

  ctx.tools.register(defineTool({
    name: 'market_dashboard',
    description: 'Build the project\'s full daily snapshot in one call: the core CSI 300 and CSI 2000 actions, the next trigger, the satellite opportunity radar, the dragon-head gate, the human-maintained positions, the current plan, the three most recent journal entries, and any degraded data panels. Use this for a daily review or any question that spans several engines. Set record to true only when the user wants the project\'s daily journal and machine-readable record written.',
    parameters: {
      force: { type: 'boolean', description: 'Refetch every series instead of reusing today\'s cache. Defaults to false.' },
      record: { type: 'boolean', description: 'Write the project\'s daily journal and machine-readable record. Defaults to false; ask before writing.' },
      include_history: { type: 'boolean', description: 'Append the three most recent journal entries to the report. Defaults to true.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => {
        const document = value as Record<string, JsonValue>
        const report = document['report_markdown']
        if (typeof report !== 'string') return [{ type: 'text', text: renderFinanceDocument(value) }]
        const warnings = Array.isArray(document['warnings'])
          ? document['warnings'].filter((warning): warning is string => typeof warning === 'string')
          : []
        const prefix = warnings.length === 0 ? '' : `Data warnings:\n${warnings.map(warning => `- ${warning}`).join('\n')}\n\n`
        return [{ type: 'text', text: `${prefix}${report}` }]
      },
      presentationMeta: (_args, value) => chartMeta(value),
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'dashboard',
        arguments: {
          ...args.force === undefined ? {} : { force: args.force },
          ...args.record === undefined ? {} : { record: args.record },
          ...args.include_history === undefined ? {} : { include_history: args.include_history },
        },
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'csi2000_ice_check',
    description: 'Answer the one question the trading brief asks before every market analysis: is the CSI 2000 buy gate open, and if not, which condition is missing? Returns the ETF close, MA10, the three-channel verdict, the position size, the per-condition detail, and the gaps to the trigger. Call this whenever the user asks about timing, buying, or the market stance.',
    parameters: {
      force: { type: 'boolean', description: 'Refetch every series instead of reusing today\'s cache. Defaults to false.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'ice_check',
        arguments: { ...args.force === undefined ? {} : { force: args.force } },
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'opportunity_radar',
    description: 'Scan the satellite ETF pool for the project\'s opportunity layer: R:R, conditional win rate with its Wilson lower bound, EV, suggested position, and the exact conditions a candidate is missing. Also returns the watching list, exits, open satellite positions, and factor-window status. Use it for sector or satellite-ETF questions.',
    parameters: {
      force: { type: 'boolean', description: 'Refetch every series instead of reusing today\'s cache. Defaults to false.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'opportunity_radar',
        arguments: { ...args.force === undefined ? {} : { force: args.force } },
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'dragon_head',
    description: 'Return the latest post-close dragon-head review: the market environment, limit-up sentiment, sector limit-up structure, the final flag, and the tracked candidate ledger. This is a read of the project\'s own review output, not a live scan. Use it for 龙头, 板块, 连板, 情绪, or candidate-pool questions.',
    parameters: {
      as_of: { type: 'string', description: 'Optional YYYY-MM-DD review date. Defaults to the newest daily review.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'dragon_head',
        arguments: { ...args.as_of === undefined ? {} : { as_of: args.as_of } },
      }, exec.signal))
    },
  }))


  ctx.tools.register(defineTool({
    name: 'journal_recent',
    description: 'Read the most recent core trade-journal entries, satellite trade-journal entries, and daily reports. Call this before any analysis that should respect the previous plan, the gap to the trigger, or the last review; report continuity and divergence, not just the current signal. The result is compact Markdown.',
    parameters: {
      limit: { type: 'number', description: 'Maximum records to return, 1-20. Defaults to 5.' },
      kind: { type: 'string', enum: ['all', 'core', 'satellite', 'daily'], description: 'Journal family. Defaults to all.' },
      include_text: { type: 'boolean', description: 'Include the full clipped entry text. Defaults to false.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderJournal(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'journal_recent',
        arguments: {
          ...args.limit === undefined ? {} : { limit: args.limit },
          ...args.kind === undefined ? {} : { kind: args.kind },
          ...args.include_text === undefined ? {} : { include_text: args.include_text },
        },
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'dragon_history',
    description: 'Read the latest N post-close dragon-head reviews, newest first, with the limit-up structure and candidate pool for each day. Use this when the user asks how the dragon gate or the candidate ledger changed across several sessions; dragon_head remains the single latest review.',
    parameters: {
      limit: { type: 'number', description: 'Maximum daily reviews to return, 1-20. Defaults to 5.' },
      as_of: { type: 'string', description: 'Optional YYYY-MM-DD upper bound.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderDragonHistory(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'dragon_history',
        arguments: {
          ...args.limit === undefined ? {} : { limit: args.limit },
          ...args.as_of === undefined ? {} : { as_of: args.as_of },
        },
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'positions_snapshot',
    description: 'Read the human-maintained positions file and the satellite radar state. Call it before any advice that depends on what is held: a cleared position must not receive a trim recommendation, and a new buy is only suggested when the gate opens.',
    parameters: {},
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
    },
    timeoutMs,
    async execute(_args, exec) {
      return toolValue(await finance.invoke({ operation: 'positions', arguments: {} }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'journal_append',
    description: 'Append one analysis entry to the project\'s trade journal. Use kind core for the 沪深300/中证2000 decision journal and satellite for the other-fund journal. Write the entry in the project\'s required format: snapshot, model conclusion, gaps to the trigger, and the operation plan with prices, position, and invalidation. This writes a local file; do it after the analysis, not before.',
    parameters: {
      kind: { type: 'string', enum: ['core', 'satellite'], description: 'Journal to append to. Defaults to core.' },
      entry: { type: 'string', required: true, description: 'Markdown entry to append. Must not be empty.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'journal_append',
        arguments: {
          ...args.kind === undefined ? {} : { kind: args.kind },
          entry: args.entry,
        },
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'strategy_doc',
    description: 'Read one whitelisted StockMarket strategy document: mindset (the scenario-to-mindset map), progress (the model iteration log), or readme (the project overview). Use mindset as an annotation layer only; it never changes a model signal or produces a trade.',
    parameters: {
      name: { type: 'string', enum: ['mindset', 'progress', 'readme'], description: 'Document to read. Defaults to mindset.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await finance.invoke({
        operation: 'strategy_doc',
        arguments: { ...args.name === undefined ? {} : { name: args.name } },
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'macro_snapshot',
    description: 'Return the latest aligned macro row and recent history: USD/CNY and JPY/CNY, China and US bond yields with their spreads, gold, China CPI, PPI, PMI, M1, M2, social financing, retail sales, real estate, margin balance, new accounts, and the Fed rate. Also returns the CSI 300 PE/PB valuation and the 10-year treasury yield used by the equity risk premium dimension.',
    parameters: {},
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderFinanceDocument(value) }],
    },
    timeoutMs,
    async execute(_args, exec) {
      return toolValue(await finance.invoke({ operation: 'macro_snapshot', arguments: {} }, exec.signal))
    },
  }))
}

/**
 * Mount the finance tools over the deployment's `ctx.finance` provider.
 * @param ctx - context carrying the tool registry and the capability.
 * @param config - the per-call timeout budget.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  registerFinanceTools(ctx, ctx.finance, (config as Required<Config>).timeoutMs)
}
