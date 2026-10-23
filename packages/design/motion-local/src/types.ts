/** Public contracts for the local motion-graphics capability. */

/** Operations the provider knows how to run. */
export type MotionOperation = 'scaffold' | 'render' | 'still' | 'qc'

/** Arguments for one motion operation. */
export interface MotionRequestMap {
  readonly scaffold: {
    readonly title: string
    readonly brief?: string
    readonly slug?: string
    readonly width?: number
    readonly height?: number
    readonly fps?: number
    readonly duration?: number
    readonly bpm?: number
    readonly platform?: 'mobile' | 'desktop' | 'square' | 'portrait' | 'custom'
    readonly outputDir?: string
  }
  readonly render: {
    readonly htmlPath: string
    readonly width?: number
    readonly height?: number
    readonly fps?: number
    readonly duration?: number
    readonly poster?: number
    readonly crf?: number
    readonly sheet?: number
  }
  readonly still: {
    readonly htmlPath: string
    readonly time: number
    readonly width?: number
    readonly height?: number
    readonly guides?: boolean
    readonly outputPath?: string
  }
  readonly qc: {
    readonly videoPath: string
    readonly sheet?: number
  }
}

/** One operation's result: a JSON document plus non-fatal notes. */
export interface MotionOutcome {
  readonly document: Readonly<Record<string, unknown>>
  readonly warnings: readonly string[]
}
