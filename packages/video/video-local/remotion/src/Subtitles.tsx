/**
 * The caption band.
 *
 * edge-tts reports one cue per spoken sentence, so the band is timed rather
 * than estimated: it draws the cue whose own window covers the current frame,
 * and fills it left to right as that window elapses, which is the wipe a viewer
 * reads as "these are the words being spoken right now".
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { VideoSubtitleCue } from './contract.ts'
import { COLORS, FONT, SAFE_X, SUBTITLE_BOTTOM } from './theme.ts'

/** One subtitle's horizontal and vertical inset inside its plate, in pixels. */
const PLATE_PAD_X = 28
const PLATE_PAD_Y = 18

/**
 * Draw the caption for the current frame.
 * @param props - the scene's cues, timed from the scene's own start.
 * @returns the caption band, or null between cues.
 */
export const Subtitles: React.FC<{ cues: readonly VideoSubtitleCue[] }> = ({ cues }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const elapsedMs = (frame / fps) * 1000
  const cue = cues.find(candidate => elapsedMs >= candidate.startMs && elapsedMs < candidate.endMs)
  if (cue === undefined) return null
  const within = elapsedMs - cue.startMs
  const progress = Math.min(1, within / Math.max(1, cue.endMs - cue.startMs))
  const opacity = interpolate(within, [0, 100], [0, 1], { extrapolateRight: 'clamp' })
  const text = {
    fontSize: FONT.subtitle,
    lineHeight: 1.35,
    fontWeight: 700,
    whiteSpace: 'pre-wrap' as const,
    margin: 0,
  }
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: SUBTITLE_BOTTOM, paddingLeft: SAFE_X, paddingRight: SAFE_X, opacity }}>
      <div style={{ position: 'relative', padding: `${String(PLATE_PAD_Y)}px ${String(PLATE_PAD_X)}px`, borderRadius: 26, backgroundColor: COLORS.subtitlePlate, maxWidth: '100%' }}>
        <span style={{ ...text, color: COLORS.muted }}>{cue.text}</span>
        <span
          aria-hidden
          style={{
            ...text,
            position: 'absolute',
            left: PLATE_PAD_X,
            right: PLATE_PAD_X,
            top: PLATE_PAD_Y,
            color: COLORS.ink,
            clipPath: `inset(0 ${String((1 - progress) * 100)}% 0 0)`,
          }}
        >
          {cue.text}
        </span>
      </div>
    </AbsoluteFill>
  )
}
