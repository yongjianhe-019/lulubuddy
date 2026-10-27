/**
 * Model-facing image beautification over three editorial treatments. The
 * renderer is local and deterministic: it treats the supplied photo as a
 * material on paper rather than calling an external image-generation model.
 *
 * @module @deepseek-ai/dsh-image-local/tools
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

export const name = 'image-tools'
export const inject = ['tools']

type Style = 'revival' | 'pixel' | 'zine'

const STYLES: readonly { id: Style; name: string; source: string; use: string }[] = [
  { id: 'revival', name: '诗意重绘', source: 'photo-revival', use: '白纸、大留白、小幅水彩/铅笔手绘、手写小字。' },
  { id: 'pixel', name: '像素世界', source: 'pixel-style-poster-skill', use: '细密方形像素、点阵半色调、扫描线、套色偏移、纸感。' },
  { id: 'zine', name: '旧报纸', source: 'gc-minimal-zine-poster', use: '褪色照片、半色调、Xerox 柔化、Riso 颗粒、旧纸。' },
]

function scriptPath(): string {
  const candidates = [
    new URL('../python/image_beautify.py', import.meta.url),
    new URL('../../python/image_beautify.py', import.meta.url),
  ].map(url => fileURLToPath(url))
  const found = candidates.find(candidate => existsSync(candidate))
  if (found === undefined) throw new Error('image-local: bundled renderer is missing')
  return found
}

function contextOf(exec: { agent?: { session?: { header?: { cwd?: string } } } }): string {
  return exec.agent?.session?.header?.cwd ?? process.cwd()
}

interface RenderResult {
  readonly output: string
  readonly style: Style
  readonly accent: string
  readonly warnings?: readonly string[]
}

async function render(
  source: string,
  output: string,
  style: Style,
  caption: string,
  accent: string,
  signal: AbortSignal,
): Promise<RenderResult> {
  const config = join(dirname(output), 'request.json')
  await writeFile(config, JSON.stringify({ source, output, style, caption, accent }), 'utf8')
  const python = process.env['DSH_PYTHON'] ?? 'python3'
  const result = await new Promise<RenderResult>((resolveRun, rejectRun) => {
    const child = spawn(python, [scriptPath(), config], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const abort = (): void => { child.kill('SIGTERM') }
    signal.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.once('error', (error) => {
      signal.removeEventListener('abort', abort)
      rejectRun(new Error(`image-local: could not start ${python}: ${error.message}`))
    })
    child.once('exit', (code) => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) { rejectRun(new Error('image-local: cancelled')); return }
      if (code !== 0) { rejectRun(new Error(`image-local: renderer failed${stderr.trim() === '' ? '' : `: ${stderr.trim().slice(-1200)}`}`)); return }
      try {
        const parsed = JSON.parse(stdout.trim().split(/\r?\n/u).at(-1) ?? '') as RenderResult
        resolveRun(parsed)
      } catch {
        rejectRun(new Error('image-local: renderer produced no JSON result'))
      }
    })
  })
  return result
}

/** One image result as the model and card read it. */
interface ImageValue extends Record<string, JsonValue> {
  readonly style: Style
  readonly sourcePath: string
  readonly outputPath: string
  readonly caption: string
  readonly accent: string
  readonly warnings: string[]
}

function result(value: ImageValue): string {
  return [
    `Image treatment: ${value.style}`,
    `source: ${value.sourcePath}`,
    `output: ${value.outputPath}`,
    `caption: ${value.caption}`,
    ...value.warnings.length === 0 ? [] : ['warnings:', ...value.warnings.map(warning => `- ${warning}`)],
    'renderer: local Pillow/OpenCV treatment; this is not an AI redraw.',
  ].join('\n')
}

function meta(value: ImageValue): JsonValue {
  return { version: 1, ...value }
}

export function registerImageTools(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'image_styles',
    description: 'List the three image beautification styles and the source skill each comes from. Call this before asking the user to choose, or when the user asks what styles exist.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: () => [{ type: 'text', text: STYLES.map(style => `- ${style.id} · ${style.name} (${style.source}): ${style.use}`).join('\n') }],
    },
    async execute() {
      return { styles: STYLES as unknown as JsonValue }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'image_beautify',
    description: 'Apply one local beautification style to a supplied photo. Requires a real source image path and a style: revival (photo-revival), pixel (pixel-style-poster), or zine (gc-minimal-zine-poster). The output is a 3:4/3:5 paper poster rendered locally, not an AI-redrawn image.',
    parameters: {
      sourcePath: { type: 'string', required: true, description: 'Absolute path to the uploaded/source photo.' },
      style: { type: 'string', required: true, enum: ['revival', 'pixel', 'zine'], description: 'revival, pixel, or zine.' },
      caption: { type: 'string', description: 'Short caption or poetic note; defaults to a quiet placeholder.' },
      accent: { type: 'string', description: 'Optional #RRGGBB accent color.' },
      outputDir: { type: 'string', description: 'Optional output directory; defaults to image-beautify/<style>-<timestamp>.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: result(value as ImageValue) }],
      presentationMeta: (_args, value) => meta(value as ImageValue),
    },
    timeoutMs: 180_000,
    async execute(args, exec) {
      const cwd = contextOf(exec)
      const sourcePath = resolve(cwd, args.sourcePath)
      if (!existsSync(sourcePath)) throw new Error(`image_beautify: source image not found: ${sourcePath}`)
      const style = args.style as Style
      const accent = args.accent ?? (style === 'revival' ? '#6f9fb0' : style === 'pixel' ? '#1f6f8b' : '#d24b3e')
      const outputDir = resolve(cwd, args.outputDir ?? join('image-beautify', `${style}-${String(Date.now())}`))
      await mkdir(outputDir, { recursive: true })
      const outputPath = join(outputDir, `${style}.png`)
      const caption = args.caption ?? (style === 'revival' ? '我记得，那一天。' : style === 'pixel' ? '把生活，编码成一张数字印刷品。' : '把照片里的记忆，贴入一张安静的旧纸。')
      const rendered = await render(sourcePath, outputPath, style, caption, accent, exec.signal)
      const info = await stat(outputPath)
      return {
        style,
        sourcePath,
        outputPath,
        caption,
        accent,
        bytes: info.size,
        warnings: [...rendered.warnings ?? []],
        renderer: 'local-pillow-opencv',
      }
    },
  }))
}

export function apply(ctx: Context): void {
  registerImageTools(ctx)
}
