/**
 * Model-facing presentation tools over the bundled Swiss renderer: create a
 * deck from a structured slide spec and export the rendered deck to a
 * high-fidelity image-based PPTX. The renderer owns markup and safety; the
 * model owns the story and the numbers.
 *
 * @module @deepseek-ai/dsh-ppt-local/tools
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { exportDeck } from './export.ts'
import { renderDeck } from './render.ts'
import type { PptDeck, PptSlide } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'ppt-tools'

/** The tool registry this entry registers into. */
export const inject = ['tools']

/** A 16:9 frame matches the shipped template and PowerPoint's widescreen deck. */
const DEFAULT_WIDTH = 1600
const DEFAULT_HEIGHT = 900

/** One tool's cooperative budget; a first export includes a browser round trip. */
const TIMEOUT_MS = 300_000

/** The shared open-object output spec. */
const DOCUMENT_SCHEMA = { type: 'object', additionalProperties: true } as const

const METRIC = {
  value: { type: 'string', required: true, description: 'Large display value, including the unit.' },
  label: { type: 'string', required: true, description: 'Short uppercase label.' },
  note: { type: 'string', description: 'One-line explanation.' },
  size: { type: 'number', description: 'Relative tower height 1-4. Defaults to 3, first metric 4.' },
} as const

const SIDE = {
  tag: { type: 'string', required: true, description: 'Uppercase tag, e.g. DOMESTIC / COLD.' },
  value: { type: 'string', required: true, description: 'Large number or short statement.' },
  description: { type: 'string', description: 'One-line reading under the value.' },
  bullets: { type: 'array', items: { type: 'string' }, description: 'Three or four evidence bullets.' },
} as const

const BAR = {
  label: { type: 'string', required: true, description: 'Row label.' },
  value: { type: 'number', required: true, description: 'Percentage 0-100; also the bar width.' },
  display: { type: 'string', description: 'Optional display text, e.g. 67.0%.' },
} as const

const STEP = {
  label: { type: 'string', required: true, description: 'Date or stage label.' },
  value: { type: 'string', description: 'Optional value under the date.' },
} as const

const LAYER = {
  tag: { type: 'string', required: true, description: 'Uppercase layer tag.' },
  title: { type: 'string', required: true, description: 'Layer title.' },
  description: { type: 'string', required: true, description: 'One paragraph of evidence.' },
} as const

const TAKEAWAY = {
  title: { type: 'string', required: true, description: 'Short imperative title.' },
  description: { type: 'string', required: true, description: 'One or two lines of explanation.' },
} as const

const SLIDE_SCHEMA = {
  type: 'object',
  properties: {
    layout: {
      type: 'string', required: true,
      enum: ['cover', 'kpi', 'compare', 'bars', 'timeline', 'layers', 'closing'],
      description: 'Named layout. Use exactly one per slide.',
    },
    title: { type: 'string', required: true, description: 'Slide title.' },
    kicker: { type: 'string', description: 'Small uppercase section label.' },
    lead: { type: 'string', description: 'One or two lines of context under the title.' },
    source: { type: 'string', description: 'Data source / footnote line.' },
    metrics: { type: 'array', items: { type: 'object', properties: METRIC, additionalProperties: false }, description: 'Exactly 4 for kpi.' },
    left: { type: 'object', properties: SIDE, additionalProperties: false, description: 'Left side for compare.' },
    right: { type: 'object', properties: SIDE, additionalProperties: false, description: 'Right side for compare.' },
    bars: { type: 'array', items: { type: 'object', properties: BAR, additionalProperties: false }, description: '5-8 rows for bars.' },
    steps: { type: 'array', items: { type: 'object', properties: STEP, additionalProperties: false }, description: '5-7 nodes for timeline.' },
    layers: { type: 'array', items: { type: 'object', properties: LAYER, additionalProperties: false }, description: 'Exactly 3 for layers.' },
    takeaways: { type: 'array', items: { type: 'object', properties: TAKEAWAY, additionalProperties: false }, description: 'Exactly 3 for closing.' },
  },
  additionalProperties: false,
} as const

