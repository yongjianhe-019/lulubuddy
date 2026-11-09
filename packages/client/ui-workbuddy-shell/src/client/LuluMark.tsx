/**
 * WorkBuddy's brand mark for the two brand seats the shell leaves open: the
 * sidebar's `sidebar.brand.mark` and the blank-session
 * `conversation.hero.brand.mark`.
 *
 * The occupant is the operator's own mascot, installed as a generated PNG. Until
 * that asset exists the component renders the harness's fish, so the fork builds
 * and runs identically before and after a re-skin.
 */
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import { LULU_MARK_PNG } from './lulu-mark.generated.ts'

/** Geometry both brand seats supply. */
export interface LuluMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Extra class from the seat's owner (the hero supplies its own). */
  className?: string | undefined
}

/**
 * Render the brand mark.
 * @param props - square edge and the owner's class.
 * @returns the mascot when generated, otherwise the shipped fish.
 */
export function LuluMark({ size, className }: LuluMarkProps) {
  if (LULU_MARK_PNG === undefined) return <FishLogo size={size} className={className} />
  return (
    <img
      src={`data:image/png;base64,${LULU_MARK_PNG}`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'block',
        // A hairline ring keeps the dark plush off a dark sidebar.
        boxShadow: '0 0 0 1px rgb(255 255 255 / 0.35)',
      }}
    />
  )
}
