/**
 * Behaviour of the finance capability: config validation, the Python-backed
 * provider over a recorded subprocess boundary, and every model-facing tool's
 * argument mapping and model-visible output. The provider and the tools are two
 * entries of one package, so each suite mounts the entry it exercises.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FinanceLocal from '@deepseek-ai/dsh-finance-local'
import * as FinanceTools from '@deepseek-ai/dsh-finance-local/tools'
import { decodeBridgeResponse, type Config } from '@deepseek-ai/dsh-finance-local'
import { MAX_CHART_POINTS, MAX_CHART_SERIES, readFinanceCharts } from '../src/charts.ts'
import { applyFinanceProjection, financeProjectionDefinition } from '../src/projection.ts'

/** One canned bridge process the fake spawner returns. */
interface FakeProcess {
  /** Complete stdout text; omitted entirely when `omitStdout` is set. */
  stdout?: string
  /** Complete stderr text. */
  stderr?: string
  /** Exit code reported by `done`. */
  exitCode?: number | null
  /** Terminating signal reported by `done`. */
  signal?: NodeJS.Signals | null
  /** Whether a read from offset 0 slides out of the retained window. */
  lossy?: boolean
  /** Omit the stdout reader entirely (a process with no collected stdout). */
  omitStdout?: boolean
  /** Leave the process running until its spec signal fires. */
  hang?: boolean
}

const roots: string[] = []

/** The provider's two required deployment paths, as the layout supplies them. */
type ProviderPaths = Required<Pick<Config, 'stockMarketPython' | 'stockMarketRoot'>>

/** One throwaway deployment layout: an interpreter and a project directory. */
interface Layout {
  readonly root: string
  readonly stockPython: string
  readonly stockRoot: string
  readonly config: ProviderPaths
}

function layout(): Layout {
  const root = mkdtempSync(join(tmpdir(), 'dsh-finance-'))
  roots.push(root)
  const stockRoot = join(root, 'stock')
  mkdirSync(join(stockRoot, 'data'), { recursive: true })
  writeFileSync(join(stockRoot, 'data', 'fetcher.py'), '')
  const stockPython = join(root, 'stock-python')
  writeFileSync(stockPython, '#!/bin/sh\n')
  chmodSync(stockPython, 0o755)
  return {
    root,
    stockPython,
    stockRoot,
    config: { stockMarketPython: stockPython, stockMarketRoot: stockRoot },
  }
}

/** A `SubprocessHandle` over canned output that settles when its spec signal aborts. */
function fakeHandle(process: FakeProcess, signal?: AbortSignal): SubprocessHandle {
  let settle!: (outcome: SubprocessOutcome) => void
  const done = new Promise<SubprocessOutcome>((resolve) => { settle = resolve })
  const terminate = (): void => { settle({ exitCode: process.exitCode ?? null, signal: process.signal ?? 'SIGTERM' }) }
  signal?.addEventListener('abort', terminate, { once: true })
  if (process.hang !== true) settle({ exitCode: process.exitCode ?? 0, signal: process.signal ?? null })
  const reader = (text: string, lossy: boolean) => ({
    readFrom: () => ({ text, nextOffset: Buffer.byteLength(text), lossy }),
  })
  return {
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    control: undefined,
    collected: {
      ...process.omitStdout === true ? {} : { stdout: reader(process.stdout ?? '', process.lossy ?? false) },
      stderr: reader(process.stderr ?? '', false),
    },
    done,
    terminate,
    waitForExit: () => Promise.resolve(true),
  }
}

/** One recorded spawn: the spec fields this provider sets, plus its decoded stdin request. */
type RecordedSpawn = Pick<SubprocessSpawnSpec, 'argv' | 'cwd' | 'env'> & {
  request?: { operation?: string; arguments?: unknown }
}

const specs: RecordedSpawn[] = []
let queue: FakeProcess[] = []

