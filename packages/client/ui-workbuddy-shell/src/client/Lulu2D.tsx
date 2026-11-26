/**
 * The hero mascot as a 2.5D cartoon: a flat SVG character with soft shading that
 * tilts toward the pointer, blinks on its own and waves when clicked.
 *
 * This replaced a primitive-modeled three.js figure. A drawn character reads
 * better at hero size and costs no WebGL context; the motion is CSS transforms
 * on the same artwork, which is what "half 3D" means here.
 */
import { useEffect, useRef } from 'react'

/** Geometry the hero seat supplies. */
export interface Lulu2DProps {
  /** Square edge in CSS pixels. */
  size: number
  /** The hero's own class, passed through. */
  className?: string | undefined
}

/**
 * Draw the character and wire its idle and pointer behaviour.
 * @param props - edge length and the hero's class.
 * @returns the interactive mascot.
 */
export function Lulu2D({ size, className }: Lulu2DProps) {
  const host = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const eyes = useRef<SVGGElement>(null)

  useEffect(() => {
    const node = host.current
    const art = svg.current
    if (!node || !art) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reduced) return

    let blinkTimer = 0
    const blink = () => {
      eyes.current?.classList.add('lulu-blink')
      window.setTimeout(() => eyes.current?.classList.remove('lulu-blink'), 180)
      blinkTimer = window.setTimeout(blink, 2600 + Math.random() * 2600)
    }
    blinkTimer = window.setTimeout(blink, 2200)

    const onMove = (event: PointerEvent) => {
      const r = node.getBoundingClientRect()
      const dx = (event.clientX - r.left) / r.width - 0.5
      const dy = (event.clientY - r.top) / r.height - 0.5
      art.style.transform = `rotateY(${(dx * 16).toFixed(2)}deg) rotateX(${(-dy * 12).toFixed(2)}deg)`
    }
    const onLeave = () => { art.style.transform = '' }
    const onClick = () => {
      node.classList.add('lulu-wave')
      window.setTimeout(() => node.classList.remove('lulu-wave'), 1100)
    }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    node.addEventListener('click', onClick)

    return () => {
      window.clearTimeout(blinkTimer)
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
      node.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <div
      ref={host}
      className={className}
      style={{ width: size, height: size, perspective: '600px', cursor: 'pointer' }}
      aria-hidden="true"
    >
      <svg
        ref={svg}
        viewBox="0 0 200 220"
        style={{ width: '100%', height: '100%', display: 'block', transformStyle: 'preserve-3d', transition: 'transform .18s ease-out', overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="luluBody" cx="42%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFE07A" />
            <stop offset="55%" stopColor="#FFC93C" />
            <stop offset="100%" stopColor="#F2B32C" />
          </radialGradient>
          <radialGradient id="luluHead" cx="40%" cy="26%" r="72%">
            <stop offset="0%" stopColor="#FFE486" />
            <stop offset="58%" stopColor="#FFC93C" />
            <stop offset="100%" stopColor="#F0AE28" />
          </radialGradient>
          <radialGradient id="luluMuzzle" cx="46%" cy="24%" r="80%">
            <stop offset="0%" stopColor="#FFC061" />
            <stop offset="60%" stopColor="#FFA92E" />
            <stop offset="100%" stopColor="#F29122" />
          </radialGradient>
          <linearGradient id="luluShorts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F79546" />
            <stop offset="100%" stopColor="#E57624" />
          </linearGradient>
          <clipPath id="luluBodyClip">
            <path d="M100 96 C126 96 139 118 139 141 C139 166 123 182 100 182 C77 182 61 166 61 141 C61 118 74 96 100 96 Z" />
          </clipPath>
        </defs>

        <style>{`
          #lulu-rig { animation: lulu-breathe 3.4s ease-in-out infinite; transform-origin: 50% 100%; }
          @keyframes lulu-breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-4px) scale(1.012); } }
          #lulu-arm { transform-origin: 134px 126px; transition: transform .2s ease; }
          .lulu-wave #lulu-arm { animation: lulu-wave 1.05s ease-in-out; }
          @keyframes lulu-wave { 0%,100% { transform: rotate(0deg); } 20% { transform: rotate(-16deg); } 45% { transform: rotate(8deg); } 70% { transform: rotate(-16deg); } }
          #lulu-eyes { transform-origin: 100px 70px; }
          .lulu-blink #lulu-eyes { animation: lulu-blink .18s ease; }
          @keyframes lulu-blink { 0%,100% { transform: scaleY(1); } 45% { transform: scaleY(.08); } }
        `}</style>

        <g id="lulu-rig">
          <ellipse cx="100" cy="202" rx="42" ry="8" fill="#5A3C14" opacity=".12" />

          <path d="M67 126 L59 162" stroke="url(#luluBody)" strokeWidth="13" strokeLinecap="round" />
          <g id="lulu-arm">
            <path d="M134 126 L159 94" stroke="url(#luluBody)" strokeWidth="13" strokeLinecap="round" />
          </g>

          <path d="M100 96 C126 96 139 118 139 141 C139 166 123 182 100 182 C77 182 61 166 61 141 C61 118 74 96 100 96 Z" fill="url(#luluBody)" />

          <g clipPath="url(#luluBodyClip)">
            <rect x="55" y="150" width="90" height="40" fill="url(#luluShorts)" />
            <path d="M100 152 L100 186" stroke="#D96B1C" strokeWidth="2" opacity=".38" />
          </g>

          <ellipse cx="84" cy="188" rx="14" ry="10" fill="url(#luluBody)" />
          <ellipse cx="116" cy="188" rx="14" ry="10" fill="url(#luluBody)" />

          <circle cx="54" cy="46" r="11" fill="url(#luluHead)" />
          <circle cx="54" cy="46" r="5.5" fill="#FFB86B" />
          <circle cx="146" cy="46" r="11" fill="url(#luluHead)" />
          <circle cx="146" cy="46" r="5.5" fill="#FFB86B" />

          <circle cx="100" cy="78" r="50" fill="url(#luluHead)" />
          <ellipse cx="100" cy="23" rx="9" ry="6" fill="#FF9F2E" />

          <ellipse cx="100" cy="94" rx="35" ry="26" fill="url(#luluMuzzle)" />
          <ellipse cx="96" cy="104" rx="24" ry="12" fill="#F29A28" opacity=".25" />
          <path d="M92 112 Q100 117 108 112" stroke="#D97A1A" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".55" />

          <g id="lulu-eyes">
            <ellipse cx="82" cy="70" rx="6.6" ry="7.8" fill="#241F1A" />
            <ellipse cx="118" cy="70" rx="6.6" ry="7.8" fill="#241F1A" />
            <circle cx="84.3" cy="67.2" r="2.2" fill="#fff" />
            <circle cx="120.3" cy="67.2" r="2.2" fill="#fff" />
          </g>
        </g>
      </svg>
    </div>
  )
}
