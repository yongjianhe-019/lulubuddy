/**
 * WorkBuddy's brand mark for the two brand seats the shell leaves open: the
 * sidebar's `sidebar.brand.mark` and the blank-session
 * `conversation.hero.brand.mark`.
 *
 * The occupant is the operator's own mascot, installed as a generated PNG with
 * its background removed, so it sits on the page as a character rather than a
 * cropped photo. Until that asset exists the component renders the harness's
 * fish, so the fork builds and runs identically before and after a re-skin.
 */
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import { LULU_MARK_PNG } from './lulu-mark.generated.ts'

/** Geometry both brand seats supply. */
export interface LuluMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Extra class from the seat's owner (the hero supplies its own). */
  className?: string | undefined
  /** Multiplier for the rendered edge; the hero draws the mascot larger than its 34 px seat. */
  scale?: number
}

/**
 * Render the brand mark.
 * @param props - square edge, the owner's class, and an optional scale.
 * @returns the mascot when generated, otherwise the shipped fish.
 */
export function LuluMark({ size, className, scale = 1 }: LuluMarkProps) {
  if (LULU_MARK_PNG === undefined) return <FishLogo size={size} className={className} />
  const edge = Math.round(size * scale)
  return (
    <img
      src={`data:image/png;base64,${LULU_MARK_PNG}`}
      width={edge}
      height={edge}
      alt=""
      aria-hidden="true"
      className={className}
      style={{
        width: edge,
        height: edge,
        objectFit: 'contain',
        display: 'block',
        // A soft contact shadow keeps a flat cutout from looking pasted on.
        filter: 'drop-shadow(0 1px 2px rgb(90 60 20 / 0.22))',
      }}
    />
  )
}

/**
 * The hero seat's occupant: the same mark, drawn larger than the 34 px the seat
 * requests so it reads as the page's mascot rather than a bullet.
 * @param props - the hero seat's geometry.
 * @returns the enlarged mark.
 */
export function HeroLuluMark({ size, className }: Omit<LuluMarkProps, 'scale'>) {
  return <LuluMark size={size} className={className} scale={1.55} />
}