/**
 * Boot the capability over a throwaway layout. The tools entry is what registers
 * schemas, so every suite that calls a tool mounts both package entries.
 * @param config - provider config overrides.
 * @param tools - whether to mount the model-facing tools entry as well.
 */
async function boot(
  config: Partial<Config> = {},
  tools = true,
): Promise<{ ctx: Context; paths: Layout }> {
  const paths = layout()
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SessionProjection)
  await ctx.plugin(LocalSubprocessRuntime)
  vi.spyOn(ctx.subprocess, 'spawn').mockImplementation((spec) => {
    const stdin = spec.stdio.stdin as { data: string }
    specs.push({ argv: spec.argv, cwd: spec.cwd, env: spec.env, request: JSON.parse(stdin.data) as never })
    return fakeHandle(queue.shift() ?? {}, spec.signal)
  })
  await ctx.plugin(FinanceLocal, { ...paths.config, ...config })
  if (tools) await ctx.plugin(FinanceTools, {})
  return { ctx, paths }
}

/** Execute one registered tool and return its model-facing text. */
async function call(ctx: Context, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const result = await execute(ctx, name, args)
  return {
    isError: result.isError,
    text: result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join(''),
  }
}

/** Execute one registered tool and return its whole execution-local result. */
async function execute(ctx: Context, name: string, args: Record<string, unknown>) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`call-${name}`),
    name,
    arguments: args,
  })
}

/** A success response for one operation, with an optional chart payload. */
function success(
  operation: string,
  document: Record<string, unknown> = {},
  warnings: string[] = [],
  charts?: unknown,
): FakeProcess {
  return {
    stdout: JSON.stringify({
      ok: true,
      operation,
      document,
      warnings,
      ...charts === undefined ? {} : { charts },
    }),
  }
}

