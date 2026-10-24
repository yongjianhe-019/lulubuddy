/**
 * Model-facing motion videos over `ctx.motion`: scaffold the frame-pure HTML,
 * preview a still, render the full MP4 with synthesized sound, and run QC.
 *
 * @module @deepseek-ai/dsh-motion-local/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { MotionRuntime } from './service.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'motion-tools'

/** The capability and the tool registry this entry registers into. */
export const inject = ['tools', 'motion']

/** Default cooperative budget: a first 16 s render can take a few minutes. */
export const DEFAULT_MOTION_TOOL_TIMEOUT_MS = 900_000

/** Plugin config: per-call wall-clock budget. */
export interface Config {
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_MOTION_TOOL_TIMEOUT_MS),
})

/** One canonical value: the document, warnings, and the card payload. */
function toolValue(document: Readonly<Record<string, unknown>>, warnings: readonly string[]): Record<string, JsonValue> {
  return { ...document, warnings: [...warnings] } as Record<string, JsonValue>
}

/** Render a concise model-facing summary instead of returning a bitmap of JSON. */
function renderResult(value: Record<string, JsonValue>, title: string): string {
  const warnings = Array.isArray(value['warnings']) ? value['warnings'] : []
  const lines = [title]
  for (const key of ['projectDir', 'htmlPath', 'videoPath', 'posterPath', 'sheetPath', 'wavPath', 'out', 'video']) {
    if (typeof value[key] === 'string' && value[key] !== '') lines.push(`${key}: ${value[key]}`)
  }
  if (typeof value['width'] === 'number' && typeof value['height'] === 'number') {
    lines.push(`frame: ${String(value['width'])}x${String(value['height'])}`)
  }
  if (typeof value['duration'] === 'number') lines.push(`duration: ${String(value['duration'])} s`)
  if (typeof value['bytes'] === 'number') lines.push(`bytes: ${String(value['bytes'])}`)
  const qc = value['qc']
  if (typeof qc === 'object' && qc !== null && !Array.isArray(qc)) {
    const record = qc as Record<string, JsonValue>
    const pairs = ['codec', 'width', 'height', 'fps', 'duration', 'audioCodec', 'meanDb', 'maxDb']
      .filter(key => record[key] !== undefined && record[key] !== null)
      .map(key => `${key}=${String(record[key])}`)
    if (pairs.length > 0) lines.push(`qc: ${pairs.join(' ')}`)
  }
  if (warnings.length > 0) lines.push('warnings:', ...warnings.map(warning => `- ${String(warning)}`))
  return lines.join('\n')
}

/** The render card payload. */
function renderMeta(value: JsonValue): JsonValue {
  const document = value as Record<string, JsonValue>
  return {
    version: 1,
    title: document['title'] ?? document['slug'] ?? 'motion',
    videoPath: document['videoPath'] ?? '',
    posterPath: document['posterPath'] ?? null,
    sheetPath: document['sheetPath'] ?? null,
    projectDir: document['projectDir'] ?? '',
    htmlPath: document['htmlPath'] ?? '',
    width: document['width'] ?? 0,
    height: document['height'] ?? 0,
    durationMs: document['durationMs'] ?? 0,
    platform: document['platform'] ?? null,
    safeArea: document['safeArea'] ?? null,
    bytes: document['bytes'] ?? 0,
    qc: document['qc'] ?? null,
    warnings: document['warnings'] ?? [],
  }
}

/** The shared open-object output spec. */
const DOCUMENT_SCHEMA = { type: 'object', additionalProperties: true } as const

/**
 * Register the motion tools.
 * @param ctx - context whose tool registry receives the registrations.
 * @param motion - the capability every invocation goes through.
 * @param timeoutMs - per-call wall-clock budget.
 */
