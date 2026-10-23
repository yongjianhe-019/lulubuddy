/** Service Definition for the motion-graphics capability seam (`ctx.motion`). */
import { Context, Service } from '@deepseek-ai/cordis'
import type { MotionOperation, MotionOutcome, MotionRequestMap } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    motion: MotionRuntime
  }
}

/** One fully specified motion request. */
export type MotionInvocation = {
  readonly [K in MotionOperation]: {
    readonly operation: K
    readonly arguments: MotionRequestMap[K]
  }
}[MotionOperation]

/** Abstract motion-graphics service. */
export abstract class MotionRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'motion')
  }

  /**
   * Run one operation.
   * @param invocation - operation and its arguments.
   * @param signal - cancels in-flight work.
   * @returns the operation document and non-fatal warnings.
   */
  abstract invoke(invocation: MotionInvocation, signal: AbortSignal): Promise<MotionOutcome>
}

export default MotionRuntime
