/**
 * Frame arithmetic. The host half never sends frames — it sends milliseconds,
 * because the composition is the only side that knows its own frame rate — so
 * every conversion between the two happens here.
 */

import { FPS, type VideoProps } from './contract.ts'

/**
 * Convert one scene's wall-clock length to the frames it occupies.
 * @param durationMs - the scene's length in milliseconds.
 * @param fps - the composition's frame rate.
 * @returns at least one frame, so a very short scene still renders.
 */
export function sceneFrames(durationMs: number, fps: number): number {
  return Math.max(1, Math.round((durationMs / 1000) * fps))
}

/**
 * Sum every scene's frames.
 * @param props - the storyboard.
 * @param fps - the composition's frame rate.
 * @returns the composition's total length in frames.
 */
export function totalFrames(props: VideoProps, fps: number): number {
  let total = 0
  for (const scene of props.scenes) total += sceneFrames(scene.durationMs, fps)
  return Math.max(1, total)
}

/**
 * Compute the composition's length from the storyboard it is rendering.
 *
 * `<Series>` places each scene for its own `sceneFrames` length, so the total
 * computed here is exactly the sum those placements produce; deriving both from
 * this one function is what keeps the progress bar and the last scene in step.
 * @param options - Remotion's metadata callback argument.
 * @param options.props - the storyboard being rendered.
 * @returns the composition's length in frames.
 */
export function calculateShortVideoMetadata({ props }: { props: VideoProps }): { durationInFrames: number } {
  return { durationInFrames: totalFrames(props, FPS) }
}