/** The canonical result: facts for the model, payload for the card. */
interface PptToolValue extends Record<string, JsonValue> {
  readonly title: string
  readonly htmlPath: string
  readonly htmlAddress?: string
  readonly deckPath: string
  readonly pptxPath?: string
  readonly pptxUrl?: string
  readonly slideCount: number
  readonly bytes?: number
  readonly warnings: string[]
}

/** Resolve a safe file slug from a title. */
function slugOf(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '').trim().replace(/\s+/gu, '-')
  return cleaned.slice(0, 48) === '' ? 'presentation' : cleaned.slice(0, 48)
}

/** Read the workspace root and session identity a tool call runs under. */
function contextOf(exec: {
  agent?: { session?: { id?: unknown; header?: { cwd?: string } } }
}): { cwd: string; sessionId: string | undefined } {
  const session = exec.agent?.session
  return {
    cwd: session?.header?.cwd ?? process.cwd(),
    sessionId: session?.id === undefined ? undefined : String(session.id),
  }
}

/** The model-facing summary, deliberately short: the card carries the files. */
function renderResult(value: Record<string, JsonValue>): string {
  const warnings = Array.isArray(value['warnings']) ? value['warnings'] : []
  const lines = [
    `PPT: ${String(value['title'] ?? '')}`,
    `slides: ${String(value['slideCount'] ?? '')}`,
    `html: ${String(value['htmlPath'] ?? '')}`,
    ...(typeof value['pptxPath'] === 'string' ? [`pptx: ${value['pptxPath']}`] : []),
    ...(typeof value['pptxUrl'] === 'string' ? [`download: ${value['pptxUrl']}`] : []),
    ...(warnings.length === 0 ? [] : ['warnings:', ...warnings.map(item => `- ${String(item)}`)]),
  ]
  return lines.join('\n')
}

/** The card payload; the model never needs to read this object. */
function metaOf(value: Record<string, JsonValue>): JsonValue {
  return {
    version: 1,
    title: value['title'] ?? '',
    htmlPath: value['htmlPath'] ?? '',
    htmlAddress: value['htmlAddress'] ?? null,
    pptxPath: value['pptxPath'] ?? null,
    pptxUrl: value['pptxUrl'] ?? null,
    slideCount: value['slideCount'] ?? 0,
    bytes: value['bytes'] ?? 0,
    warnings: value['warnings'] ?? [],
  }
}

/** Read the deck spec a create call wrote, for notes and re-export. */
async function readDeck(deckPath: string): Promise<PptDeck | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(deckPath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const deck = parsed as PptDeck
    return Array.isArray(deck.slides) ? deck : null
  } catch {
    return null
  }
}

/** Speaker notes in one line each; the PPTX notes pane reads them. */
function notesOf(deck: PptDeck | null): string[] {
  if (deck === null) return []
  return deck.slides.map((slide: PptSlide) => [slide.title, slide.lead ?? ''].filter(Boolean).join('\n'))
}

