/** The opening card: the video's own title, and the line under it. */

import { AbsoluteFill } from 'remotion'
import type { VideoProps } from '../contract.ts'
import { useEnter } from '../enter.ts'
import { COLORS, FONT, SAFE_X } from '../theme.ts'

/**
 * Draw the opening card.
 * @param props - the scene's heading and the video's own title and subtitle.
 * @returns the card.
 */
export const TitleScene: React.FC<{ heading: string | null; video: VideoProps }> = ({ heading, video }) => {
  const enter = useEnter(18, 34)
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingLeft: SAFE_X, paddingRight: SAFE_X, textAlign: 'center' }}>
      <div style={{ opacity: enter.opacity, transform: `translateY(${String(enter.offset)}px)` }}>
        <div style={{ fontSize: FONT.title, fontWeight: 800, color: COLORS.ink, lineHeight: 1.16, letterSpacing: '-0.01em' }}>
          {heading ?? video.title}
        </div>
        <div style={{ width: 148, height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentLight})`, margin: '52px auto 0' }} />
        {video.subtitle === null ? null : (
          <div style={{ marginTop: 44, fontSize: FONT.bullet, color: COLORS.muted, lineHeight: 1.4 }}>{video.subtitle}</div>
        )}
      </div>
    </AbsoluteFill>
  )
}