beforeEach(() => {
  specs.length = 0
  queue = []
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('finance-local provider config', () => {
  /** Boot the provider over a fresh dependency tree and return its load failure. */
  async function loadFailure(config: ProviderPaths): Promise<string> {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SessionProjection)
    await ctx.plugin(LocalSubprocessRuntime)
    try {
      await ctx.plugin(FinanceLocal, config)
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    throw new Error('expected the finance plugin to fail loading')
  }

  /** Fresh dependency tree for one load attempt. */
  async function dependencyTree(): Promise<Context> {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SessionProjection)
    await ctx.plugin(LocalSubprocessRuntime)
    return ctx
  }

  it('provides the capability and registers no tool on its own', async () => {
    const { ctx } = await boot({}, false)
    expect(ctx.finance).toBeInstanceOf(FinanceLocal.FinanceRuntime)
    expect(ctx.tools.schemas()).toEqual([])
  })

  it('registers the expanded StockMarket tools from the tools entry', async () => {
    const { ctx } = await boot()
    expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual([
      'csi2000_analysis',
      'csi2000_ice_check',
      'csi300_analysis',
      'dragon_head',
      'dragon_history',
      'dragon_track',
      'journal_append',
      'journal_recent',
      'macro_snapshot',
      'market_dashboard',
      'market_data_refresh',
      'market_timing_signal',
      'opportunity_radar',
      'positions_snapshot',
      'strategy_doc',
      'strategy_recent',
    ])
  })

  it('fails loading when a required path is absent, not a file, or not the expected project', async () => {
    const paths = layout()
    const cases: readonly { readonly patch: Partial<ProviderPaths>; readonly failure: RegExp }[] = [
      { patch: { stockMarketPython: join(paths.root, 'missing') }, failure: /stockMarketPython does not exist/ },
      { patch: { stockMarketPython: paths.stockRoot }, failure: /stockMarketPython is not a regular file/ },
      { patch: { stockMarketRoot: join(paths.root, 'missing') }, failure: /stockMarketRoot is not a directory/ },
      { patch: { stockMarketRoot: paths.root }, failure: /stockMarketRoot is not the expected project/ },
    ]
    for (const { patch, failure } of cases) {
      expect(await loadFailure({ ...paths.config, ...patch })).toMatch(failure)
    }
  })

  it('fails loading when the interpreter lacks the execute bit', async () => {
    const paths = layout()
    chmodSync(paths.stockPython, 0o644)
    expect(await loadFailure(paths.config)).toMatch(/stockMarketPython is not executable/)
  })

  it('requires every path in the schema', async () => {
    const ctx = await dependencyTree()
    let failure: unknown
    try {
      await ctx.plugin(FinanceLocal, {} as Config)
    } catch (error) {
      failure = error
    }
    expect(String(failure)).toMatch(/stockMarketPython/)
  })

  it('removes the service when the provider fiber disposes', async () => {
    const paths = layout()
    const ctx = await dependencyTree()
    const fiber = await ctx.plugin(FinanceLocal, paths.config)
    expect(ctx.get('finance')).toBeDefined()
    await fiber.dispose()
    expect(ctx.get('finance')).toBeUndefined()
  })

  it('removes every tool when the tools fiber disposes', async () => {
    const paths = layout()
    const ctx = await dependencyTree()
    await ctx.plugin(FinanceLocal, paths.config)
    const fiber = await ctx.plugin(FinanceTools, {})
    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('csi300_analysis')
    await fiber.dispose()
    expect(ctx.tools.schemas().map(schema => schema.name)).not.toContain('csi300_analysis')
  })
})

describe('decodeBridgeResponse', () => {
  it('accepts the bridge success object and drops non-string warnings', () => {
    expect(decodeBridgeResponse('{"ok":true,"document":{"a":1},"warnings":["x",7]}', 'csi300_analysis'))
      .toEqual({
        operation: 'csi300_analysis',
        document: { a: 1 },
        warnings: ['x'],
        charts: { version: 1, series: [] },
      })
  })

  it('defaults a success object with no warnings array', () => {
    expect(decodeBridgeResponse('{"ok":true,"document":{}}', 'refresh'))
      .toEqual({ operation: 'refresh', document: {}, warnings: [], charts: { version: 1, series: [] } })
  })

  it('carries the response chart payload into the outcome', () => {
    const response = JSON.stringify({
      ok: true,
      document: {},
      charts: { version: 1, series: [{ id: 'price', kind: 'line', dates: ['2026-09-21'], columns: { close: [1] } }] },
    })
    expect(decodeBridgeResponse(response, 'csi300_analysis').charts.series).toEqual([
      { id: 'price', kind: 'line', dates: ['2026-09-21'], columns: { close: [1] } },
    ])
  })

  it('rejects malformed JSON, non-objects, failures, and a missing document', () => {
    expect(() => decodeBridgeResponse('not json', 'refresh')).toThrow(/malformed JSON/)
    expect(() => decodeBridgeResponse('[]', 'refresh')).toThrow(/not a JSON object/)
    expect(() => decodeBridgeResponse('{"ok":false,"error":"boom"}', 'refresh')).toThrow(/refresh: boom/)
    expect(() => decodeBridgeResponse('{"ok":false}', 'refresh')).toThrow(/no error detail/)
    expect(() => decodeBridgeResponse('{"ok":true}', 'refresh')).toThrow(/no document object/)
  })
})

describe('readFinanceCharts', () => {
  /** One aligned series payload with the given overrides. */
  function series(over: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: 'price', kind: 'line', dates: ['2026-09-18', '2026-09-21'], columns: { close: [1, 2] }, ...over }
  }

  it('reads an aligned series and keeps its null gaps', () => {
    const payload = readFinanceCharts({ version: 1, series: [series({ columns: { close: [1, null] } })] })
    expect(payload).toEqual({
      version: 1,
      series: [{ id: 'price', kind: 'line', dates: ['2026-09-18', '2026-09-21'], columns: { close: [1, null] } }],
    })
  })

  it('reads a bar series on its category axis, reference included', () => {
    const bars = { id: 'percentiles', kind: 'bar', categories: ['pe', 'pb'], columns: { value: [0.5, 0.6] }, reference: 0.5 }
    expect(readFinanceCharts({ version: 1, series: [bars] })).toEqual({
      version: 1,
      series: [{ id: 'percentiles', kind: 'bar', categories: ['pe', 'pb'], columns: { value: [0.5, 0.6] }, reference: 0.5 }],
    })
  })

  it('reads a bar series that names no reference, and drops an unusable one', () => {
    const named = { id: 'percentiles', kind: 'bar', categories: ['pe'], columns: { value: [0.5] } }
    expect(readFinanceCharts({ version: 1, series: [named] }).series[0]).toEqual(named)
    const unusable = { ...named, reference: 'median' }
    expect(readFinanceCharts({ version: 1, series: [unusable] }).series[0]).toEqual(named)
  })

  it('drops a bar series without a value column and one whose category axis is unusable', () => {
    const noValue = { id: 'percentiles', kind: 'bar', categories: ['pe'], columns: { pe: [0.5] } }
    expect(readFinanceCharts({ version: 1, series: [noValue] }).series).toEqual([])
    const noAxis = { id: 'percentiles', kind: 'bar', categories: [], columns: { value: [0.5] } }
    expect(readFinanceCharts({ version: 1, series: [noAxis] }).series).toEqual([])
    const brokenAxis = { id: 'percentiles', kind: 'bar', categories: [7], columns: { value: [0.5] } }
    expect(readFinanceCharts({ version: 1, series: [brokenAxis] }).series).toEqual([])
  })

  it('reads a candlestick series that carries every bar column', () => {
    const candlestick = series({ kind: 'candlestick', columns: { open: [1, 2], high: [3, 4], low: [0, 1], close: [2, 3] } })
    expect(readFinanceCharts({ version: 1, series: [candlestick] }).series).toHaveLength(1)
  })

  it('drops a candlestick series missing a bar column', () => {
    const candlestick = series({ kind: 'candlestick', columns: { open: [1, 2], high: [3, 4], low: [0, 1] } })
    expect(readFinanceCharts({ version: 1, series: [candlestick] }).series).toEqual([])
  })

  it('drops a column that does not align with the series date axis', () => {
    const payload = readFinanceCharts({ version: 1, series: [series({ columns: { close: [1], pe: [1, 2] } })] })
    expect(payload.series[0]?.columns).toEqual({ pe: [1, 2] })
  })

  it('drops a column carrying a value that is neither a number nor null', () => {
    expect(readFinanceCharts({ version: 1, series: [series({ columns: { close: [1, '2'] } })] }).series).toEqual([])
  })

  it('drops a series whose columns are not an object', () => {
    expect(readFinanceCharts({ version: 1, series: [series({ columns: 7 })] }).series).toEqual([])
  })

  it('drops a series with no surviving column', () => {
    expect(readFinanceCharts({ version: 1, series: [series({ columns: {} })] }).series).toEqual([])
  })

  it('drops a series whose identity or kind is not one the payload defines', () => {
    const payload = { version: 1, series: [series({ id: '' }), series({ id: 7 }), series({ kind: 'bars' }), 7] }
    expect(readFinanceCharts(payload).series).toEqual([])
  })

  it('drops a series whose dates are not a non-empty string axis', () => {
    const payload = { version: 1, series: [series({ dates: [] }), series({ dates: '2026-09-21' }), series({ dates: [7] })] }
    expect(readFinanceCharts(payload).series).toEqual([])
  })

  it('keeps only the most recent points of an over-long series', () => {
    const dates = Array.from({ length: MAX_CHART_POINTS + 1 }, (_, index) => `d${String(index)}`)
    const payload = readFinanceCharts({
      version: 1,
      series: [series({ dates, columns: { close: dates.map((_, index) => index) } })],
    })
    const [first] = payload.series
    const axis = first !== undefined && first.kind !== 'bar' ? first.dates : []
    expect(axis).toHaveLength(MAX_CHART_POINTS)
    expect(axis[0]).toBe('d1')
  })

  it('keeps only the leading series of an over-long payload', () => {
    const seriesList = Array.from({ length: MAX_CHART_SERIES + 1 }, (_, index) => series({ id: `s${String(index)}` }))
    expect(readFinanceCharts({ version: 1, series: seriesList }).series).toHaveLength(MAX_CHART_SERIES)
  })

  it('yields no series for a payload of an unknown revision or no series list', () => {
    expect(readFinanceCharts({ version: 9, series: [series()] }).series).toEqual([])
    expect(readFinanceCharts({ version: 1, series: 'price' }).series).toEqual([])
    expect(readFinanceCharts(null).series).toEqual([])
    expect(readFinanceCharts([]).series).toEqual([])
  })
})


