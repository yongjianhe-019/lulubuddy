/** One figure given the whole card, counting up as the narration reaches it. */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { VideoSceneProps } from '../contract.ts'
import { COLORS, FONT, SAFE_X } from '../theme.ts'

/** Leading number in a heading, so a figure can be counted up rather than repeated. */
const LEADING_NUMBER = /^[-+]?\d[\d,]*(?:\.\d+)?/

/**
 * Draw a scene built around one figure.
 *
 * When the heading opens with a number that number is counted up over the first
 * fifth of the scene and the heading's remaining text is drawn under it; a
 * heading with no number is drawn whole, because animating text that is not a
 * number would be a lie about what the figure is.
 * @param props - the scene.
 * @returns the card.
 */
export const StatScene: React.FC<{ scene: VideoSceneProps }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const heading = scene.heading ?? scene.bullets[0] ?? scene.narration
  const match = LEADING_NUMBER.exec(heading)
  const target = match === null ? null : Number(match[0].replace(/,/g, ''))
  const suffix = match === null ? '' : heading.slice(match[0].length).trim()
  const progress = interpolate(frame, [0, Math.max(1, Math.round(fps * 0.6))], [0, 1], { extrapolateRight: 'clamp' })
  const shown = target === null || Number.isNaN(target) ? null : (target * progress).toFixed(match?.[0].includes('.') === true ? 1 : 0)
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingLeft: SAFE_X, paddingRight: SAFE_X, textAlign: 'center', opacity }}>
      <div>
        {shown === null ? (
          <div style={{ fontSize: FONT.quote, fontWeight: 800, color: COLORS.ink, lineHeight: 1.3 }}>{heading}</div>
        ) : (
          <>
            <div style={{ fontSize: FONT.figure, fontWeight: 900, color: COLORS.highlight, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
              {shown}
            </div>
            {suffix.length === 0 ? null : (
              <div style={{ marginTop: 22, fontSize: FONT.heading, fontWeight: 800, color: COLORS.ink }}>{suffix}</div>
            )}
          </>
        )}
        {scene.bullets.length === 0 ? null : (
          <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {scene.bullets.map((bullet, index) => (
              <div key={bullet + String(index)} style={{ fontSize: FONT.bullet, color: COLORS.muted, lineHeight: 1.4 }}>{bullet}</div>
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}
