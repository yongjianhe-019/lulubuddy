import { XHS_PAYLOAD_VERSION } from './contract.ts'

/**
 * The Xiaohongshu packaging vocabulary: one finished video plus the post copy a
 * person copies into the Xiaohongshu composer, and the two publication gates
 * the provider ran before it returned.
 *
 * @module @deepseek-ai/dsh-xhs-local/types
 */

/** One finished video, measured by the caller that rendered it. */
export interface XhsVideo {
  /** Absolute path of the finished MP4. */
  readonly path: string
  readonly durationMs: number
  readonly width: number
  readonly height: number
  readonly fps: number
  readonly bytes: number
}

/** The output of one publication gate. */
export interface XhsGate {
  /** Whether the gate passed. */
  readonly passed: boolean
  /** The gate's exit code, when it ran. */
  readonly exitCode: number | null
  /** The gate's complete output for the model. */
  readonly output: string
}

/** Both publication gates, plus the counts the card shows. */
export interface XhsChecks {
  /** The de-AI prose scan. */
  readonly detect: XhsGate & { readonly verdict: string; readonly hits: number }
  /** The outbound-contact and external-platform scan. */
  readonly scan: XhsGate & { readonly hard: number; readonly soft: number }
}

/** One post the provider packages. */
export interface XhsPublishRequest {
  readonly number: number
  readonly topic: string
  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly pinnedComment: string
  /** Absolute path of the finished MP4. The provider measures it. */
  readonly videoPath: string
}

/** Files one publication wrote. */
export interface XhsFiles {
  /** The long-form production record. */
  readonly draft: string
  /** The copy the user pastes into Xiaohongshu. */
  readonly publish: string
  /** The video the card plays. */
  readonly video: string
}

/** The card payload one publication returns. */
export interface XhsPostResult {
  readonly version: typeof XHS_PAYLOAD_VERSION
  readonly number: number
  readonly topic: string
  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly pinnedComment: string
  readonly video: XhsVideo & {
    /** Browser path to play, or null when the deployment mounted no route. */
    readonly url: string | null
    /** Basename of the served file. */
    readonly fileName: string
  }
  readonly checks: XhsChecks
  readonly files: XhsFiles
  readonly warnings: readonly string[]
  readonly createdAt: string
}