describe('history tools', () => {
  it('maps journal_recent arguments and renders the compact journal Markdown', async () => {
    const { ctx } = await boot()
    queue = [success('journal_recent', {
      entries: [{ kind: 'core', date: '2026-10-23', summary: '空仓观望' }],
      journal_markdown: '- **2026-10-23 · 核心**：空仓观望\n  - 计划：等 MA10',
    })]
    const result = await call(ctx, 'journal_recent', { limit: 3, kind: 'core' })
    expect(result.isError).toBe(false)
    expect(specs[0]?.request).toMatchObject({ operation: 'journal_recent', arguments: { limit: 3, kind: 'core' } })
    expect(result.text).toContain('2026-10-23 · 核心')
    expect(result.text).toContain('计划：等 MA10')
  })

  it('maps dragon_track and renders the horizon aggregates', async () => {
    const { ctx } = await boot()
    queue = [success('dragon_track', {
      rows: [{ signal_date: '2026-10-20', name: '移远通信', code: '603236', t1_ret: 0.0733, t3_ret: 0.0351, status: 'tracking' }],
      stats: { t1: { n: 14, win_rate: 0.6429, mean: 0.0189, by_source: { review: { n: 13, win_rate: 0.6923, mean: 0.0234 } } } },
    })]
    const result = await call(ctx, 'dragon_track', { limit: 5 })
    expect(result.isError).toBe(false)
    expect(specs[0]?.request).toMatchObject({ operation: 'dragon_track', arguments: { limit: 5 } })
    expect(result.text).toContain('可买 14 只')
    expect(result.text).toContain('64%')
    expect(result.text).toContain('移远通信(603236)')
  })

  it('maps strategy_recent and renders the iteration notes', async () => {
    const { ctx } = await boot()
    queue = [success('strategy_recent', {
      updated_at: '2026-10-20',
      markdown: '最后更新：2026-10-20\n- **2026-10-23 · 迭代笔记**：统一龙头',
    })]
    const result = await call(ctx, 'strategy_recent', { limit: 2 })
    expect(result.isError).toBe(false)
    expect(specs[0]?.request).toMatchObject({ operation: 'strategy_recent', arguments: { limit: 2 } })
    expect(result.text).toContain('2026-10-23')
    expect(result.text).toContain('统一龙头')
  })

  it('maps dragon_history arguments and renders each review as one line', async () => {
    const { ctx } = await boot()
    queue = [success('dragon_history', {
      entries: [{
        date: '2026-10-23',
        env: { strong: false },
        sentiment: { limitup_total: 77, broken: 12, max_streak: 6 },
        candidates: [{ code: '002181', name: '粤传媒' }],
      }],
    })]
    const result = await call(ctx, 'dragon_history', { limit: 3 })
    expect(result.isError).toBe(false)
    expect(specs[0]?.request).toMatchObject({ operation: 'dragon_history', arguments: { limit: 3 } })
    expect(result.text).toContain('2026-10-23')
    expect(result.text).toContain('龙头闸门否决')
    expect(result.text).toContain('粤传媒(002181)')
  })

  it('passes include_history to the dashboard', async () => {
    const { ctx } = await boot()
    queue = [success('dashboard', { report_markdown: '# 日报' })]
    const result = await call(ctx, 'market_dashboard', { include_history: false })
    expect(result.isError).toBe(false)
    expect(specs[0]?.request).toMatchObject({ operation: 'dashboard', arguments: { include_history: false } })
    expect(result.text).toContain('# 日报')
  })
})

