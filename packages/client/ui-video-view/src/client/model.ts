/**
 * Reading a video tool result: the model-facing document, the production notes,
 * and the render payload a card draws.
 *
 * The payload arrives as the result node's presentation metadata, which is JSON
 * a client cannot trust: every member is re-narrowed here, and a payload that
 * does not narrow is dropped rather than half-drawn.
 *
 * @module @deepseek-ai/dsh-client-ui-video-view/model
 */

import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

/** Frozen running-or-settled Tool call node supplied by ui-tool. */
export type ToolBlock = ToolCallViewProps['block']

/** Settled Tool result node. */
export type SettledBlock = Extract<ToolBlock, { kind: 'tool-result' }>

/** One scene of a render, as the card shows it. */
export interface SceneModel {
  /** One-based position, as the storyboard numbers it. */
  readonly index: number
  /** Heading the scene draws, or null when it has none. */
  readonly heading: string | null
  /** The spoken text. */
  readonly narration: string
  readonly startMs: number
  readonly endMs: number
  /** Whether the narration audio came from the cache. */
  readonly cached: boolean
}

/** One finished render, as the card shows it. */
export interface RenderModel {
  /** Browser path to play, or null when the deployment mounted no route. */
  readonly url: string | null
  /** Absolute path of the file on the machine that rendered it. */
  readonly output: string
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly fps: number
  readonly durationMs: number
  readonly title: string
  readonly voice: string
  readonly scenes: readonly SceneModel[]
}

/** One prepared render environment, as the card shows it. */
export interface SetupModel {
  readonly projectRoot: string
  readonly remotionVersion: string | null
  readonly edgeTtsVersion: string | null
  readonly laidTemplate: boolean
  readonly installedPackages: boolean
  readonly browserReady: boolean
}

/** Payload revision this client narrows against. */
const PAYLOAD_VERSION = 1

/** Most scenes a narrowed payload may carry. */
const MAX_PAYLOAD_SCENES = 64

/** Fenced JSON body, with or without an info string. */
const JSON_FENCE = /```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/

/**
 * Whether a Tool node carries its settled result.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns whether the node is the settled `tool-result` form.
 */
export function isSettled(block: ToolBlock): block is SettledBlock {
  return 'kind' in block
}

/**
 * Narrow a value to a non-array JSON object.
 * @param value - any decoded JSON value.
 * @returns the object, or null for every other value.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Narrow a value to a finite non-negative number.
 * @param value - any decoded JSON value.
 * @returns the number, or null for every other value.
 */
function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Narrow a value to a non-empty string.
 * @param value - any decoded JSON value.
 * @returns the string, or null for every other value.
 */
function asText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Read the text a settled Tool result exposes.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns the joined text, or null while the call has no result text.
 */
export function resultText(block: ToolBlock): string | null {
  if (!isSettled(block)) return null
  const parts: string[] = []
  for (const item of block.content) {
    parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  }
  return parts.length > 0 ? parts.join('\n') : null
}

/**
 * Decode the document from a tool result's text: the fenced JSON body, or the
 * whole text when it is a bare object.
 * @param text - the tool result's text.
 * @returns the document object, or null when the text is not one.
 */
export function extractDocument(text: string): Record<string, unknown> | null {
  const body = JSON_FENCE.exec(text)?.[1] ?? text
  const trimmed = body.trim()
  if (!trimmed.startsWith('{')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Truncated or streaming text is ordinary input at this boundary; the
    // caller renders the raw text instead.
    return null
  }
  return asRecord(parsed)
}

/**
 * Production notes from the `Production warnings:` preamble and from an
 * embedded top-level `warnings` array, deduplicated in first-seen order.
 * @param text - the tool result's text.
 * @param document - the decoded document.
 * @returns the notes to surface.
 */
export function extractWarnings(text: string, document: Record<string, unknown>): readonly string[] {
  const fenceAt = text.indexOf('```')
  const preamble = fenceAt === -1 ? text : text.slice(0, fenceAt)
  const notes: string[] = []
  for (const line of preamble.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ')) notes.push(trimmed.slice(2))
  }
  if (Array.isArray(document['warnings'])) {
    for (const entry of document['warnings']) if (typeof entry === 'string') notes.push(entry)
  }
  return [...new Set(notes)]
}

