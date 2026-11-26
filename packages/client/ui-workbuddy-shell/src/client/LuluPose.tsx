/**
 * The hero mascot: the operator's rendered character, cut out and animated.
 *
 * A drawn SVG and a primitive 3D model both read as "not the mascot". This uses
 * the real render — subject-masked from the mascot sheet — and keeps the motion
 * in CSS: a slow breathe, a tilt that follows the pointer, and a hop on click.
 */
import { useEffect, useRef } from 'react'
import { LULU_POSE_PNG } from './lulu-pose.generated.ts'

/** Geometry the hero seat supplies. */
export interface LuluPoseProps {
  /** Rendered height in CSS pixels; width follows the artwork's ratio. */
  size: number
  /** The hero's own class, passed through. */
  className?: string | undefined
}

/**
 * Draw the animated mascot.
 * @param props - height and the hero's class.
 * @returns the character, or nothing before the cutout exists.
 */
export function LuluPose({ size, className }: LuluPoseProps) {
  const host = useRef<HTMLDivElement>(null)
  const art = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const node = host.current
    const img = art.current
    if (!node || !img) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) return

    let raf = 0
    let targetX = 0
    let targetY = 0
    let x = 0
    let y = 0

    const loop = () => {
      raf = requestAnimationFrame(loop)
      x += (targetX - x) * 0.12
      y += (targetY - y) * 0.12
      img.style.transform = `rotateY(${x.toFixed(2)}deg) rotateX(${y.toFixed(2)}deg)`
    }

    const onMove = (event: PointerEvent) => {
      const r = node.getBoundingClientRect()
      targetX = ((event.clientX - r.left) / r.width - 0.5) * 18
      targetY = -((event.clientY - r.top) / r.height - 0.5) * 12
    }
    const onLeave = () => { targetX = 0; targetY = 0 }
    const onClick = () => {
      node.classList.remove('lulu-hop')
      void node.offsetWidth
      node.classList.add('lulu-hop')
      window.setTimeout(() => node.classList.remove('lulu-hop'), 620)
    }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    node.addEventListener('click', onClick)
    loop()

    return () => {
      cancelAnimationFrame(raf)
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
      node.removeEventListener('click', onClick)
    }
  }, [])

  if (LULU_POSE_PNG === undefined) return null

  return (
    <div
      ref={host}
      className={className}
      style={{ height: size, width: Math.round(size * 0.69), perspective: '700px', cursor: 'pointer' }}
      aria-hidden="true"
    >
      <style>{`
        .lulu-frame { animation: lulu-breathe 4.2s ease-in-out infinite; transform-origin: 50% 92%; }
        @keyframes lulu-breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3px) scale(1.008); } }
        .lulu-hop .lulu-frame { animation: lulu-hop .6s cubic-bezier(.3,1.4,.5,1); }
        @keyframes lulu-hop {
          0% { transform: translateY(0) scale(1,1); }
          25% { transform: translateY(-14px) scale(.97,1.04); }
          55% { transform: translateY(0) scale(1.05,.95); }
          75% { transform: translateY(-5px) scale(1,1); }
          100% { transform: translateY(0) scale(1,1); }
        }
      `}</style>
      <div className="lulu-frame" style={{ height: '100%', width: '100%' }}>
        <img
          ref={art}
          src={`data:image/png;base64,${LULU_POSE_PNG}`}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            transformStyle: 'preserve-3d',
            willChange: 'transform',
            filter: 'drop-shadow(0 6px 10px rgb(120 80 30 / 0.18))',
          }}
        />
      </div>
    </div>
  )
}