describe('finance-local provider', () => {
  it('runs an operation under the StockMarket interpreter in the project root', async () => {
    const { ctx, paths } = await boot()
    queue = [success('csi300_analysis', { index: '沪深300', total_score: 42 }, ['stale cache'])]
    const result = await call(ctx, 'csi300_analysis', {})
    expect(result.isError).toBe(false)
    expect(specs).toHaveLength(1)
    expect(specs[0]?.argv[0]).toBe(paths.stockPython)
    expect(specs[0]?.argv[1]).toMatch(/python\/finance_bridge\.py$/)
    expect(specs[0]?.cwd).toBe(paths.stockRoot)
    expect(specs[0]?.env?.['DSH_FINANCE_STOCK_MARKET_ROOT']).toBe(paths.stockRoot)
    expect(result.text).toContain('Data warnings:\n- stale cache')
    expect(result.text).toContain('"total_score": 42')
  })

  it('omits an empty warning list from the model-facing text', async () => {
    const { ctx } = await boot()
    queue = [success('macro_snapshot', { latest: { usd_cny: 7.1 } })]
    const result = await call(ctx, 'macro_snapshot', {})
    expect(result.text).not.toContain('Data warnings')
    expect(result.text).toContain('"usd_cny": 7.1')
  })

  it('renders a document that carries no warnings array at all', () => {
    expect(FinanceTools.renderFinanceDocument({ total_score: 1 }))
      .toBe('```json\n{\n  "total_score": 1\n}\n```')
  })

  it('renders a non-string warning as JSON rather than as an object tag', () => {
    // The canonical value's element type is `JsonValue`; the bridge produces
    // strings, and anything else still has to read as data to the model.
    expect(FinanceTools.renderFinanceDocument({ warnings: [{ code: 'stale' }, 7] }))
      .toBe('Data warnings:\n- {"code":"stale"}\n- 7\n\n```json\n{}\n```')
  })

  it('keeps the chart payload out of the model-facing text', async () => {
    const { ctx } = await boot()
    queue = [success(
      'csi300_analysis',
      { total_score: 55 },
      [],
      { version: 1, series: [{ id: 'price', kind: 'line', dates: ['2026-09-21'], columns: { close: [4539.565] } }] },
    )]
    const result = await call(ctx, 'csi300_analysis', {})
    expect(result.text).toContain('"total_score": 55')
    expect(result.text).not.toContain('charts')
    expect(result.text).not.toContain('4539.565')
  })

  it('publishes the narrowed chart payload as the result presentation metadata', async () => {
    const { ctx } = await boot()
    queue = [success(
      'csi300_analysis',
      {},
      [],
      {
        version: 1,
        series: [
          { id: 'price', kind: 'candlestick', dates: ['2026-09-21'], columns: { open: [1], high: [2], low: [0], close: [1.5] } },
          { id: 'broken', kind: 'line', dates: ['2026-09-21'], columns: { close: 'no' } },
        ],
      },
    )]
    const result = await execute(ctx, 'csi300_analysis', {})
    expect(result.meta).toEqual({
      version: 1,
      series: [{ id: 'price', kind: 'candlestick', dates: ['2026-09-21'], columns: { open: [1], high: [2], low: [0], close: [1.5] } }],
    })
  })

  it('publishes an empty payload when the bridge sent no readable chart data', async () => {
    const { ctx } = await boot()
    queue = [success('market_timing_signal', { signal: {} }, [], { version: 4 })]
    const result = await execute(ctx, 'market_timing_signal', {})
    expect(result.meta).toEqual({ version: 1, series: [] })
  })

  it('publishes no presentation metadata for an operation without a chart', async () => {
    const { ctx } = await boot()
    queue = [success('market_data_refresh', { force: false })]
    const result = await execute(ctx, 'market_data_refresh', {})
    expect(result.meta).toBeUndefined()
  })

  it('fails the call when the bridge exits non-zero, with its stderr as the detail', async () => {
    const { ctx } = await boot()
    queue = [{ exitCode: 1, stderr: 'ImportError: akshare missing' }]
    const result = await call(ctx, 'csi300_analysis', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('ImportError: akshare missing')
  })

  it('fails the call when the bridge dies from a signal and reports it without stderr', async () => {
    const { ctx } = await boot()
    queue = [{ exitCode: null, signal: 'SIGKILL' }]
    const result = await call(ctx, 'csi2000_analysis', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('SIGKILL')
  })

  it('fails the call when the response exceeds the document bound', async () => {
    const { ctx } = await boot()
    queue = [{ stdout: '{"ok":true,"document":{}}', lossy: true }]
    const result = await call(ctx, 'market_timing_signal', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('response exceeded 8388608 bytes')
  })

  it('fails the call when the process produced no stdout', async () => {
    const { ctx } = await boot()
    queue = [{ omitStdout: true }]
    const result = await call(ctx, 'market_data_refresh', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('produced no stdout')
  })

  it('fails the call when the bridge reports its own failure', async () => {
    const { ctx } = await boot()
    queue = [{ stdout: '{"ok":false,"error":"KeyError: date"}' }]
    const result = await call(ctx, 'macro_snapshot', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('KeyError: date')
  })

  it('fails the call when the bridge returns malformed JSON', async () => {
    const { ctx } = await boot()
    queue = [{ stdout: 'not json' }]
    const result = await call(ctx, 'csi2000_analysis', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('malformed JSON')
  })

  it('aborts a runaway bridge on its own deadline', async () => {
    const { ctx } = await boot({ timeoutMs: 5 })
    queue = [{ hang: true }]
    const result = await call(ctx, 'market_data_refresh', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('exceeded 5 ms')
  })

  it('reports caller cancellation rather than a generic exit', async () => {
    const { ctx } = await boot()
    queue = [{ hang: true }]
    const controller = new AbortController()
    const pending = ctx.tools.execute({
      signal: controller.signal,
      callId: ToolCallId('cancel'),
      name: 'csi300_analysis',
      arguments: {},
    })
    // Let the registry dispatch the call so the abort reaches a running bridge
    // rather than the pre-dispatch guard.
    await new Promise(resolve => setTimeout(resolve, 0))
    controller.abort()
    const result = await pending
    expect(result.isError).toBe(true)
    expect(result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join(''))
      .toContain('cancelled')
  })
})

describe('finance-local tool arguments', () => {
  it('passes the refresh force flag through', async () => {
    const { ctx } = await boot()
    queue = [success('refresh', { force: true }), success('refresh', {})]
    await call(ctx, 'market_data_refresh', { force: true })
    await call(ctx, 'market_data_refresh', {})
    expect(specs[0]?.request).toEqual({ operation: 'refresh', arguments: { force: true } })
    expect(specs[1]?.request).toEqual({ operation: 'refresh', arguments: {} })
  })

  it('sends the composed operation name for the timing tool', async () => {
    const { ctx } = await boot()
    queue = [success('market_signal', { signal: {} })]
    const result = await call(ctx, 'market_timing_signal', {})
    expect(result.isError).toBe(false)
    expect(specs[0]?.request).toEqual({ operation: 'market_signal', arguments: {} })
  })

  it('renders every tool document as a JSON block', async () => {
    const { ctx } = await boot()
    const names = [
      'market_data_refresh',
      'csi300_analysis',
      'csi2000_analysis',
      'market_timing_signal',
      'macro_snapshot',
    ]
    queue = names.map(name => success(name, { tool: name }))
    for (const name of names) {
      const result = await call(ctx, name, {})
      expect(result.isError).toBe(false)
      expect(result.text).toContain('```json')
      expect(result.text).toContain(`"tool": "${name}"`)
    }
  })
})

describe('finance projection', () => {
  /** One chart payload as the bridge publishes it. */
  const payload = {
    version: 1,
    series: [{ id: 'price', kind: 'line', dates: ['2026-09-22'], columns: { close: [4544.588] } }],
  }

  /** The event type the fold consumes, derived so the spec names no session type. */
  type Committed = Parameters<typeof applyFinanceProjection>[1]

  /** One committed event shaped like the fold's input. */
  function committed(over: { type?: string; meta?: unknown; turn?: number } = {}): Committed {
    return {
      seq: 9,
      time: 1,
      type: over.type ?? 'tool/result',
      data: {
        turn: over.turn ?? 4,
        step: 0,
        message: { content: [] },
        ...over.meta === undefined ? {} : { meta: over.meta },
      },
    } as unknown as Committed
  }

  it('starts empty and folds a published payload with its turn and seq', () => {
    expect(financeProjectionDefinition.init()).toEqual({
      current: { charts: null, turn: null, seq: null },
    })
    const state = applyFinanceProjection(financeProjectionDefinition.init(), committed({ meta: payload }))
    expect(state.current.turn).toBe(4)
    expect(state.current.seq).toBe(9)
    expect(state.current.charts?.series).toHaveLength(1)
  })

  it('keeps the same state reference for an event that publishes no series', () => {
    const start = financeProjectionDefinition.init()
    expect(applyFinanceProjection(start, committed({ type: 'user/message' }))).toBe(start)
    expect(applyFinanceProjection(start, committed())).toBe(start)
    expect(applyFinanceProjection(start, committed({ meta: { version: 1, series: [] } }))).toBe(start)
    expect(applyFinanceProjection(start, committed({ meta: 'not a payload' }))).toBe(start)
  })

  it('keeps the newest payload when a later result publishes another', () => {
    const first = applyFinanceProjection(financeProjectionDefinition.init(), committed({ meta: payload, turn: 4 }))
    const grown = [...payload.series, payload.series[0]]
    const second = applyFinanceProjection(first, committed({ meta: { ...payload, series: grown }, turn: 5 }))
    expect(second.current.turn).toBe(5)
    expect(second.current.charts?.series).toHaveLength(2)
  })

  it('validates the value it publishes and the state it folds', () => {
    const value = financeProjectionDefinition.wire.view({ current: { charts: payload, turn: 4, seq: 9 } } as never)
    expect(financeProjectionDefinition.wire.viewSchema.parse(value)).toEqual(value)
    expect(financeProjectionDefinition.wire.viewSchema.safeParse({ charts: { version: 'x' }, turn: 4, seq: 9 }).success).toBe(false)
    expect(financeProjectionDefinition.stateSchema.safeParse({ current: value }).success).toBe(true)
    expect(financeProjectionDefinition.stateSchema.safeParse({ current: value, extra: 1 }).success).toBe(false)
    expect(financeProjectionDefinition.wire.viewSchema.safeParse({
      charts: { version: 1, series: [{ id: 'percentiles', kind: 'bar', categories: ['pe'], columns: { value: [0.5] }, reference: 0.5 }] },
      turn: null,
      seq: null,
    }).success).toBe(true)
  })

  it('registers the unit on the session projection registry', async () => {
    const paths = layout()
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SessionProjection)
    await ctx.plugin(LocalSubprocessRuntime)
    const register = vi.spyOn(ctx.sessionProjections, 'register')
    const fiber = await ctx.plugin(FinanceLocal, paths.config)
    expect(register).toHaveBeenCalledWith(financeProjectionDefinition)
    await fiber.dispose()
  })
})
