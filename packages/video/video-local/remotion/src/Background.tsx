/** The video's backdrop: a drifting gradient with two slow glows over it. */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS } from './theme.ts'

/**
 * Draw the backdrop.
 *
 * The drift is a single progress value over the whole composition, so the
 * background never restarts at a scene boundary.
 * @returns the backdrop layers.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], { extrapolateRight: 'clamp' })
  const warm = `radial-gradient(circle at ${(16 + drift * 12).toFixed(1)}% ${(20 + drift * 8).toFixed(1)}%, rgba(91,157,255,0.40) 0%, rgba(91,157,255,0) 56%)`
  const cool = `radial-gradient(circle at ${(84 - drift * 14).toFixed(1)}% ${(76 - drift * 10).toFixed(1)}%, rgba(143,192,255,0.22) 0%, rgba(143,192,255,0) 52%)`
  return (
    <AbsoluteFill style={{ background: `linear-gradient(165deg, ${COLORS.deep} 0%, ${COLORS.mid} 55%, ${COLORS.deep} 100%)` }}>
      <AbsoluteFill style={{ background: warm }} />
      <AbsoluteFill style={{ background: cool }} />
    </AbsoluteFill>
  )
}
