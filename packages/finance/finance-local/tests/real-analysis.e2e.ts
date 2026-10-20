/**
 * Real end-to-end check against the external analysis project.
 *
 * The test boots the shipped package through the Loader, runs the real Python
 * bridge under the project's own virtual environment, and asserts the returned
 * document carries values only a live analysis can produce. It self-skips
 * without the two deployment paths, so keyless CI and a machine without the
 * project stay green.
 *
 * Environment:
 *   DSH_FINANCE_STOCK_MARKET_PYTHON  StockMarket virtual-environment interpreter
 *   DSH_FINANCE_STOCK_MARKET_ROOT    StockMarket project root
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FinanceLocal from '@deepseek-ai/dsh-finance-local'
import * as FinanceTools from '@deepseek-ai/dsh-finance-local/tools'

const PATHS = {
  stockMarketPython: process.env['DSH_FINANCE_STOCK_MARKET_PYTHON'],
  stockMarketRoot: process.env['DSH_FINANCE_STOCK_MARKET_ROOT'],
}

const configured = Object.values(PATHS).every(value => value !== undefined && value.length > 0)

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the shipped package through the real Loader against the configured paths. */
async function boot(): Promise<Context> {
  root = mkdtempSync(join(tmpdir(), 'dsh-finance-real-'))
  const configPath = join(root, 'cordis.yml')
  writeFileSync(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-subprocess-local'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-finance-local'",
    '  config:',
    `    stockMarketPython: '${String(PATHS.stockMarketPython)}'`,
    `    stockMarketRoot: '${String(PATHS.stockMarketRoot)}'`,
    '    timeoutMs: 600000',
    "- name: '@deepseek-ai/dsh-finance-local/tools'",
    '  config:',
    '    timeoutMs: 600000',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-subprocess-local', LocalSubprocessRuntime],
    ['@deepseek-ai/dsh-session-projection', SessionProjection],
    ['@deepseek-ai/dsh-finance-local', FinanceLocal],
    ['@deepseek-ai/dsh-finance-local/tools', FinanceTools],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

/** Execute one tool through the real registry. */
async function execute(ctx: Context, name: string, args: Record<string, unknown>) {
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`e2e-${name}`),
    name,
    arguments: args,
  })
  expect(result.isError).toBe(false)
  return result
}

/** Execute one tool through the real registry and return its model-facing text. */
async function call(ctx: Context, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await execute(ctx, name, args)
  return result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
}

describe.skipIf(!configured)('finance-local real analysis', () => {
  it('scores the CSI 300 from live data through the Loader', async () => {
    const ctx = await boot()
    const text = await call(ctx, 'csi300_analysis', {})
    const document = JSON.parse(/\{[\s\S]*\}/.exec(text.replace(/^Data warnings:[\s\S]*?\n\n/, ''))?.[0] ?? '{}') as {
      as_of?: string
      close?: number
      ice_point?: boolean
      score?: { total_score?: number; details?: Record<string, unknown> }
    }
    expect(typeof document.as_of).toBe('string')
    expect(document.close).toBeGreaterThan(0)
    expect(typeof document.ice_point).toBe('boolean')
    expect(document.score?.total_score).toBeGreaterThan(0)
    expect(Object.keys(document.score?.details ?? {}).length).toBe(7)
  }, 600_000)

  it('publishes the drawn series as presentation metadata, out of the model text', async () => {
    const ctx = await boot()
    const result = await execute(ctx, 'csi300_analysis', {})
    const meta = result.meta as unknown as {
      version: number
      series: { id: string; kind: string; dates: string[]; columns: Record<string, readonly (number | null)[]> }[]
    }
    expect(meta.version).toBe(1)
    expect(meta.series.map(series => series.id)).toEqual(['price', 'valuation', 'erp', 'percentiles'])
    const price = meta.series[0]
    expect(price?.kind).toBe('candlestick')
    // Half a year of daily bars and five years of monthly points, as drawn.
    expect(price?.dates).toHaveLength(120)
    expect(price?.columns['close']).toHaveLength(120)
    expect(meta.series[1]?.dates).toHaveLength(60)
    expect(meta.series[2]?.columns['erp_percentile']).toHaveLength(60)
    // The percentile bars: the three valuation readings and their boundary.
    const bars = meta.series[3] as unknown as { kind: string; categories: string[]; reference: number }
    expect(bars.kind).toBe('bar')
    expect(bars.categories).toEqual(['pe_percentile', 'pb_percentile', 'mean_percentile'])
    expect(bars.reference).toBe(0.5)
    // The series is a card's data, never the model's.
    const text = result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
    expect(text).not.toContain('"series"')
    expect(text).not.toContain('"charts"')
  }, 600_000)

  it('composes the monthly timing signal from live data through the Loader', async () => {
    const ctx = await boot()
    const text = await call(ctx, 'market_timing_signal', {})
    const document = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? '{}') as {
      signal?: Record<string, unknown>
    }
    expect(Object.keys(document.signal ?? {}).length).toBeGreaterThan(0)
  }, 600_000)
})
