import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

export type ToolBlock = ToolCallViewProps['block']

export interface ImageCardModel {
  readonly style: 'revival' | 'pixel' | 'zine'
  readonly sourcePath: string
  readonly outputPath: string
  readonly caption: string
  readonly accent: string
  readonly warnings: readonly string[]
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function text(value: unknown): string | null { return typeof value === 'string' && value !== '' ? value : null }

export function readImagePayload(meta: unknown): ImageCardModel | null {
  const root = record(meta)
  if (root === null || root['version'] !== 1) return null
  const style = root['style']
  if (style !== 'revival' && style !== 'pixel' && style !== 'zine') return null
  const sourcePath = text(root['sourcePath'])
  const outputPath = text(root['outputPath'])
  if (sourcePath === null || outputPath === null) return null
  const warnings: string[] = []
  if (Array.isArray(root['warnings'])) for (const item of root['warnings']) if (typeof item === 'string') warnings.push(item)
  return { style, sourcePath, outputPath, caption: text(root['caption']) ?? '', accent: text(root['accent']) ?? '', warnings }
}

export function modelFromBlock(block: ToolBlock): ImageCardModel | null {
  return 'kind' in block ? readImagePayload(block.meta) : null
}

export function resultText(block: ToolBlock): string | null {
  if (!('kind' in block)) return null
  const parts: string[] = []
  for (const item of block.content) parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  return parts.length === 0 ? null : parts.join('\n')
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
