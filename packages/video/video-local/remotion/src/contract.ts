/* jscpd:ignore-start */
/*
 * These declarations deliberately repeat `packages/video/video-local/src/types.ts`.
 * The template compiles in its own npm project, after setup, against packages this
 * repository does not install, so it cannot import the host's types; the two sides
 * are one protocol written twice, and `tests/template.spec.ts` is what proves they
 * still agree.
 */
/**
 * The agreement between this composition and the host half that drives it.
 *
 * `@deepseek-ai/dsh-video-local` computes every duration in milliseconds, so
 * nothing here has to agree with the host about frame rates: the composition is
 * the only side that knows its own geometry, and it converts once, in
 * `timeline.ts`. Changing the geometry or the composition id means changing the
 * host's `contract.ts` in the same pass.
 */

/** Frame size and rate the composition renders at. */
export const FPS = 30
export const WIDTH = 1080
export const HEIGHT = 1920

/** Composition id the host selects. */
export const COMPOSITION_ID = 'ShortVideo'

/** Props revision this project accepts. */
export const PROPS_VERSION = 1

/** How one scene arranges its text. */
export type VideoSceneLayout = 'title' | 'points' | 'quote' | 'stat'

/** One subtitle cue, in milliseconds from the start of its own scene. */
export interface VideoSubtitleCue {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
}

/** One scene: what is said, what is shown, and for how long. */
export interface VideoSceneProps {
  readonly heading: string | null
  readonly narration: string
  readonly bullets: readonly string[]
  readonly layout: VideoSceneLayout
  /** `staticFile`-relative path of the narration audio. */
  readonly audio: string
  readonly durationMs: number
  readonly subtitles: readonly VideoSubtitleCue[]
}

/** One complete storyboard. */
export interface VideoProps {
  readonly version: number
  readonly title: string
  readonly subtitle: string | null
  readonly totalMs: number
  readonly scenes: readonly VideoSceneProps[]
}

/** Props a render falls back to when the host passes none, as `remotion studio` does. */
export const PREVIEW_PROPS: VideoProps = {
  version: PROPS_VERSION,
  title: 'DSHBuddy 短视频',
  subtitle: '预览用示例故事板',
  totalMs: 9000,
  scenes: [
    {
      heading: '开场',
      narration: '这是一条用于预览的示例旁白。',
      bullets: [],
      layout: 'title',
      audio: '',
      durationMs: 3000,
      subtitles: [{ text: '这是一条用于预览的示例旁白。', startMs: 200, endMs: 2800 }],
    },
    {
      heading: '三个要点',
      narration: '第二个场景展示要点列表。',
      bullets: ['第一点', '第二点', '第三点'],
      layout: 'points',
      audio: '',
      durationMs: 3000,
      subtitles: [{ text: '第二个场景展示要点列表。', startMs: 200, endMs: 2800 }],
    },
    {
      heading: '结论',
      narration: '最后一个场景是引用版式。',
      bullets: [],
      layout: 'quote',
      audio: '',
      durationMs: 3000,
      subtitles: [{ text: '最后一个场景是引用版式。', startMs: 200, endMs: 2800 }],
    },
  ],
}
/* jscpd:ignore-end */
