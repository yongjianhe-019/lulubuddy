/**
 * Reading the Xiaohongshu post card's payload: the copy, the video, the two
 * publication gates, and the files one publication wrote.
 *
 * The payload arrives as the tool result's presentation metadata, which is JSON
 * a client cannot trust: every member is re-narrowed here, and a payload that
 * does not narrow is dropped rather than half-drawn.
 *
 * @module @deepseek-ai/dsh-client-ui-xhs-view/model
 */

import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

/** Frozen running-or-settled Tool call node supplied by ui-tool. */
export type ToolBlock = ToolCallViewProps['block']

/** Settled Tool result node. */
export type SettledBlock = Extract<ToolBlock, { kind: 'tool-result' }>

/** One packaged post, as the card shows it. */
export interface PostModel {
  readonly number: number
  readonly topic: string
  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly pinnedComment: string
  readonly video: {
    readonly url: string | null
    readonly path: string
    readonly durationMs: number
    readonly width: number
    readonly height: number
    readonly fps: number
    readonly bytes: number
  }
  readonly checks: {
    readonly detect: { readonly passed: boolean; readonly verdict: string; readonly hits: number }
    readonly scan: { readonly passed: boolean; readonly hard: number; readonly soft: number }
  }
  readonly files: { readonly draft: string; readonly publish: string; readonly video: string }
  readonly warnings: readonly string[]
  readonly createdAt: string
}

/** Payload revision this client narrows against. */
const PAYLOAD_VERSION = 1

/**
 * Whether a Tool node carries its settled result.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns whether the node is the settled `tool-result` form.
 */
export function isSettled(block: ToolBlock): block is SettledBlock {
  return 'kind' in block
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
 * Narrow a value to a non-array JSON object.
 * @param value - any decoded JSON value.
 * @returns the object, or null for every other value.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
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
 * Narrow a value to a finite non-negative number.
 * @param value - any decoded JSON value.
 * @returns the number, or null for every other value.
 */
function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Narrow a value to a string array.
 * @param value - any decoded JSON value.
 * @returns the strings, or null when the value is not an array of strings.
 */
function asStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) return null
    out.push(item)
  }
  return out
}

/**
 * Narrow one publication payload.
 * @param meta - the result node's presentation metadata, as unknown JSON.
 * @returns the post, or null when the metadata is not one this build draws.
 */
export function readPostPayload(meta: unknown): PostModel | null {
  const record = asRecord(meta)
  if (record === null || record['version'] !== PAYLOAD_VERSION) return null
  const number = asCount(record['number'])
  const topic = asText(record['topic'])
  const title = asText(record['title'])
  const body = asText(record['body'])
  const pinnedComment = asText(record['pinnedComment'])
  const tags = asStrings(record['tags'])
  const createdAt = asText(record['createdAt'])
  if (number === null || !Number.isInteger(number) || number < 1) return null
  if (topic === null || title === null || body === null || pinnedComment === null) return null
  if (tags === null || tags.length === 0 || createdAt === null) return null

  const videoRecord = asRecord(record['video'])
  if (videoRecord === null) return null
  const url = videoRecord['url']
  if (url !== null && asText(url) === null) return null
  const path = asText(videoRecord['path'])
  const durationMs = asCount(videoRecord['durationMs'])
  const width = asCount(videoRecord['width'])
  const height = asCount(videoRecord['height'])
  const fps = asCount(videoRecord['fps'])
  const bytes = asCount(videoRecord['bytes'])
  if (path === null || durationMs === null || width === null || height === null || fps === null || bytes === null) return null
  if (durationMs === 0 || width === 0 || height === 0 || fps === 0) return null

  const checksRecord = asRecord(record['checks'])
  const detectRecord = asRecord(checksRecord?.['detect'])
  const scanRecord = asRecord(checksRecord?.['scan'])
  if (detectRecord === null || scanRecord === null) return null
  const verdict = asText(detectRecord['verdict'])
  const hits = asCount(detectRecord['hits'])
  const hard = asCount(scanRecord['hard'])
  const soft = asCount(scanRecord['soft'])
  if (verdict === null || hits === null || hard === null || soft === null) return null

  const filesRecord = asRecord(record['files'])
  if (filesRecord === null) return null
  const draft = asText(filesRecord['draft'])
  const publish = asText(filesRecord['publish'])
  const videoFile = asText(filesRecord['video'])
  if (draft === null || publish === null || videoFile === null) return null

  const warnings = asStrings(record['warnings'])
  if (warnings === null) return null

  return {
    number,
    topic,
    title,
    body,
    tags,
    pinnedComment,
    video: {
      url: url === null ? null : asText(url),
      path,
      durationMs,
      width,
      height,
      fps,
      bytes,
    },
    checks: {
      detect: { passed: detectRecord['passed'] === true, verdict, hits },
      scan: { passed: scanRecord['passed'] === true, hard, soft },
    },
    files: { draft, publish, video: videoFile },
    warnings,
    createdAt,
  }
}

/**
 * One result node's complete card model.
 * @param block - the frozen running-or-settled Tool call node.
 * @returns the post when the call settled with one, else null.
 */
export function postFromBlock(block: ToolBlock): PostModel | null {
  return isSettled(block) ? readPostPayload(block.meta) : null
}

/**
 * Format a duration in milliseconds as seconds with one decimal.
 * @param ms - the duration.
 * @returns the seconds.
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

/**
 * The copy package a user pastes into Xiaohongshu.
 * @param post - the packaged post.
 * @param includePinned - whether to append the pinned comment under a label.
 * @returns the text.
 */
export function publishCopy(post: PostModel, includePinned = false): string {
  const lines = [post.title, '', post.body, '', post.tags.join(' ')]
  if (includePinned) lines.push('', `置顶评论：${post.pinnedComment}`)
  return lines.join('\n')
}
