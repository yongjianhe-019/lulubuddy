/** One sentence given the whole card, for the line a video wants remembered. */

import { AbsoluteFill } from 'remotion'
import type { VideoSceneProps } from '../contract.ts'
import { useEnter } from '../enter.ts'
import { COLORS, FONT, SAFE_X } from '../theme.ts'

/**
 * Draw a quoted sentence.
 *
 * The sentence is the scene's heading when it has one, otherwise its first
 * supporting line, otherwise the narration itself, so the scene still says
 * something when a storyboard leaves the heading out.
 * @param props - the scene.
 * @returns the card.
 */
export const QuoteScene: React.FC<{ scene: VideoSceneProps }> = ({ scene }) => {
  const enter = useEnter(16, 30)
  const sentence = scene.heading ?? scene.bullets[0] ?? scene.narration
  return (
    <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: SAFE_X, paddingRight: SAFE_X }}>
      <div style={{ opacity: enter.opacity, transform: `translateY(${String(enter.offset)}px)`, display: 'flex', gap: 40 }}>
        <div style={{ flex: '0 0 auto', width: 12, borderRadius: 6, background: `linear-gradient(180deg, ${COLORS.accent}, ${COLORS.accentLight})` }} />
        <div>
          <div style={{ fontSize: 120, lineHeight: 0.7, color: COLORS.accent, fontWeight: 800 }}>{'“'}</div>
          <div style={{ fontSize: FONT.quote, fontWeight: 700, color: COLORS.ink, lineHeight: 1.42, marginTop: 26 }}>{sentence}</div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
