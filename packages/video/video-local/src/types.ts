/**
 * Vocabulary for the short-video production capability seam (`ctx.video`): the
 * closed set of operations, each operation's arguments, the storyboard the
 * create operation accepts, and the bounded result one invocation returns.
 *
 * The narration and the composition live outside this harness — edge-tts speaks
 * the text and the Remotion project draws it — so no type here repeats their
 * own formats. What this module fixes is the seam's half: what a caller may ask
 * for, and what a caller receives back.
 *
 * @module @deepseek-ai/dsh-video-local/types
 */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/**
 * One video-production operation. The name is both the provider's dispatch key
 * and the bridge protocol's verb; the model-facing tool names are separate and
 * belong to the consumer.
 */
export type VideoOperation = 'setup' | 'voices' | 'create'

/** How one scene arranges its text. */
export type VideoSceneLayout = 'title' | 'points' | 'quote' | 'stat'

/** One scene a caller asks for: what is said, and what is shown while it is said. */
export interface VideoSceneSpec {
  /** Line above the bullets; the scene's own title. */
  readonly heading?: string
  /** Spoken text. It is also the scene's subtitle source, so it must be what a listener should hear. */
  readonly narration: string
  /** Supporting lines shown under the heading, in order. */
  readonly bullets?: readonly string[]
  /** How the scene arranges its text; defaults to `points`. */
  readonly layout?: VideoSceneLayout
}

/** One complete storyboard. */
export interface VideoSpec {
  /** Video title, shown on the opening card and used as the output filename stem. */
  readonly title: string
  /** Optional line under the title on the opening card. */
  readonly subtitle?: string
  /** Scenes in play order. */
  readonly scenes: readonly VideoSceneSpec[]
  /** edge-tts voice id; defaults to the plugin's own default voice. */
  readonly voice?: string
  /** edge-tts rate adjustment, such as `+10%` or `-5%`. */
  readonly rate?: string
  /** Output filename stem; defaults to a slug of the title. */
  readonly slug?: string
}

/** Each operation's arguments, keyed by operation. */
export interface VideoRequestMap {
  /** Materialize the render project and install what it needs; idempotent. */
  readonly setup: Record<string, never>
  /** List the narration voices the configured edge-tts offers for one locale. */
  readonly voices: { readonly locale: string }
  /** Narrate, plan, and render one storyboard into a video file. */
  readonly create: VideoSpec
}

/** One fully-specified capability request: an operation and its own arguments. */
export type VideoInvocation = {
  readonly [K in VideoOperation]: {
    readonly operation: K
    readonly arguments: VideoRequestMap[K]
  }
}[VideoOperation]

/** One narration voice the configured edge-tts offers. */
export interface VideoVoice {
  /** Voice id passed back as `VideoSpec.voice`. */
  readonly id: string
  /** Locale the voice speaks, such as `zh-CN`. */
  readonly locale: string
  /** `Female` or `Male`, as edge-tts reports it. */
  readonly gender: string
  /** Content categories edge-tts lists for the voice. */
  readonly categories: string
}

/** One subtitle cue, in milliseconds from the start of the scene that owns it. */
export interface VideoSubtitleCue {
  /** Cue text, exactly as it is spoken. */
  readonly text: string
  /** Cue start, in milliseconds from its scene's start. */
  readonly startMs: number
  /** Cue end, in milliseconds from its scene's start; never past the next cue's start. */
  readonly endMs: number
}

/**
 * One scene as planned: the timing the composition needs, in milliseconds.
 * Frame arithmetic belongs to the composition, which is what knows its own fps.
 */
export interface VideoSceneProps {
  /** Heading to draw, or null when the scene names none. */
  readonly heading: string | null
  /** Spoken text, drawn as the scene's caption when it carries no bullets. */
  readonly narration: string
  /** Supporting lines, already bounded. */
  readonly bullets: readonly string[]
  /** How the scene arranges its text. */
  readonly layout: VideoSceneLayout
  /** `staticFile`-relative path of the scene's narration audio. */
  readonly audio: string
  /** How long the scene runs, narration plus its tail. */
  readonly durationMs: number
  /** The scene's cues, timed from the scene's own start. */
  readonly subtitles: readonly VideoSubtitleCue[]
}

/**
 * The complete input the render project receives. It is the agreement between
 * this host half and the shipped composition, so both sides spell it out.
 */
export interface VideoProps {
  /** Payload revision, so a replaced template can refuse a document it cannot read. */
  readonly version: number
  readonly title: string
  /** Subtitle line for the opening card, or null when the storyboard names none. */
  readonly subtitle: string | null
  /** Total run time, the sum of every scene's own duration. */
  readonly totalMs: number
  readonly scenes: readonly VideoSceneProps[]
}

/** One scene in the result the model and the card both read. */
export interface VideoSceneResult {
  /** Zero-based position in play order. */
  readonly index: number
  /** Heading the scene draws, when it has one. */
  readonly heading?: string
  /** The spoken text. */
  readonly narration: string
  /** Scene start, in milliseconds from the video's start. */
  readonly startMs: number
  /** Scene end, in milliseconds from the video's start. */
  readonly endMs: number
  /** Whether the narration audio came from the cache rather than a fresh synthesis. */
  readonly cached: boolean
}

/**
 * What one render produced. This is the card's payload, not the model's
 * document: it names the video's location on this machine and the URL its
 * player reads, neither of which belongs in a model-facing result.
 */
export interface VideoRender {
  readonly version: number
  /** Absolute path of the rendered video. */
  readonly output: string
  /** Browser path the playback route serves the video under, absent when no route is mounted. */
  readonly url: string | null
  /** Size of the rendered file, in bytes. */
  readonly bytes: number
  /** Rendered frame size, as the composition reported it. */
  readonly width: number
  readonly height: number
  /** Rendered frame rate, as the composition reported it. */
  readonly fps: number
  /** Total run time, in milliseconds. */
  readonly durationMs: number
  readonly title: string
  /** Voice that spoke the narration. */
  readonly voice: string
  readonly scenes: readonly VideoSceneResult[]
}

/**
 * One operation's result: the document the model reads, the non-fatal facts it
 * must weigh, and the payload a card draws.
 */
export interface VideoOutcome {
  /** The operation that produced this outcome. */
  readonly operation: VideoOperation
  /** The operation's own JSON document. */
  readonly document: Readonly<Record<string, JsonValue>>
  /** Non-fatal facts: cached narration, a missing playback route, a slow render. */
  readonly warnings: readonly string[]
  /** The render this operation produced, or null for an operation that renders nothing. */
  readonly render: VideoRender | null
}
