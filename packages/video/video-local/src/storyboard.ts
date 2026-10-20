/**
 * Storyboard planning: turning the storyboard a caller sends into the document
 * the render project receives.
 *
 * The work is bounds enforcement and arithmetic. A caller's text is checked
 * against the limits the create tool publishes and rejected with the limit that
 * refused it, because silently truncating a narration would ship a video that
 * says something the caller never wrote. The arithmetic is cumulative: each
 * scene starts where the previous one ended, and its cues are already relative
 * to that start.
 *
 * @module @deepseek-ai/dsh-video-local/storyboard
 */

import {
  DEFAULT_LAYOUT,
  MAX_BULLETS,
  MAX_LINE_CHARS,
  MAX_NARRATION_CHARS,
  MAX_SCENES,
  SCENE_TAIL_MS,
  VIDEO_PAYLOAD_VERSION,
} from './contract.ts'
import { sceneDurationMs } from './narration.ts'
import type {
  VideoProps,
  VideoSceneLayout,
  VideoSceneProps,
  VideoSceneResult,
  VideoSpec,
  VideoSubtitleCue,
} from './types.ts'

/** Longest output filename stem, in characters. */
const MAX_SLUG_CHARS = 48

/** Output stem used when a title carries no character a filename may hold. */
const FALLBACK_SLUG = 'video'

/** The scene layouts a storyboard may name. */
const LAYOUTS: readonly VideoSceneLayout[] = ['title', 'points', 'quote', 'stat']

/** One scene after defaults and bounds, before its narration is known. */
export interface NormalizedScene {
  /** Heading to draw, or null when the caller named none. */
  readonly heading: string | null
  /** Spoken text. */
  readonly narration: string
  /** Supporting lines, already bounded. */
  readonly bullets: readonly string[]
  /** How the scene arranges its text. */
  readonly layout: VideoSceneLayout
}

/** One storyboard after defaults and bounds. */
export interface NormalizedSpec {
  /** Video title. */
  readonly title: string
  /** Subtitle line, or null when the caller named none. */
  readonly subtitle: string | null
  /** Voice that speaks every scene. */
  readonly voice: string
  /** Rate adjustment passed to edge-tts. */
  readonly rate: string
  /** Output filename stem. */
  readonly slug: string
  readonly scenes: readonly NormalizedScene[]
}

/** What one scene's finished narration contributes to the plan. */
export interface NarrationAudio {
  /** `staticFile`-relative path of the scene's audio inside the render project. */
  readonly audioSrc: string
  /** Measured audio length, in milliseconds. */
  readonly durationMs: number
  /** The scene's cues, timed from the scene's own start. */
  readonly cues: readonly VideoSubtitleCue[]
  /** Whether the audio came from the cache rather than a fresh synthesis. */
  readonly cached: boolean
}

/** One planned video: the render project's input and the result both readers share. */
export interface VideoPlan {
  /** The document the render project receives. */
  readonly props: VideoProps
  /** The scenes as the model and the card read them, with absolute timings. */
  readonly scenes: readonly VideoSceneResult[]
  /** Total run time, in milliseconds. */
  readonly durationMs: number
}

/**
 * Reduce a title to a filename stem.
 *
 * Letters, digits, and CJK ideographs survive; every other run becomes one
 * hyphen, so a Chinese title keeps its characters and a punctuation-only title
 * still names a file.
 * @param title - the video title.
 * @returns a non-empty stem no longer than {@link MAX_SLUG_CHARS} characters.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_CHARS)
    .replace(/-+$/g, '')
  return slug.length > 0 ? slug : FALLBACK_SLUG
}

/**
 * Trim one line and refuse it when it is unusable.
 * @param value - the caller's text.
 * @param field - field name, for the diagnostic.
 * @param limit - the longest accepted value.
 * @returns the trimmed text.
 * @throws when the text is blank or longer than the limit.
 */
function line(value: string, field: string, limit: number): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error(`video: ${field} is empty`)
  if (trimmed.length > limit) {
    throw new Error(`video: ${field} is ${String(trimmed.length)} characters; the limit is ${String(limit)}`)
  }
  return trimmed
}

