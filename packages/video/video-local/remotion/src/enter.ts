/** The shared entrance animation every scene's content uses. */

import { interpolate, useCurrentFrame } from 'remotion'

/**
 * Fade and lift the enclosing content as its scene opens.
 * @param inFrames - how long the entrance takes.
 * @param from - how far below its resting place the content starts, in pixels.
 * @returns the opacity and the vertical offset for the current frame.
 */
export function useEnter(inFrames = 14, from = 28): { opacity: number; offset: number } {
  const frame = useCurrentFrame()
  return {
    opacity: interpolate(frame, [0, inFrames], [0, 1], { extrapolateRight: 'clamp' }),
    offset: interpolate(frame, [0, inFrames], [from, 0], { extrapolateRight: 'clamp' }),
  }
}
