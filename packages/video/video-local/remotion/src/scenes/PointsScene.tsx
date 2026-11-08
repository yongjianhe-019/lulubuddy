/** A heading with supporting lines, each of which lights up as the narration reaches it. */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { VideoSceneProps } from '../contract.ts'
import { useEnter } from '../enter.ts'
import { COLORS, FONT, SAFE_X } from '../theme.ts'

/**
 * Draw a heading and its bullets.
 *
 * The bullets are the scene's own outline, so they are revealed in the order
 * the narration walks them: the lit line is the one the speaker has reached.
 * @param props - the scene.
 * @returns the scene's text.
 */
export const PointsScene: React.FC<{ scene: VideoSceneProps }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = useEnter()
  const elapsedMs = (frame / fps) * 1000
  const progress = Math.min(1, elapsedMs / Math.max(1, scene.durationMs))
  const active = Math.min(scene.bullets.length - 1, Math.floor(progress * scene.bullets.length))
  return (
    <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: SAFE_X, paddingRight: SAFE_X }}>
      <div style={{ opacity: enter.opacity, transform: `translateY(${String(enter.offset)}px)` }}>
        {scene.heading === null ? null : (
          <div style={{ fontSize: FONT.heading, fontWeight: 800, color: COLORS.ink, lineHeight: 1.2, marginBottom: 68 }}>
            {scene.heading}
          </div>
        )}
        {scene.bullets.map((bullet, index) => {
          const lit = index <= active
          return (
            <div key={bullet + String(index)} style={{ display: 'flex', alignItems: 'flex-start', gap: 26, marginBottom: 40 }}>
              <div
                style={{
                  flex: '0 0 auto',
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  marginTop: 18,
                  backgroundColor: lit ? COLORS.accent : 'rgba(255,255,255,0.18)',
                  transform: `scale(${String(lit ? 1 : 0.7)})`,
                }}
              />
              <div
                style={{
                  fontSize: FONT.bullet,
                  lineHeight: 1.45,
                  fontWeight: lit ? 700 : 500,
                  color: lit ? COLORS.ink : COLORS.muted,
                  opacity: interpolate(index, [active - 1, active], [0.72, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                }}
              >
                {bullet}
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
