/** Read the motion render card payload from a settled tool result. */
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

export type ToolBlock = ToolCallViewProps['block']
type SettledBlock = Extract<ToolBlock, { kind: 'tool-result' }>

export interface MotionCardModel {
  readonly title: string
  readonly videoPath: string
  readonly posterPath: string | null
  readonly sheetPath: string | null
  readonly projectDir: string
  readonly htmlPath: string
  readonly width: number
  readonly height: number
  readonly durationMs: number
  readonly bytes: number
  readonly platform: string | null
  readonly safeArea: string | null
  readonly qc: Record<string, unknown> | null
  readonly warnings: readonly string[]
}

function isSettled(block: ToolBlock): block is SettledBlock { return 'kind' in block }
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function asText(value: unknown): string | null { return typeof value === 'string' && value !== '' ? value : null }
function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function readMotionPayload(meta: unknown): MotionCardModel | null {
  const record = asRecord(meta)
  if (record === null || record['version'] !== 1) return null
  const title = asText(record['title']) ?? 'motion'
  const videoPath = asText(record['videoPath'])
  const projectDir = asText(record['projectDir'])
  const htmlPath = asText(record['htmlPath'])
  const width = asCount(record['width'])
  const height = asCount(record['height'])
  const durationMs = asCount(record['durationMs'])
  const bytes = asCount(record['bytes'])
  if (videoPath === null || projectDir === null || htmlPath === null
    || width === null || height === null || durationMs === null || bytes === null) return null
  const poster = record['posterPath']
  const sheet = record['sheetPath']
  const posterPath = poster === null || poster === undefined ? null : asText(poster)
  const sheetPath = sheet === null || sheet === undefined ? null : asText(sheet)
  const warnings: string[] = []
  if (Array.isArray(record['warnings'])) {
    for (const item of record['warnings']) if (typeof item === 'string' && item !== '') warnings.push(item)
  }
  const safe = asRecord(record['safeArea'])
  const safeArea = safe === null
    ? null
    : `safe ${String(safe['left'])}/${String(safe['top'])} – ${String(safe['right'])}/${String(safe['bottom'])}`
  return {
    title, videoPath, posterPath, sheetPath, projectDir, htmlPath, width, height, durationMs, bytes,
    platform: asText(record['platform']), safeArea, qc: asRecord(record['qc']), warnings,
  }
}

export function motionFromBlock(block: ToolBlock): MotionCardModel | null {
  return isSettled(block) ? readMotionPayload(block.meta) : null
}

export function resultText(block: ToolBlock): string | null {
  if (!isSettled(block)) return null
  const parts: string[] = []
  for (const item of block.content) parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  return parts.length === 0 ? null : parts.join('\n')
}

export function fileSize(bytes: number): { unit: 'megabytes' | 'kilobytes'; value: string } {
  return bytes >= 1_000_000
    ? { unit: 'megabytes', value: (bytes / 1_000_000).toFixed(1) }
    : { unit: 'kilobytes', value: (bytes / 1_000).toFixed(0) }
}

export function mediaHref(path: string): string {
  return new URL(`api/file?path=${encodeURIComponent(path)}`, document.baseURI).href
}

export function downloadHref(path: string): string {
  return new URL(`api/file?path=${encodeURIComponent(path)}&download=1`, document.baseURI).href
}

export function fileName(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}
