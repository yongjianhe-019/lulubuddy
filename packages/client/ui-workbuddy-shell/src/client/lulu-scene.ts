/**
 * The hero mascot as a real 3D character.
 *
 * This module owns the three.js side only: it builds a low-poly Lulu from
 * primitives, lights it, and keeps a small idle loop plus drag-to-turn and
 * click-to-wave. `Lulu3D.tsx` owns the React lifecycle and the PNG fallback, and
 * imports this file dynamically so the initial client bundle never carries
 * three.js.
 */

import * as THREE from 'three'

/** Mount options the React wrapper passes down. */
export interface Lulu3DOptions {
  /** Edge in CSS pixels; the canvas is square. */
  size: number
  /** Render one frame and stop: no idle loop, no pointer interaction. */
  reducedMotion: boolean
}

const BODY = 0xffc93c
const MUZZLE = 0xffa92e
const SHORTS = 0xef8534
const EAR_INNER = 0xffb86b
const EYE = 0x241f1a

function mat(color: number, roughness = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })
}

/** A soft round contact shadow, drawn once into a canvas texture. */
function shadowTexture(): THREE.Texture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(90,60,20,0.30)')
    grad.addColorStop(0.55, 'rgba(90,60,20,0.12)')
    grad.addColorStop(1, 'rgba(90,60,20,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Build the character.
 * @returns the group, plus the parts the animation moves.
 */
function buildLulu(): {
  root: THREE.Group
  head: THREE.Group
  armRight: THREE.Group
  eyes: THREE.Mesh[]
} {
  const root = new THREE.Group()

  const bodyMat = mat(BODY)
  const muzzleMat = mat(MUZZLE, 0.65)
  const shortsMat = mat(SHORTS, 0.7)

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 40, 28), bodyMat)
  body.scale.set(1, 0.95, 0.92)
  body.position.y = 0.66
  root.add(body)

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.525, 40, 28), shortsMat)
  hips.scale.set(1.01, 0.62, 0.94)
  hips.position.y = 0.34
  root.add(hips)

  const footGeo = new THREE.SphereGeometry(0.2, 24, 18)
  for (const x of [-0.22, 0.22]) {
    const foot = new THREE.Mesh(footGeo, bodyMat)
    foot.scale.set(1, 0.72, 1.1)
    foot.position.set(x, 0.09, 0.10)
    root.add(foot)
  }

  const head = new THREE.Group()
  head.position.y = 1.30
  root.add(head)

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.55, 40, 28), bodyMat)
  skull.scale.set(1.06, 0.96, 0.96)
  head.add(skull)

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.42, 36, 24), muzzleMat)
  muzzle.scale.set(1.06, 0.78, 0.64)
  muzzle.position.set(0, -0.1, 0.34)
  head.add(muzzle)

  const earGeo = new THREE.SphereGeometry(0.12, 20, 14)
  const innerGeo = new THREE.SphereGeometry(0.075, 16, 12)
  for (const x of [-0.43, 0.43]) {
    const ear = new THREE.Mesh(earGeo, bodyMat)
    ear.scale.set(1, 0.95, 0.62)
    ear.position.set(x, 0.33, -0.04)
    head.add(ear)
    const inner = new THREE.Mesh(innerGeo, mat(EAR_INNER, 0.7))
    inner.scale.set(1, 0.95, 0.5)
    inner.position.set(x * 1.03, 0.33, 0.02)
    head.add(inner)
  }

  const eyes: THREE.Mesh[] = []
  const eyeGeo = new THREE.SphereGeometry(0.072, 20, 16)
  const glintGeo = new THREE.SphereGeometry(0.022, 12, 10)
  for (const x of [-0.19, 0.19]) {
    const eye = new THREE.Mesh(eyeGeo, mat(EYE, 0.35))
    eye.position.set(x, 0.12, 0.46)
    head.add(eye)
    eyes.push(eye)
    const glint = new THREE.Mesh(glintGeo, mat(0xffffff, 0.2))
    glint.position.set(x + 0.02, 0.145, 0.515)
    head.add(glint)
  }

  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), muzzleMat)
  tuft.scale.set(1, 0.8, 1)
  tuft.position.set(0, 0.56, 0.02)
  head.add(tuft)

  const armGeo = new THREE.CapsuleGeometry(0.12, 0.26, 8, 16)
  const armRight = new THREE.Group()
  armRight.position.set(0.56, 0.98, 0.02)
  const armR = new THREE.Mesh(armGeo, bodyMat)
  armR.position.y = -0.16
  armRight.add(armR)
  armRight.rotation.z = -1.35
  root.add(armRight)

  const armLeft = new THREE.Mesh(armGeo, bodyMat)
  armLeft.position.set(-0.52, 0.80, 0.06)
  armLeft.rotation.z = 0.5
  root.add(armLeft)

  return { root, head, armRight, eyes }
}

