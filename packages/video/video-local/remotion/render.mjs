#!/usr/bin/env node
/**
 * Render driver for the DSH short-video project.
 *
 * This file is the one part of the project the harness executes directly, and it
 * lives inside the project so its `@remotion/*` imports resolve against the
 * project's own installed versions. It is deliberately thin: the harness decides
 * the storyboard and the timeline, and this bundles the composition and encodes
 * it.
 *
 * Usage:
 *   node render.mjs --browser              install the browser a render needs
 *   node render.mjs <props.json> <out.mp4> render one storyboard
 *
 * Every run writes exactly one JSON object to stdout — `{ ok: true, ... }` or
 * `{ ok: false, error }` — and a failure also exits non-zero. Progress goes to
 * stderr so stdout stays one line the caller can parse.
 */

import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer'

/** Composition the host selects; it must match the one `src/Root.tsx` registers. */
const COMPOSITION_ID = 'ShortVideo'

/** Entry point of the composition graph, resolved from this file's own location. */
const ENTRY_POINT = fileURLToPath(new URL('./src/index.ts', import.meta.url))

/** Public directory `staticFile()` resolves against, resolved the same way. */
const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))

/**
 * Install the browser a render needs, so a first render is not the step that
 * discovers a missing download.
 * @returns the driver's success object.
 */
async function installBrowser() {
  await ensureBrowser()
  return { ok: true, browser: 'ready' }
}

/**
 * Render one storyboard.
 * @param propsPath - absolute path of the props document the harness wrote.
 * @param outputPath - absolute path the encoded video is written to.
 * @returns the driver's success object, carrying the composition's real geometry.
 */
async function render(propsPath, outputPath) {
  const inputProps = JSON.parse(readFileSync(propsPath, 'utf8'))
  const serveUrl = await bundle({ entryPoint: ENTRY_POINT, publicDir: PUBLIC_DIR })
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps })
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    inputProps,
    outputLocation: outputPath,
    overwrite: true,
    imageFormat: 'jpeg',
    onProgress: ({ renderedFrames, encodedFrames, progress }) => {
      process.stderr.write(`render frames ${String(renderedFrames)} encoded ${String(encodedFrames)} ${(progress * 100).toFixed(1)}%\n`)
    },
  })
  return {
    ok: true,
    output: outputPath,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationInFrames: composition.durationInFrames,
    bytes: statSync(outputPath).size,
  }
}

/** Run the driver for one command line and report its single JSON result. */
async function main() {
  const argv = process.argv.slice(2)
  if (argv[0] === '--browser') return await installBrowser()
  const [propsPath, outputPath] = argv
  if (propsPath === undefined || outputPath === undefined) {
    throw new Error('usage: render.mjs --browser | render.mjs <props.json> <out.mp4>')
  }
  return await render(propsPath, outputPath)
}

try {
  const result = await main()
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`)
  process.exitCode = 1
}