/**
 * The production notes one settled result carried.
 *
 * A card shows them above its numbers, so this resolves the two ways a result
 * can carry none — no text at all, or text that is not a document — to one
 * empty answer.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns the notes to surface, deduplicated in first-seen order.
 */
export function productionNotes(block: ToolBlock): readonly string[] {
  const text = resultText(block)
  if (text === null) return []
  const document = extractDocument(text)
  if (document === null) return []
  return extractWarnings(text, document)
}

/**
 * Narrow one scene entry.
 * @param value - the entry.
 * @param index - the position it must claim.
 * @returns the scene, or null when any member fails to narrow.
 */
function readScene(value: unknown, index: number): SceneModel | null {
  const record = asRecord(value)
  if (record === null || record['index'] !== index) return null
  const narration = asText(record['narration'])
  const startMs = asCount(record['startMs'])
  const endMs = asCount(record['endMs'])
  if (narration === null || startMs === null || endMs === null || endMs < startMs) return null
  const heading = record['heading']
  if (heading !== undefined && typeof heading !== 'string') return null
  return {
    index: index + 1,
    heading: heading ?? null,
    narration,
    startMs,
    endMs,
    cached: record['cached'] === true,
  }
}

/**
 * Narrow one render payload.
 * @param meta - the result node's presentation metadata, as unknown JSON.
 * @returns the render, or null when the metadata is not one this build draws.
 */
export function readRenderPayload(meta: unknown): RenderModel | null {
  const record = asRecord(meta)
  if (record === null || record['version'] !== PAYLOAD_VERSION) return null
  const output = asText(record['output'])
  const title = asText(record['title'])
  const voice = asText(record['voice'])
  const bytes = asCount(record['bytes'])
  const width = asCount(record['width'])
  const height = asCount(record['height'])
  const fps = asCount(record['fps'])
  const durationMs = asCount(record['durationMs'])
  if (output === null || title === null || voice === null) return null
  if (bytes === null || width === null || height === null || fps === null || durationMs === null) return null
  if (width === 0 || height === 0 || fps === 0) return null
  const url = record['url']
  if (url !== null && asText(url) === null) return null
  const raw = record['scenes']
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PAYLOAD_SCENES) return null
  const scenes: SceneModel[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const scene = readScene(raw[index], index)
    if (scene === null) return null
    scenes.push(scene)
  }
  return { url: url === null ? null : asText(url), output, bytes, width, height, fps, durationMs, title, voice, scenes }
}

/**
 * One render node's complete card model: the payload, or the running state that
 * explains why there is none yet.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns the render payload when the call settled with one, else null.
 */
export function renderFromBlock(block: ToolBlock): RenderModel | null {
  return isSettled(block) ? readRenderPayload(block.meta) : null
}

/**
 * Read the setup document one `video_setup` result carries.
 * @param document - the decoded document.
 * @returns the environment report, or null when the document is not one.
 */
export function readSetupDocument(document: Record<string, unknown>): SetupModel | null {
  const projectRoot = asText(document['project_root'])
  if (projectRoot === null) return null
  return {
    projectRoot,
    remotionVersion: asText(document['remotion_version']),
    edgeTtsVersion: asText(document['edge_tts_version']),
    laidTemplate: document['laid_template'] === true,
    installedPackages: document['installed_packages'] === true,
    browserReady: document['browser_ready'] === true,
  }
}

/**
 * Format one duration in milliseconds as a whole number of seconds.
 * @param ms - the duration.
 * @returns the duration's seconds, to one decimal place.
 */
export function seconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1)
}

/**
 * Format one byte count in the unit a person reads it in.
 * @param bytes - the size.
 * @returns the size with its unit.
 */
export function fileSize(bytes: number): { unit: 'megabytes' | 'kilobytes'; value: string } {
  return bytes >= 1_000_000
    ? { unit: 'megabytes', value: (bytes / 1_000_000).toFixed(1) }
    : { unit: 'kilobytes', value: (bytes / 1_000).toFixed(0) }
}
