/**
 * Generic A-share market overview over free Sina Finance data. The tools are
 * deliberately index-level: they describe the market's level, trend, and
 * breadth without pretending to be a stock picker or an investment adviser.
 *
 * @module @deepseek-ai/dsh-market-local/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'market-tools'

/** The registry these tools register into. */
export const inject = ['tools']

/** One index the overview covers. */
interface IndexDef {
  readonly name: string
  readonly symbol: string
}

const INDICES: readonly IndexDef[] = [
  { name: '上证指数', symbol: 'sh000001' },
  { name: '深证成指', symbol: 'sz399001' },
  { name: '创业板指', symbol: 'sz399006' },
  { name: '沪深300', symbol: 'sh000300' },
  { name: '中证500', symbol: 'sh000905' },
  { name: '中证1000', symbol: 'sh000852' },
]

const HEADERS = {
  Referer: 'https://finance.sina.com.cn/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
}

const TIMEOUT_MS = 60_000

/** One daily bar from Sina. */
interface Bar {
  readonly date: string
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number
}

/** One covered index's computed reading. */
interface IndexReading {
  readonly name: string
  readonly symbol: string
  readonly date: string
  readonly close: number
  readonly change: number
  readonly changePct: number
  readonly ma5: number
  readonly ma10: number
  readonly ma20: number
  readonly ma60: number
  readonly aboveMa20: boolean
  readonly aboveMa60: boolean
  readonly ret5: number
  readonly ret20: number
  readonly retYtd: number
  readonly volumeRatio: number
  readonly high20: number
  readonly low20: number
}

/** Decode the GBK quote payload Sina serves for Chinese names. */
async function gbk(response: Response): Promise<string> {
  return new TextDecoder('gbk').decode(await response.arrayBuffer())
}

/** Fetch one day's index quote. */
async function quote(symbol: string): Promise<{ price: number; change: number; pct: number } | null> {
  const response = await fetch(`https://hq.sinajs.cn/list=s_${symbol}`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) return null
  const text = await gbk(response)
  const match = /="([^"]*)"/u.exec(text)
  if (match === null) return null
  const fields = (match[1] ?? '').split(',')
  const price = Number(fields[1])
  const change = Number(fields[2])
  const pct = Number(fields[3])
  return Number.isFinite(price) && price > 0
    ? { price, change: Number.isFinite(change) ? change : 0, pct: Number.isFinite(pct) ? pct : 0 }
    : null
}

/** Fetch the last 260 daily bars for one index. */
async function bars(symbol: string): Promise<Bar[]> {
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=260`
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Sina K-line HTTP ${String(response.status)}`)
  const parsed: unknown = await response.json()
  if (!Array.isArray(parsed)) throw new Error('Sina K-line returned no array')
  return parsed.flatMap((item): Bar[] => {
    if (typeof item !== 'object' || item === null) return []
    const row = item as Record<string, unknown>
    const date = typeof row['day'] === 'string' ? row['day'] : ''
    const close = Number(row['close'])
    const open = Number(row['open'])
    const high = Number(row['high'])
    const low = Number(row['low'])
    const volume = Number(row['volume'])
    return date !== '' && Number.isFinite(close) && Number.isFinite(open)
      && Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(volume)
      ? [{ date, open, high, low, close, volume }]
      : []
  })
}

const avg = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length
const ret = (values: readonly number[], span: number): number =>
  values.length <= span
    ? 0
    : (values[values.length - 1] as number) / (values[values.length - 1 - span] as number) - 1
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`

/** Compute one index's structure from its bars. */
function reading(
  name: string,
  symbol: string,
  data: readonly Bar[],
  q: { price: number; change: number; pct: number } | null,
): IndexReading {
  const closes = data.map(bar => bar.close)
  const volumes = data.map(bar => bar.volume)
  const last = data[data.length - 1] as Bar
  const close = q?.price ?? last.close
  const year = last.date.slice(0, 4)
  const firstOfYear = data.find(bar => bar.date.startsWith(year)) ?? data[0]
  const volumeBase = avg(volumes.slice(Math.max(0, volumes.length - 21), -1))
  const high20 = Math.max(...data.slice(-20).map(bar => bar.high))
  const low20 = Math.min(...data.slice(-20).map(bar => bar.low))
  const ma20 = avg(closes.slice(-20))
  const ma60 = avg(closes.slice(-60))
  return {
    name, symbol, date: last.date, close,
    change: q?.change ?? close - (closes[closes.length - 2] ?? close),
    changePct: q === null ? (closes.length < 2 ? 0 : (close / (closes[closes.length - 2] as number) - 1) * 100) : q.pct,
    ma5: avg(closes.slice(-5)), ma10: avg(closes.slice(-10)), ma20, ma60,
    aboveMa20: close >= ma20, aboveMa60: close >= ma60,
    ret5: ret(closes, 5), ret20: ret(closes, 20),
    retYtd: firstOfYear === undefined ? 0 : close / firstOfYear.close - 1,
    volumeRatio: volumeBase === 0 ? 0 : (volumes[volumes.length - 1] as number) / volumeBase,
    high20, low20,
  }
}

/** Shared fact set for both tools. */
async function overview(): Promise<{ asOf: string; indices: IndexReading[]; warnings: string[] }> {
  const warnings: string[] = []
  const results = await Promise.all(INDICES.map(async (index): Promise<IndexReading | null> => {
    try {
      const [data, q] = await Promise.all([bars(index.symbol), quote(index.symbol)])
      if (data.length < 60) {
        warnings.push(`${index.name}: K-line only ${String(data.length)} rows`)
        return null
      }
      return reading(index.name, index.symbol, data, q)
    } catch (error) {
      warnings.push(`${index.name}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }))
  const indices = results.filter((item): item is IndexReading => item !== null)
  if (indices.length === 0) throw new Error('Sina returned no readable index data')
  return { asOf: indices.map(index => index.date).sort().at(-1) ?? '', indices, warnings }
}

