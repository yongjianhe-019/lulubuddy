/**
 * Local financial-analysis capability, host half: the `ctx.finance` Service
 * Definition and the Python-backed provider that runs it. The deployment
 * supplies the external project this plugin drives; nothing is downloaded or
 * started by the harness beyond the configured interpreter and project root.
 *
 * The model-facing tools that consume this service ship as the package's
 * separate `tools` entry, because a session's agent owns which tools it sees
 * while the deployment owns where the analysis project lives. Mounting this
 * row alone provides the service and registers no tool.
 *
 * @module @deepseek-ai/dsh-finance-local
 */

import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { PythonFinanceProvider } from './provider.ts'
import type { PythonFinanceOptions } from './provider.ts'
import { financeProjectionDefinition } from './projection.ts'

export {
  PythonFinanceProvider,
  STOCK_MARKET_ROOT_ENV,
  decodeBridgeResponse,
} from './provider.ts'
export type { PythonFinanceOptions } from './provider.ts'
export { FinanceRuntime } from './service.ts'
export { applyFinanceProjection, financeProjectionDefinition } from './projection.ts'
export type { FinanceProjection, FinanceProjectionState } from './projection.ts'
export type {
  FinanceCategorySeries,
  FinanceChartSeries,
  FinanceCharts,
  FinanceTimeSeries,
  FinanceInvocation,
  FinanceOperation,
  FinanceOutcome,
  FinanceRequestMap,
} from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'finance-local'

/**
 * The subprocess capability this provider spawns through, plus the session
 * projection registry the finance payload unit registers into. Both are host
 * services the base composition already mounts.
 */
export const inject = ['subprocess', 'sessionProjections']

/**
 * Absolute path of the shipped bridge script, resolved from this module so the
 * source launch and the built `lib/` entry agree. It is a package-internal
 * artifact, not a deployment choice: the bridge's protocol is what this
 * provider implements, so pointing it elsewhere would be a different provider.
 */
const BRIDGE_SCRIPT = fileURLToPath(new URL('../python/finance_bridge.py', import.meta.url))

/** Marker file proving a configured directory really is the project it claims to be. */
const STOCK_MARKET_MARKER = join('data', 'fetcher.py')

/**
 * Plugin config. Both paths are required because no default can name another
 * machine's checkout, and a wrong path must fail at load rather than at the
 * first analysis call.
 */
export interface Config {
  /** Interpreter of the StockMarket virtual environment that fetched the market data. */
  stockMarketPython: string
  /** StockMarket project root, the directory containing `data/fetcher.py`. */
  stockMarketRoot: string
  /** Wall-clock bound for one bridge invocation in milliseconds. Defaults to 180000. */
  timeoutMs?: number
  /** In-memory cap on one bridge response in bytes. Defaults to 8388608. */
  maxDocumentBytes?: number
  /** In-memory cap on captured bridge stderr in bytes. Defaults to 65536. */
  maxStderrBytes?: number
  /** Termination and drain grace period in milliseconds. Defaults to 5000. */
  graceMs?: number
}

export const Config: z<Config> = z.object({
  stockMarketPython: z.string().required(),
  stockMarketRoot: z.string().required(),
  timeoutMs: z.number().step(1).min(1).default(180_000),
  maxDocumentBytes: z.number().step(1).min(1).default(8_388_608),
  maxStderrBytes: z.number().step(1).min(1).default(65_536),
  graceMs: z.number().step(1).min(1).default(5_000),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Fail loud when a configured path cannot be the file it claims to be.
 * @param field - config field name, for the diagnostic.
 * @param path - the configured absolute path.
 * @param executable - whether the interpreter must also carry the execute bit.
 */
function assertFile(field: string, path: string, executable: boolean): void {
  let stats
  try {
    stats = statSync(path)
  } catch {
    // statSync is the only statement that can throw here: nothing else in this
    // function can fail for a reason other than the messages below.
    throw new Error(`finance-local: ${field} does not exist: ${path}`)
  }
  if (!stats.isFile()) throw new Error(`finance-local: ${field} is not a regular file: ${path}`)
  if (!executable) return
  try {
    accessSync(path, constants.X_OK)
  } catch {
    // accessSync reports only the mode bits, so the execute-bit diagnostic is
    // the complete reason this call can fail.
    throw new Error(`finance-local: ${field} is not executable: ${path}`)
  }
}

/**
 * Fail loud when a configured directory is missing or belongs to another project.
 * @param field - config field name, for the diagnostic.
 * @param path - the configured absolute directory.
 * @param marker - relative path that must exist inside the directory.
 */
function assertProjectDirectory(field: string, path: string, marker: string): void {
  if (statSync(path, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`finance-local: ${field} is not a directory: ${path}`)
  }
  if (!existsSync(join(path, marker))) {
    throw new Error(`finance-local: ${field} is not the expected project; ${marker} is missing from ${path}`)
  }
}

/**
 * Project one resolved section into the provider's options, validating every
 * configured path. The policy is self-contained, so misconfiguration fails here
 * at load rather than surfacing as a broken analysis much later.
 * @param config - the currently authoritative section.
 * @returns options for one provider instance.
 */
function resolveOptions(config: ResolvedConfig): PythonFinanceOptions {
  assertFile('stockMarketPython', config.stockMarketPython, true)
  assertProjectDirectory('stockMarketRoot', config.stockMarketRoot, STOCK_MARKET_MARKER)
  assertFile('bridgeScript', BRIDGE_SCRIPT, false)
  return {
    stockMarketPython: config.stockMarketPython,
    stockMarketRoot: config.stockMarketRoot,
    bridgeScript: BRIDGE_SCRIPT,
    timeoutMs: config.timeoutMs,
    maxDocumentBytes: config.maxDocumentBytes,
    maxStderrBytes: config.maxStderrBytes,
    graceMs: config.graceMs,
  }
}

/**
 * Register the finance capability: one `ctx.finance` provider. The
 * registration is fiber-scoped, so disposing this plugin removes the service.
 * @param ctx - context receiving the provider.
 * @param config - validated deployment paths and bounds.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const options = resolveOptions(config as ResolvedConfig)
  // The provider registers itself as `ctx.finance` and is removed with this
  // plugin's fiber; the tools entry resolves that instance by injection.
  new PythonFinanceProvider(ctx, options)
  // The projection is session state over the results this row's tools publish,
  // so it belongs to the capability rather than to the tools entry: a session
  // that mounts the tools later still folds the results it already has.
  ctx.effect(() => ctx.sessionProjections.register(financeProjectionDefinition),
    'finance-local: chart payload projection')
}
