/**
 * Service Definition for the financial-analysis capability seam (`ctx.finance`):
 * one bounded analysis invocation over a named operation. Data acquisition,
 * scoring, and JSON encoding belong to the provider; operation selection,
 * argument validation, and presentation belong to the consumer.
 *
 * @module @deepseek-ai/dsh-finance-local/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { FinanceInvocation, FinanceOutcome } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    finance: FinanceRuntime
  }
}

/**
 * Abstract financial-analysis service. Subclass it, implement {@link invoke},
 * and load the subclass as a plugin — it registers as `ctx.finance` (one
 * implementation per context; loading a second throws, which is cordis' standard
 * duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - {@link invoke} resolves with the operation's JSON document; a failure to
 *   produce data (unreachable analysis project, malformed response, exceeded
 *   bound) rejects rather than returning a partial document.
 * - The caller's signal cancels in-flight work and the provider records no
 *   result for a cancelled invocation.
 * - Warnings describe non-fatal data-source facts (an unavailable optional
 *   source, a skipped enrichment); they never carry analysis conclusions.
 */
export abstract class FinanceRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'finance')
  }

  /**
   * Run one analysis operation and return its document.
   * @param invocation - the operation and that operation's arguments.
   * @param signal - cancels the invocation.
   * @returns the operation's JSON document plus non-fatal data-source warnings.
   */
  abstract invoke(invocation: FinanceInvocation, signal: AbortSignal): Promise<FinanceOutcome>
}

export default FinanceRuntime