/** One compact summary sentence shared by the card and the model. */
function summary(indices: readonly IndexReading[]): string {
  const above20 = indices.filter(index => index.aboveMa20).length
  const above60 = indices.filter(index => index.aboveMa60).length
  const average = indices.reduce((sum, index) => sum + index.changePct, 0) / indices.length
  const sorted = [...indices].sort((a, b) => b.changePct - a.changePct)
  const best = sorted[0] as IndexReading
  const worst = sorted[sorted.length - 1] as IndexReading
  return [
    `${String(indices.length)} 个指数中 ${String(above20)} 个站上 MA20、${String(above60)} 个站上 MA60；`,
    `平均涨跌 ${average.toFixed(2)}%。最强 ${best.name} ${best.changePct.toFixed(2)}%，`,
    `最弱 ${worst.name} ${worst.changePct.toFixed(2)}%。`,
  ].join('')
}

/** Model-facing table. */
function renderOverview(value: Record<string, JsonValue>): string {
  const indices = Array.isArray(value['indices']) ? value['indices'] : []
  const warnings = Array.isArray(value['warnings']) ? value['warnings'] : []
  const lines = [
    '## A 股大盘概览', '',
    `数据日期：${String(value['as_of'] ?? '—')} · 来源：新浪财经`, '',
    String(value['summary'] ?? ''), '',
    '| 指数 | 收盘 | 日涨跌 | 20日 | 年初至今 | MA20 | MA60 | 量比 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ]
  for (const item of indices) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as Record<string, JsonValue>
    const num = (key: string): number => typeof row[key] === 'number' ? row[key] as number : 0
    const flag = (key: string): string => row[key] === true ? '上方' : '下方'
    lines.push([
      `| ${String(row['name'] ?? '')} | ${num('close').toFixed(2)} | ${num('changePct').toFixed(2)}% |`,
      ` ${pct(num('ret20'))} | ${pct(num('retYtd'))} |`,
      ` ${num('ma20').toFixed(2)} ${flag('aboveMa20')} |`,
      ` ${num('ma60').toFixed(2)} ${flag('aboveMa60')} |`,
      ` ${num('volumeRatio').toFixed(2)} |`,
    ].join(''))
  }
  if (warnings.length > 0) lines.push('', '数据警告：', ...warnings.map(warning => `- ${String(warning)}`))
  return lines.join('\n')
}

/** Card payload. */
function meta(value: JsonValue): JsonValue {
  const document = value as Record<string, JsonValue>
  return {
    version: 1,
    asOf: document['as_of'] ?? '',
    summary: document['summary'] ?? '',
    indices: document['indices'] ?? [],
    warnings: document['warnings'] ?? [],
    source: document['source'] ?? '新浪财经',
  }
}

const DOCUMENT_SCHEMA = { type: 'object', additionalProperties: true } as const

/** Register the generic market tools. */
export function registerMarketTools(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'market_overview',
    description: [
      'Read a free Sina Finance overview of the A-share market:',
      '上证/深成/创业板/沪深300/中证500/中证1000 close, day change,',
      '5/20-day and YTD return, MA20/MA60 position, volume ratio, and breadth.',
      'Use it for a general market read. It is index-level and does not pick stocks or give investment advice.',
    ].join(' '),
    parameters: {},
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderOverview(value) }],
      presentationMeta: (_args, value) => meta(value),
    },
    timeoutMs: 90_000,
    async execute(_args, exec) {
      const data = await overview()
      if (exec.signal.aborted) throw new Error('market_overview cancelled')
      return {
        as_of: data.asOf,
        indices: data.indices as unknown as JsonValue,
        summary: summary(data.indices),
        breadth: {
          above_ma20: data.indices.filter(index => index.aboveMa20).length,
          above_ma60: data.indices.filter(index => index.aboveMa60).length,
          total: data.indices.length,
        },
        source: '新浪财经（指数行情与日K）',
        warnings: data.warnings,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'index_analysis',
    description: [
      'Read one A-share index from the same free Sina data: close, day change,',
      'MA5/10/20/60, 5/20-day and YTD return, volume ratio, and 20-day high/low.',
      'Use it when the user asks about one index such as 上证指数 or 创业板指.',
    ].join(' '),
    parameters: {
      symbol: { type: 'string', required: true, description: 'Index name or Sina symbol, e.g. 上证指数, 创业板指, sh000001.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: renderOverview({
          indices: [value as JsonValue],
          summary: value['summary'] ?? '',
          as_of: value['date'] ?? '',
          warnings: [],
        }),
      }],
    },
    timeoutMs: 90_000,
    async execute(args, exec) {
      const match = INDICES.find(index => index.name === args.symbol || index.symbol === args.symbol)
      if (match === undefined) throw new Error(`unknown index: ${args.symbol}`)
      const data = await bars(match.symbol)
      const q = await quote(match.symbol)
      if (exec.signal.aborted) throw new Error('index_analysis cancelled')
      const item = reading(match.name, match.symbol, data, q)
      return { ...item, recent: data.slice(-10).map(bar => ({ date: bar.date, close: bar.close })), source: '新浪财经' }
    },
  }))
}

/** Mount the tools. */
export function apply(ctx: Context): void {
  registerMarketTools(ctx)
}