export function registerMotionTools(ctx: Context, motion: MotionRuntime, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'motion_scaffold',
    description: [
      'Create a new frame-pure HTML motion-video project from the motion-studio starter:',
      'index.html, bgm.json, and notes.md.',
      'Set the title, brief, frame size, fps, duration, and BPM, then edit the HTML',
      'so every visible value derives from window.__seek(t).',
    ].join(' '),
    parameters: {
      title: { type: 'string', required: true, description: 'Video title, also used for the folder and file name.' },
      brief: { type: 'string', description: 'Short creative brief and storyboard intent.' },
      slug: { type: 'string', description: 'Optional file/folder slug. Defaults to the title.' },
      width: { type: 'number', description: 'Frame width. Defaults to 1080 (vertical).' },
      height: { type: 'number', description: 'Frame height. Defaults to 1920 (vertical).' },
      fps: { type: 'number', description: 'Frame rate. Defaults to 30.' },
      duration: { type: 'number', description: 'Duration in seconds. Defaults to 8.' },
      bpm: { type: 'number', description: 'Beats per minute. Defaults to 120.' },
      platform: {
        type: 'string', enum: ['mobile', 'desktop', 'square', 'portrait', 'custom'],
        description: 'Delivery profile. mobile 1080x1920, desktop 1920x1080, square 1080x1080, portrait 1080x1350. Defaults to mobile, except orbital defaults to desktop.',
      },
      template: { type: 'string', enum: ['starter', 'orbital'], description: 'Composition template. starter is the generic motion page; orbital is the legacy wireframe-globe scene. Defaults to starter.' },
      templatePath: { type: 'string', description: 'Optional HTML template path relative to motionRoot. Overrides template.' },
      outputDir: { type: 'string', description: 'Project directory relative to motionRoot. Defaults to motion/<slug>.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderResult(value, 'Motion project ready') }],
    },
    timeoutMs,
    async execute(args, exec) {
      const outcome = await motion.invoke({ operation: 'scaffold', arguments: {
        title: args.title,
        ...args.brief === undefined ? {} : { brief: args.brief },
        ...args.slug === undefined ? {} : { slug: args.slug },
        ...args.width === undefined ? {} : { width: args.width },
        ...args.height === undefined ? {} : { height: args.height },
        ...args.fps === undefined ? {} : { fps: args.fps },
        ...args.duration === undefined ? {} : { duration: args.duration },
        ...args.bpm === undefined ? {} : { bpm: args.bpm },
        ...args.platform === undefined ? {} : { platform: args.platform },
        ...args.template === undefined ? {} : { template: args.template },
        ...args.templatePath === undefined ? {} : { templatePath: args.templatePath },
        ...args.outputDir === undefined ? {} : { outputDir: args.outputDir },
      } }, exec.signal)
      return toolValue(outcome.document, outcome.warnings)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'motion_still',
    description: [
      'Render one still from a frame-pure motion HTML project at a given time.',
      'Use it to check the cover, contrast, typography, and safe areas before a full render.',
    ].join(' '),
    parameters: {
      htmlPath: { type: 'string', required: true, description: 'Project index.html, relative to motionRoot or absolute inside it.' },
      time: { type: 'number', required: true, description: 'Frame time in seconds.' },
      width: { type: 'number', description: 'Optional viewport width override.' },
      height: { type: 'number', description: 'Optional viewport height override.' },
      guides: { type: 'boolean', description: 'Draw the platform safe-area guide over the still. Defaults to false.' },
      outputPath: { type: 'string', description: 'Optional output PNG path relative to motionRoot.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderResult(value, 'Motion still rendered') }],
    },
    timeoutMs,
    async execute(args, exec) {
      const outcome = await motion.invoke({ operation: 'still', arguments: {
        htmlPath: args.htmlPath,
        time: args.time,
        ...args.width === undefined ? {} : { width: args.width },
        ...args.height === undefined ? {} : { height: args.height },
        ...args.guides === undefined ? {} : { guides: args.guides },
        ...args.outputPath === undefined ? {} : { outputPath: args.outputPath },
      } }, exec.signal)
      return toolValue(outcome.document, outcome.warnings)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'motion_render',
    description: [
      'Render a motion project end to end: synthesize the beat-synced WAV, capture every frame with Playwright,',
      'encode with ffmpeg, mux the audio, and run QC with a contact sheet.',
      'Returns the MP4, poster, sheet, source project, and measured facts.',
      'The HTML must expose window.__seek(t).',
    ].join(' '),
    parameters: {
      htmlPath: { type: 'string', required: true, description: 'Project index.html, relative to motionRoot or absolute inside it.' },
      width: { type: 'number', description: 'Frame width override.' },
      height: { type: 'number', description: 'Frame height override.' },
      fps: { type: 'number', description: 'Frame rate override.' },
      duration: { type: 'number', description: 'Duration override in seconds.' },
      poster: { type: 'number', description: 'Poster time in seconds. Defaults to duration minus 1.2.' },
      crf: { type: 'number', description: 'H.264 CRF. Defaults to 20.' },
      sheet: { type: 'number', description: 'Contact-sheet frames. Defaults to 8.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderResult(value, 'Motion video rendered') }],
      presentationMeta: (_args, value) => renderMeta(value),
    },
    timeoutMs,
    async execute(args, exec) {
      const outcome = await motion.invoke({ operation: 'render', arguments: {
        htmlPath: args.htmlPath,
        ...args.width === undefined ? {} : { width: args.width },
        ...args.height === undefined ? {} : { height: args.height },
        ...args.fps === undefined ? {} : { fps: args.fps },
        ...args.duration === undefined ? {} : { duration: args.duration },
        ...args.poster === undefined ? {} : { poster: args.poster },
        ...args.crf === undefined ? {} : { crf: args.crf },
        ...args.sheet === undefined ? {} : { sheet: args.sheet },
      } }, exec.signal)
      return toolValue(outcome.document, outcome.warnings)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'motion_qc',
    description: 'Run fact-only QC on a finished motion MP4: codec, geometry, duration, loudness, and an optional contact sheet.',
    parameters: {
      videoPath: { type: 'string', required: true, description: 'MP4 path, relative to motionRoot or absolute inside it.' },
      sheet: { type: 'number', description: 'Optional contact-sheet frame count.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderResult(value, 'Motion QC') }],
    },
    timeoutMs,
    async execute(args, exec) {
      const outcome = await motion.invoke({ operation: 'qc', arguments: {
        videoPath: args.videoPath,
        ...args.sheet === undefined ? {} : { sheet: args.sheet },
      } }, exec.signal)
      return toolValue(outcome.document, outcome.warnings)
    },
  }))
}

/**
 * Mount the motion tools.
 * @param ctx - context carrying `ctx.motion`.
 * @param config - per-call budget.
 */
export function apply(ctx: Context, config: Config): void {
  registerMotionTools(ctx, ctx.motion, (config as Required<Config>).timeoutMs)
}
