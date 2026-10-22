/** Read the presentation card payload from a settled tool result. */

import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

/** Frozen running-or-settled Tool call node supplied by ui-tool. */
export type ToolBlock = ToolCallViewProps['block']

/** Settled Tool result node. */
type SettledBlock = Extract<ToolBlock, { kind: 'tool-result' }>

/** One generated deck as the card draws it. */
export interface PptCardModel {
  readonly title: string
  readonly htmlPath: string
  readonly pptxPath: string | null
  readonly pptxUrl: string | null
  readonly slideCount: number
  readonly bytes: number
  readonly warnings: readonly string[]
}

/** Whether a Tool node carries its settled result. */
function isSettled(block: ToolBlock): block is SettledBlock {
  return 'kind' in block
}

/** Narrow to a non-array object. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Narrow to a non-empty string. */
function asText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Narrow to a finite non-negative number. */
function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** Read one payload; unknown or malformed metadata is not drawn. */
export function readPptPayload(meta: unknown): PptCardModel | null {
  const record = asRecord(meta)
  if (record === null || record['version'] !== 1) return null
  const title = asText(record['title'])
  const htmlPath = asText(record['htmlPath'])
  const slideCount = asCount(record['slideCount'])
  const bytes = asCount(record['bytes'])
  if (title === null || htmlPath === null || slideCount === null || bytes === null) return null
  const pptx = record['pptxPath']
  const pptxPath = pptx === null || pptx === undefined ? null : asText(pptx)
  if (pptx !== null && pptx !== undefined && pptxPath === null) return null
  const rawUrl = record['pptxUrl']
  const pptxUrl = rawUrl === null || rawUrl === undefined ? null : asText(rawUrl)
  if (rawUrl !== null && rawUrl !== undefined && pptxUrl === null) return null
  const rawWarnings = record['warnings']
  const warnings: string[] = []
  if (Array.isArray(rawWarnings)) {
    for (const warning of rawWarnings) {
      if (typeof warning === 'string' && warning !== '') warnings.push(warning)
    }
  }
  return { title, htmlPath, pptxPath, pptxUrl, slideCount, bytes, warnings }
}

/** One result node's complete card model. */
export function pptFromBlock(block: ToolBlock): PptCardModel | null {
  return isSettled(block) ? readPptPayload(block.meta) : null
}

/** The joined result text, for the raw fallback. */
export function resultText(block: ToolBlock): string | null {
  if (!isSettled(block)) return null
  const parts: string[] = []
  for (const item of block.content) {
    parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  }
  return parts.length === 0 ? null : parts.join('\n')
}

/** Format bytes in the unit a person reads. */
export function fileSize(bytes: number): { unit: 'megabytes' | 'kilobytes'; value: string } {
  return bytes >= 1_000_000
    ? { unit: 'megabytes', value: (bytes / 1_000_000).toFixed(1) }
    : { unit: 'kilobytes', value: (bytes / 1_000).toFixed(0) }
}

/** Build the authenticated file URL the browser downloads. */
export function downloadHref(path: string): string {
  return new URL(`api/file?path=${encodeURIComponent(path)}`, document.baseURI).href
}

/** The last path segment, used as the browser download filename. */
export function fileName(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}
