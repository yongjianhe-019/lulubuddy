/** The composition registry. `remotion studio` and the render driver both read it. */

import { Composition } from 'remotion'
import { ShortVideo } from './ShortVideo.tsx'
import { COMPOSITION_ID, FPS, HEIGHT, PREVIEW_PROPS, WIDTH } from './contract.ts'
import { calculateShortVideoMetadata } from './timeline.ts'

/**
 * Register the composition.
 * @returns the root component Remotion renders.
 */
export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={ShortVideo}
    defaultProps={PREVIEW_PROPS}
    calculateMetadata={calculateShortVideoMetadata}
    durationInFrames={Math.round((PREVIEW_PROPS.totalMs / 1000) * FPS)}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
)