/**
 * Apply the create tool's defaults and bounds to one storyboard.
 * @param spec - the caller's storyboard.
 * @param defaults - the voice and rate to use when the storyboard names none.
 * @returns the storyboard the rest of the provider works from.
 * @throws when the storyboard is empty or any field exceeds its published limit.
 */
export function normalizeSpec(
  spec: VideoSpec,
  defaults: { readonly voice: string; readonly rate: string },
): NormalizedSpec {
  const title = line(spec.title, 'title', MAX_LINE_CHARS)
  if (spec.scenes.length === 0) throw new Error('video: scenes is empty')
  if (spec.scenes.length > MAX_SCENES) {
    throw new Error(`video: scenes carries ${String(spec.scenes.length)} entries; the limit is ${String(MAX_SCENES)}`)
  }
  const scenes = spec.scenes.map((scene, index) => {
    const layout = scene.layout ?? DEFAULT_LAYOUT
    if (!LAYOUTS.includes(layout)) {
      throw new Error(`video: scenes[${String(index)}].layout is ${layout}; expected one of ${LAYOUTS.join(', ')}`)
    }
    const bullets = (scene.bullets ?? []).map((bullet, position) =>
      line(bullet, `scenes[${String(index)}].bullets[${String(position)}]`, MAX_LINE_CHARS))
    if (bullets.length > MAX_BULLETS) {
      throw new Error(`video: scenes[${String(index)}].bullets carries ${String(bullets.length)} entries; the limit is ${String(MAX_BULLETS)}`)
    }
    return {
      heading: scene.heading === undefined ? null : line(scene.heading, `scenes[${String(index)}].heading`, MAX_LINE_CHARS),
      narration: line(scene.narration, `scenes[${String(index)}].narration`, MAX_NARRATION_CHARS),
      bullets,
      layout,
    }
  })
  return {
    title,
    subtitle: spec.subtitle === undefined ? null : line(spec.subtitle, 'subtitle', MAX_LINE_CHARS),
    voice: spec.voice === undefined ? defaults.voice : line(spec.voice, 'voice', MAX_LINE_CHARS),
    rate: spec.rate === undefined ? defaults.rate : spec.rate.trim(),
    slug: spec.slug === undefined ? slugify(title) : slugify(line(spec.slug, 'slug', MAX_LINE_CHARS)),
    scenes,
  }
}

/**
 * Place every scene on the video's own timeline.
 * @param spec - the normalized storyboard.
 * @param narrations - one finished narration per scene, in scene order.
 * @returns the render input, the per-scene results, and the total run time.
 * @throws when the narration count does not match the scene count.
 */
export function planVideo(spec: NormalizedSpec, narrations: readonly NarrationAudio[]): VideoPlan {
  if (narrations.length !== spec.scenes.length) {
    throw new Error(
      `video: planned ${String(narrations.length)} narrations for ${String(spec.scenes.length)} scenes`,
    )
  }
  const props: VideoSceneProps[] = []
  const scenes: VideoSceneResult[] = []
  let cursor = 0
  for (let index = 0; index < spec.scenes.length; index += 1) {
    const scene = spec.scenes[index] as NormalizedScene
    const audio = narrations[index] as NarrationAudio
    const durationMs = sceneDurationMs(audio.durationMs, SCENE_TAIL_MS)
    props.push({
      heading: scene.heading,
      narration: scene.narration,
      bullets: scene.bullets,
      layout: scene.layout,
      audio: audio.audioSrc,
      durationMs,
      subtitles: audio.cues,
    })
    scenes.push({
      index,
      ...scene.heading === null ? {} : { heading: scene.heading },
      narration: scene.narration,
      startMs: cursor,
      endMs: cursor + durationMs,
      cached: audio.cached,
    })
    cursor += durationMs
  }
  return {
    props: {
      version: VIDEO_PAYLOAD_VERSION,
      title: spec.title,
      subtitle: spec.subtitle,
      totalMs: cursor,
      scenes: props,
    },
    scenes,
    durationMs: cursor,
  }
}
