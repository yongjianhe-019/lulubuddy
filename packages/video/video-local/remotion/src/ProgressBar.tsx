/** The thin bar at the top edge that shows how far through the video a viewer is. */

import { interpolate, useCurrentFrame } from 'remotion'
import { COLORS } from './theme.ts'

/**
 * Draw the progress bar.
 * @param props - the composition's total length in frames.
 * @returns the bar.
 */
export const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame()
  const width = interpolate(frame, [0, Math.max(1, total - 1)], [0, 100], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.10)' }}>
      <div style={{ width: `${String(width)}%`, height: '100%', background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentLight})` }} />
    </div>
  )
}
