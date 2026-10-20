/**
 * Local provider for the financial-analysis seam. It spawns one short-lived
 * Python process per invocation through `ctx.subprocess`, writes the request on
 * stdin, and reads one JSON response object from stdout. The Python side is the
 * bridge shipped beside this package; the analysis itself runs inside the
 * external project the options point at.
 *
 * @module @deepseek-ai/dsh-finance-local/provider
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { readFinanceCharts } from './charts.ts'
import { FinanceRuntime } from './service.ts'
import type { FinanceInvocation, FinanceOutcome } from './types.ts'

/** Environment variable the bridge reads for the StockMarket project root. */
export const STOCK_MARKET_ROOT_ENV = 'DSH_FINANCE_STOCK_MARKET_ROOT'

/** Resolved deployment inputs for one provider instance. */
export interface PythonFinanceOptions {
  /** Interpreter of the StockMarket project's virtual environment. */
  readonly stockMarketPython: string
  /** StockMarket project root; the bridge adds it to `sys.path`. */
  readonly stockMarketRoot: string
  /** Absolute path of the bridge script shipped with this package. */
  readonly bridgeScript: string
  /** Wall-clock bound for one invocation, in milliseconds. */
  readonly timeoutMs: number
  /** In-memory cap on the response object; a longer response fails loud. */
  readonly maxDocumentBytes: number
  /** In-memory cap on captured stderr, used only for failure diagnostics. */
  readonly maxStderrBytes: number
  /** Grace period the subprocess provider may use for termination and drain. */
  readonly graceMs: number
}

/** Whether a value is a non-array JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Decode the bridge's stdout into an outcome, rejecting every malformed or
 * failed response. This is the process boundary, so the response object is
 * validated here rather than trusted.
 * @param text - the complete stdout text of one bridge process.
 * @param operation - the operation that was requested.
 * @returns the operation's document, warnings, and drawable series.
 * @throws when the response is not the bridge's success object.
 */
export function decodeBridgeResponse(text: string, operation: FinanceInvocation['operation']): FinanceOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`finance bridge returned malformed JSON: ${String(error)}`)
  }
  if (!isRecord(parsed)) throw new Error('finance bridge response is not a JSON object')
  if (parsed.ok !== true) {
    const detail = typeof parsed.error === 'string' ? parsed.error : 'no error detail'
    throw new Error(`finance bridge failed for ${operation}: ${detail}`)
  }
  if (!isRecord(parsed.document)) throw new Error('finance bridge response carries no document object')
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string')
    : []
  return {
    operation,
    document: parsed.document as Record<string, JsonValue>,
    warnings,
    charts: readFinanceCharts(parsed.charts),
  }
}

/**
 * Run the analysis project through the shipped bridge script.
 *
 * Each invocation is one process: the deployment's configured interpreter runs
 * the bridge, whose request and response are single JSON objects.
 */
export class PythonFinanceProvider extends FinanceRuntime {
  private readonly options: PythonFinanceOptions

  constructor(ctx: Context, options: PythonFinanceOptions) {
    super(ctx)
    this.options = options
  }

  /**
   * Run one analysis operation.
   * @param invocation - the operation and that operation's arguments.
   * @param signal - cancels the invocation and terminates its process.
   * @returns the operation's document plus non-fatal data-source warnings.
   */
  override async invoke(invocation: FinanceInvocation, signal: AbortSignal): Promise<FinanceOutcome> {
    const timeout = new AbortController()
    const timer = setTimeout(() => { timeout.abort() }, this.options.timeoutMs)
    try {
      const handle = this.ctx.subprocess.spawn({
        argv: [this.options.stockMarketPython, this.options.bridgeScript],
        cwd: this.options.stockMarketRoot,
        stdio: {
          stdin: { data: JSON.stringify(invocation) },
          stdout: { maxBytes: this.options.maxDocumentBytes },
          stderr: { maxBytes: this.options.maxStderrBytes },
        },
        graceMs: this.options.graceMs,
        signal: AbortSignal.any([signal, timeout.signal]),
        env: { [STOCK_MARKET_ROOT_ENV]: this.options.stockMarketRoot },
      })
      const outcome = await handle.done
      const stdout = handle.collected.stdout?.readFrom(0)
      if (signal.aborted) throw new Error(`finance ${invocation.operation} was cancelled`)
      if (timeout.signal.aborted) {
        throw new Error(`finance ${invocation.operation} exceeded ${this.options.timeoutMs} ms`)
      }
      if (outcome.exitCode !== 0 || outcome.signal !== null) {
        const stderr = handle.collected.stderr?.readFrom(0).text.trim()
        const detail = stderr !== undefined && stderr.length > 0 ? `: ${stderr}` : ''
        throw new Error(
          `finance bridge exited with ${outcome.signal ?? `code ${String(outcome.exitCode)}`}${detail}`,
        )
      }
      if (stdout === undefined) throw new Error('finance bridge produced no stdout')
      if (stdout.lossy) {
        throw new Error(
          `finance ${invocation.operation} response exceeded ${String(this.options.maxDocumentBytes)} bytes`,
        )
      }
      return decodeBridgeResponse(stdout.text, invocation.operation)
    } finally {
      clearTimeout(timer)
    }
  }
}
