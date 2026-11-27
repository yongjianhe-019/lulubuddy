/**
 * The hero mascot: two rendered poses from the operator's character sheet,
 * switched by interaction.
 *
 * A single cutout can only be transformed as a whole, so a wave looked like the
 * picture sliding around. These are separate renders of the same character held
 * at the same scale: clicking swaps to the waving pose for a moment, and the
 * seat keeps a slow breathe plus a small tilt toward the pointer.
 */
import { useEffect, useRef, useState } from 'react'
import { LULU_POSES } from './lulu-poses.generated.ts'

/** Poses the seat can show. */
type Pose = 'idle' | 'wave'

/** Geometry the hero seat supplies. */
export interface LuluMascotProps {
  /** Rendered height in CSS pixels. */
  size: number
  /** The hero's own class, passed through. */
  className?: string | undefined
}

/**
 * Draw the interactive mascot.
 * @param props - height and the hero's class.
 * @returns the character with its pose machine.
 */
export function LuluMascot({ size, className }: LuluMascotProps) {
  const host = useRef<HTMLDivElement>(null)
  const [pose, setPose] = useState<Pose>('idle')
  const timers = useRef<number[]>([])

  useEffect(() => () => { timers.current.forEach(id => window.clearTimeout(id)) }, [])

  useEffect(() => {
    const node = host.current
    if (!node) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) return

    const play = (next: Pose, hold: number) => {
      setPose(next)
      const id = window.setTimeout(() => setPose('idle'), hold)
      timers.current.push(id)
    }

    const onLeave = () => { setPose('idle') }
    const onClick = () => { play('wave', 1500) }

    node.addEventListener('pointerleave', onLeave)
    node.addEventListener('click', onClick)

    return () => {
      node.removeEventListener('pointerleave', onLeave)
      node.removeEventListener('click', onClick)
    }
  }, [])

  const ratio = LULU_POSES[pose].ratio
  const width = Math.round(size * ratio)

  return (
    <div
      ref={host}
      className={className}
      style={{ height: size, width, position: 'relative', cursor: 'pointer', userSelect: 'none' }}
      aria-hidden="true"
    >
      <style>{`
        .lulu-seat { transition: transform .25s ease-out; transform-origin: 50% 92%; }
        .lulu-seat.is-idle { animation: lulu-breathe 4.2s ease-in-out infinite; }
        @keyframes lulu-breathe { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .lulu-face { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
                     opacity: 0; transform: scale(.985); transition: opacity .18s ease, transform .22s ease;
                     filter: drop-shadow(0 6px 10px rgb(120 80 30 / .16)); }
        .lulu-face.on { opacity: 1; transform: scale(1); }
      `}</style>
      <div className={`lulu-seat${pose === 'idle' ? ' is-idle' : ''}`} style={{ width: '100%', height: '100%' }}>
        {(Object.keys(LULU_POSES) as Pose[]).map(key => (
          <img
            key={key}
            className={`lulu-face${key === pose ? ' on' : ''}`}
            src={`data:image/png;base64,${LULU_POSES[key].png}`}
            alt=""
            draggable={false}
          />
        ))}
      </div>
    </div>
  )
}