/**
 * Mount the 3D mascot into a square host element.
 * @param host - the element that receives the canvas.
 * @param options - edge length and the motion preference.
 * @returns a disposer that removes the canvas and frees GPU resources.
 */
export function mountLulu3D(host: HTMLElement, options: Lulu3DOptions): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setSize(options.size, options.size, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = `${options.size}px`
  renderer.domElement.style.height = `${options.size}px`
  renderer.domElement.style.cursor = options.reducedMotion ? 'default' : 'grab'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
  camera.position.set(0, 1.18, 3.55)
  camera.lookAt(0, 0.88, 0)

  scene.add(new THREE.HemisphereLight(0xffffff, 0xffd9a0, 1.15))
  const key = new THREE.DirectionalLight(0xffffff, 2.1)
  key.position.set(2.2, 3.4, 2.6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffe2b8, 0.7)
  fill.position.set(-3, 1.2, -2)
  scene.add(fill)

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.35),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.7 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(0, 0.005, -0.05)
  scene.add(shadow)

  const lulu = buildLulu()
  lulu.root.rotation.y = -0.18
  scene.add(lulu.root)

  let raf = 0
  let disposed = false
  let visible = true
  const clock = new THREE.Clock()
  let waveUntil = -1
  let drag: { x: number; moved: number; id: number } | null = null
  let spin = -0.18
  let spinVel = 0

  const render = () => {
    renderer.render(scene, camera)
  }

  const tick = () => {
    if (disposed) return
    raf = requestAnimationFrame(tick)
    if (!visible) return

    const t = clock.getElapsedTime()
    const breathe = Math.sin(t * 1.7) * 0.018
    lulu.root.position.y = breathe
    lulu.head.rotation.z = Math.sin(t * 0.9) * 0.035
    lulu.head.rotation.x = Math.sin(t * 1.3) * 0.02

    // Blink: a fast squash every few seconds, offset so it does not read as a loop.
    const phase = (t + 1.3) % 4.2
    const blink = phase < 0.14 ? Math.max(0.08, Math.abs(phase - 0.07) / 0.07) : 1
    for (const eye of lulu.eyes) eye.scale.y = blink

    // Wave: the raised arm swings for 1.2 s after a click.
    if (waveUntil > 0) {
      const left = waveUntil - t
      if (left <= 0) {
        waveUntil = -1
        lulu.armRight.rotation.z = -1.35
      } else {
        lulu.armRight.rotation.z = -1.35 + Math.sin(t * 16) * 0.32 * Math.min(1, left / 0.25)
      }
    }

    // Inertia after a drag, settling back to the resting angle.
    if (!drag) {
      spinVel *= 0.92
      spin += spinVel
      spin += (-0.18 - spin) * 0.04
      lulu.root.rotation.y = spin
    }

    render()
  }

  const onPointerDown = (e: PointerEvent) => {
    if (options.reducedMotion) return
    drag = { x: e.clientX, moved: 0, id: e.pointerId }
    renderer.domElement.style.cursor = 'grabbing'
    renderer.domElement.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    drag.x = e.clientX
    drag.moved += Math.abs(dx)
    spin += dx * 0.012
    spinVel = dx * 0.0016
    lulu.root.rotation.y = spin
  }
  const onPointerUp = (e: PointerEvent) => {
    if (!drag) return
    const moved = drag.moved
    drag = null
    renderer.domElement.style.cursor = 'grab'
    try { renderer.domElement.releasePointerCapture(e.pointerId) } catch { /* pointer already gone */ }
    if (moved < 6) {
      waveUntil = clock.getElapsedTime() + 1.2
      renderer.domElement.style.cursor = 'grab'
    }
  }
  const onPointerCancel = () => { drag = null; renderer.domElement.style.cursor = 'grab' }

  if (!options.reducedMotion) {
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerCancel)
  }

  // Stop the loop while the hero is scrolled out of view.
  const io = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((entries) => { visible = entries.some(entry => entry.isIntersecting) })
  io?.observe(host)

  if (options.reducedMotion) {
    render()
  } else {
    tick()
  }

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    io?.disconnect()
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel)
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      mesh.geometry?.dispose?.()
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(material)) material.forEach(m => m.dispose())
      else material?.dispose?.()
    })
    renderer.dispose()
    renderer.domElement.remove()
  }
}
