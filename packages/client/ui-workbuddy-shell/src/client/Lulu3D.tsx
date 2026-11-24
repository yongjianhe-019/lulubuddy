/**
 * React wrapper for the 3D hero mascot.
 *
 * three.js is imported on mount, not with the client bundle, and the PNG mark
 * stays the fallback for a missing WebGL context or a reduced-motion request, so
 * the seat never renders an empty box.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Lulu3DOptions } from './lulu-scene.ts'

/** Geometry the hero seat supplies. */
export interface Lulu3DProps {
  /** Square edge in CSS pixels. */
  size: number
  /** The hero's own class, passed through to the host element. */
  className?: string | undefined
  /** Drawn instead of the canvas when WebGL is missing or the scene fails to load. */
  fallback?: ReactNode
}

/**
 * Whether this browser can and should draw the 3D mark.
 * @returns true when WebGL is available.
 */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * Draw the mascot as a 3D character.
 * @param props - edge length and the hero's class.
 * @returns the host element, or null while the scene is unavailable.
 */
export function Lulu3D({ size, className, fallback = null }: Lulu3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    const node = host.current
    if (!node) return
    if (!supportsWebGL()) { setAvailable(false); return }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const options: Lulu3DOptions = { size, reducedMotion }
    let dispose: (() => void) | undefined
    let cancelled = false

    void import('./lulu-scene.ts')
      .then((module) => {
        if (cancelled) return
        dispose = module.mountLulu3D(node, options)
      })
      .catch(() => { if (!cancelled) setAvailable(false) })

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [size])

  if (!available) return <>{fallback}</>

  return (
    <div
      ref={host}
      className={className}
      style={{ width: size, height: size, position: 'relative' }}
      role="img"
      aria-label=""
    />
  )
}