/** Register the two presentation tools. */
export function registerPptTools(ctx: import('@deepseek-ai/cordis').Context): void {
  ctx.tools.register(defineTool({
    name: 'ppt_create',
    description: [
      'Create a polished 16:9 Swiss-style HTML deck from a structured slide spec, then export a high-fidelity image-based PPTX by default.',
      'Use 6 to 9 slides. Open with cover, close with closing, and choose one layout per slide: kpi (exactly 4 metrics), compare (left + right), bars (5-8 percentage rows), timeline (5-7 steps), layers (exactly 3), or closing (exactly 3 takeaways).',
      'Write the story yourself. One idea per slide; put the conclusion in the title; keep lead to one or two lines. Every number must come from the user or a tool, and every data slide should carry a source line.',
      'The tool writes index.html, deck.json, and a PPTX in the session workspace. The result card opens the HTML in the existing document iframe and offers the PPTX download. Call ppt_export again only after editing the HTML or deck.json.',
    ].join(' '),
    parameters: {
      title: { type: 'string', required: true, description: 'Deck title, also used for the folder and file name.' },
      subtitle: { type: 'string', description: 'Optional subtitle.' },
      theme: { type: 'string', enum: ['ikb', 'lemon', 'green', 'orange'], description: 'Accent palette. Defaults to ikb (Klein blue).' },
      slides: { type: 'array', required: true, items: SLIDE_SCHEMA, description: 'Slides in play order, 5-12. Prefer 6-9.' },
      outputDir: { type: 'string', description: 'Workspace-relative or absolute output directory. Defaults to presentations/<slug>-<timestamp>.' },
      export: { type: 'boolean', description: 'Export the PPTX immediately. Defaults to true.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
      presentationMeta: (_args, value) => metaOf(value),
    },
    timeoutMs: TIMEOUT_MS,
    async execute(args, exec) {
      const { cwd, sessionId } = contextOf(exec)
      const slug = slugOf(args.title)
      const outputDir = resolve(cwd, args.outputDir ?? join('presentations', `${slug}-${String(Date.now())}`))
      await mkdir(outputDir, { recursive: true })
      const htmlPath = join(outputDir, 'index.html')
      const deckPath = join(outputDir, 'deck.json')
      const spec: PptDeck = {
        title: args.title,
        slides: args.slides as unknown as PptSlide[],
        ...args.subtitle === undefined ? {} : { subtitle: args.subtitle },
        ...args.theme === undefined ? {} : { theme: args.theme },
      }
      const html = renderDeck(spec)
      await writeFile(htmlPath, html, 'utf8')
      await writeFile(deckPath, JSON.stringify(spec, null, 2), 'utf8')
      const warnings: string[] = []
      let exported: Awaited<ReturnType<typeof exportDeck>> | undefined
      if (args.export !== false) {
        try {
          exported = await exportDeck(htmlPath, join(outputDir, `${slug}.pptx`), DEFAULT_WIDTH, DEFAULT_HEIGHT, notesOf(spec), exec.signal)
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : String(error))
        }
      }
      const value: PptToolValue = {
        title: spec.title,
        htmlPath,
        ...sessionId === undefined ? {} : { htmlAddress: fileAddressFor(sessionId, cwd, htmlPath) },
        deckPath,
        slideCount: spec.slides.length,
        ...exported === undefined ? {} : {
          pptxPath: exported.pptxPath,
          pptxUrl: `/api/file?path=${encodeURIComponent(exported.pptxPath)}&download=1`,
          bytes: exported.bytes,
        },
        warnings,
      }
      return value
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ppt_export',
    description: 'Re-export an existing generated HTML deck to a high-fidelity image-based PPTX. Use after editing index.html or deck.json; otherwise ppt_create already exported it.',
    parameters: {
      htmlPath: { type: 'string', required: true, description: 'Absolute path to the generated index.html.' },
      outputPath: { type: 'string', description: 'Absolute PPTX output path. Defaults beside the HTML.' },
      width: { type: 'number', description: 'Frame width in pixels. Defaults to 1600.' },
      height: { type: 'number', description: 'Frame height in pixels. Defaults to 900.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
      presentationMeta: (_args, value) => metaOf(value),
    },
    timeoutMs: TIMEOUT_MS,
    async execute(args, exec) {
      const { cwd, sessionId } = contextOf(exec)
      const htmlPath = resolve(cwd, args.htmlPath)
      if (!existsSync(htmlPath)) throw new Error(`ppt_export: HTML deck not found: ${htmlPath}`)
      const deck = await readDeck(join(dirname(htmlPath), 'deck.json'))
      const title = deck?.title ?? basename(dirname(htmlPath))
      const exported = await exportDeck(
        htmlPath,
        args.outputPath === undefined ? undefined : resolve(cwd, args.outputPath),
        args.width ?? DEFAULT_WIDTH,
        args.height ?? DEFAULT_HEIGHT,
        notesOf(deck),
        exec.signal,
      )
      const info = await stat(exported.pptxPath)
      const value: PptToolValue = {
        title,
        htmlPath,
        ...sessionId === undefined ? {} : { htmlAddress: fileAddressFor(sessionId, cwd, htmlPath) },
        deckPath: join(dirname(htmlPath), 'deck.json'),
        pptxPath: exported.pptxPath,
        pptxUrl: `/api/file?path=${encodeURIComponent(exported.pptxPath)}&download=1`,
        slideCount: exported.slideCount,
        bytes: info.size,
        warnings: [],
      }
      return value
    },
  }))
}

/**
 * Mount the presentation tools.
 * @param ctx - context carrying the tool registry.
 */
export function apply(ctx: import('@deepseek-ai/cordis').Context): void {
  registerPptTools(ctx)
}
