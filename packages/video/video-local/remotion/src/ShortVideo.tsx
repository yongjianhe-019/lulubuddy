/**
 * The storyboard's one composition.
 *
 * `<Series>` places each scene for exactly the length `timeline.ts` computes,
 * and `calculateMetadata` gives the composition the sum of those lengths, so the
 * scene boundary a viewer sees is the same number the progress bar runs on.
 */

import { AbsoluteFill, Audio, Series, staticFile, useVideoConfig } from 'remotion'
import { Background } from './Background.tsx'
import { ProgressBar } from './ProgressBar.tsx'
import { Subtitles } from './Subtitles.tsx'
import type { VideoProps, VideoSceneProps } from './contract.ts'
import { PointsScene } from './scenes/PointsScene.tsx'
import { QuoteScene } from './scenes/QuoteScene.tsx'
import { StatScene } from './scenes/StatScene.tsx'
import { TitleScene } from './scenes/TitleScene.tsx'
import { FONT_STACK } from './theme.ts'
import { sceneFrames } from './timeline.ts'

/**
 * Report an unreachable layout, so a new one cannot be added without a renderer.
 * @param layout - the value that should be impossible.
 * @throws always.
 */
function assertNever(layout: never): never {
  throw new Error(`unhandled scene layout: ${String(layout)}`)
}

/**
 * Draw one scene's text.
 * @param props - the scene and the video it belongs to.
 * @returns the scene's card.
 */
const SceneBody: React.FC<{ scene: VideoSceneProps; video: VideoProps }> = ({ scene, video }) => {
  switch (scene.layout) {
    case 'title': return <TitleScene heading={scene.heading} video={video} />
    case 'points': return <PointsScene scene={scene} />
    case 'quote': return <QuoteScene scene={scene} />
    case 'stat': return <StatScene scene={scene} />
    default: return assertNever(scene.layout)
  }
}

/**
 * Render one storyboard.
 * @param props - the storyboard the host sent.
 * @returns the video's frame tree.
 */
export const ShortVideo: React.FC<VideoProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ backgroundColor: '#071126', fontFamily: FONT_STACK }}>
      <Background />
      <Series>
        {props.scenes.map((scene, index) => (
          <Series.Sequence key={`${String(index)}-${scene.layout}`} durationInFrames={sceneFrames(scene.durationMs, fps)}>
            {/* A preview storyboard carries no audio; only a rendered one does. */}
            {scene.audio.length === 0 ? null : <Audio src={staticFile(scene.audio)} />}
            <SceneBody scene={scene} video={props} />
            <Subtitles cues={scene.subtitles} />
          </Series.Sequence>
        ))}
      </Series>
      <ProgressBar total={durationInFrames} />
    </AbsoluteFill>
  )
}
