/**
 * HTML deck export: a local static server, a headless browser, one screenshot
 * per slide, then python-pptx turns those frames into a 16:9 PPTX.
 *
 * The export is intentionally image-based: the HTML deck is the design source,
 * and a screenshot preserves it exactly. Native editable PPTX generation is a
 * separate concern because the browser layout cannot be reverse-engineered
 * reliably into PowerPoint shapes.
 *
 * @module @deepseek-ai/dsh-ppt-local/export
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import type { PptExportResult } from './types.ts'

/** The bundled Python helper that writes the PPTX. */
function pythonScript(): string {
  const candidates = [
    new URL('../python/pptx_from_images.py', import.meta.url),
    new URL('../../python/pptx_from_images.py', import.meta.url),
  ].map(url => fileURLToPath(url))
  const found = candidates.find(candidate => existsSync(candidate))
  if (found === undefined) throw new Error('ppt-local: bundled python helper is missing')
  return found
}

const PPTX_SCRIPT = pythonScript()

/** MIME types the tiny static server needs for a self-contained deck. */
const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

/** One running static server and its bound URL. */
interface DeckServer {
  readonly url: string
  close(): Promise<void>
}

/**
 * Serve a deck directory on an ephemeral loopback port.
 * @param root - absolute deck directory.
 * @returns the server's URL and a close operation.
 */
async function serve(root: string): Promise<DeckServer> {
  const absoluteRoot = resolve(root)
  const handler = async (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse): Promise<void> => {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/')
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/u, '')
    const target = resolve(absoluteRoot, relative)
    if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`)) {
      response.writeHead(403).end('forbidden')
      return
    }
    try {
      const info = await stat(target)
      if (!info.isFile()) throw new Error('not a file')
      const body = await readFile(target)
      response.writeHead(200, {
        'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'no-store',
      })
      response.end(body)
    } catch {
      response.writeHead(404).end('not found')
    }
  }
  const server: Server = createServer((request, response) => { void handler(request, response) })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => { resolveListen() })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('ppt-export: static server did not bind a TCP port')
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}/index.html`,
    close: () => new Promise<void>((resolveClose) => { server.close(() => { resolveClose() }) }),
  }
}

/** Launch the local Chrome channel, falling back to Playwright's bundled Chromium. */
async function launchBrowser(): Promise<import('playwright').Browser> {
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' })
  } catch {
    return chromium.launch({ headless: true })
  }
}

/**
 * Render every slide to a PNG at the requested pixel size.
 * @param htmlPath - absolute path to the deck's index.html.
 * @param imagesDir - directory to write slide-1.png, slide-2.png, ...
 * @param width - frame width in pixels.
 * @param height - frame height in pixels.
 * @param signal - cancels the render.
 * @returns the number of slides and the image paths in play order.
 */
export async function renderSlides(
  htmlPath: string,
  imagesDir: string,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<{ count: number; images: string[] }> {
  await mkdir(imagesDir, { recursive: true })
  const server = await serve(dirname(htmlPath))
  const browser = await launchBrowser()
  const abort = (): void => { void browser.close() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('.slide', { timeout: 30_000 })
    await page.addStyleTag({ content: '#nav,#hint{display:none!important}' })
    await page.evaluate(async () => { await document.fonts?.ready })
    const count = await page.locator('.slide').count()
    if (count === 0) throw new Error('ppt-export: the deck has no slides')
    await page.evaluate(() => {
      // Deterministic frames: skip the entrance choreography, keep the final state.
      Object.assign(window, { __lowPowerMode: true })
    })
    const images: string[] = []
    for (let index = 0; index < count; index += 1) {
      signal.throwIfAborted()
      await page.evaluate((target) => {
        const go = (window as unknown as { go?: (n: number) => void }).go
        if (go === undefined) throw new Error('ppt-export: deck does not expose go()')
        ;(go as (n: number, options?: { force?: boolean }) => void)(target, { force: true })
      }, index)
      await page.waitForTimeout(450)
      const image = join(imagesDir, `slide-${String(index + 1)}.png`)
      await page.screenshot({ path: image, clip: { x: 0, y: 0, width, height } })
      images.push(image)
    }
    return { count, images }
  } finally {
    signal.removeEventListener('abort', abort)
    await browser.close()
    await server.close()
  }
}

/** One image export request for the Python helper. */
interface PptxRequest {
  readonly images: readonly string[]
  readonly output: string
  readonly width: number
  readonly height: number
  readonly notes: readonly string[]
}

/**
 * Build the PPTX from rendered frames with python-pptx.
 * @param request - images, output path, frame size, and speaker notes.
 * @param signal - cancels the process.
 * @returns after the file exists and is non-empty.
 */
async function buildPptx(request: PptxRequest, signal: AbortSignal): Promise<void> {
  const configPath = join(dirname(request.images[0] ?? request.output), 'pptx-request.json')
  await writeFile(configPath, JSON.stringify(request), 'utf8')
  const python = process.env['DSH_PYTHON'] ?? 'python3'
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(python, [PPTX_SCRIPT, configPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const abort = (): void => { child.kill('SIGTERM') }
    signal.addEventListener('abort', abort, { once: true })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.once('error', (error) => {
      signal.removeEventListener('abort', abort)
      rejectRun(new Error(`ppt-export: could not start ${python}: ${error.message}`))
    })
    child.once('exit', (code) => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) { rejectRun(new Error('ppt-export: export cancelled')); return }
      if (code !== 0) { rejectRun(new Error(`ppt-export: python-pptx failed${stderr.trim() === '' ? '' : `: ${stderr.trim()}`}`)); return }
      resolveRun()
    })
  })
}

/**
 * Export one HTML deck to a high-fidelity image-based PPTX.
 * @param htmlPath - absolute deck HTML path.
 * @param outputPath - absolute PPTX path; defaults beside the HTML.
 * @param width - frame width in pixels.
 * @param height - frame height in pixels.
 * @param notes - speaker notes, one per slide.
 * @param signal - cancels the export.
 * @returns paths and measured facts.
 */
export async function exportDeck(
  htmlPath: string,
  outputPath: string | undefined,
  width: number,
  height: number,
  notes: readonly string[],
  signal: AbortSignal,
): Promise<PptExportResult> {
  const imagesDir = join(dirname(htmlPath), '.ppt-export', `run-${String(Date.now())}`)
  const { count, images } = await renderSlides(htmlPath, imagesDir, width, height, signal)
  const pptxPath = outputPath ?? join(dirname(htmlPath), `${basename(htmlPath, extname(htmlPath))}.pptx`)
  await buildPptx({
    images,
    output: pptxPath,
    width,
    height,
    notes: Array.from({ length: count }, (_, i) => notes[i] ?? ''),
  }, signal)
  const info = await stat(pptxPath)
  return { pptxPath, slideCount: count, bytes: info.size, imagesDir }
}
