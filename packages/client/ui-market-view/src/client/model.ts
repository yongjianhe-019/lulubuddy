import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

export type ToolBlock = ToolCallViewProps['block']
export interface MarketIndex {
  readonly name: string
  readonly close: number
  readonly changePct: number
  readonly ret20: number
  readonly retYtd: number
  readonly ma20: number
  readonly ma60: number
  readonly aboveMa20: boolean
  readonly aboveMa60: boolean
  readonly volumeRatio: number
}

export interface MarketCardModel {
  readonly asOf: string
  readonly summary: string
  readonly indices: readonly MarketIndex[]
  readonly warnings: readonly string[]
  readonly source: string
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function text(value: unknown): string | null { return typeof value === 'string' && value !== '' ? value : null }
function num(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }

export function readMarketPayload(meta: unknown): MarketCardModel | null {
  const root = record(meta)
  if (root === null || root['version'] !== 1) return null
  const asOf = text(root['asOf']) ?? ''
  const summary = text(root['summary']) ?? ''
  const source = text(root['source']) ?? '新浪财经'
  const indices: MarketIndex[] = []
  if (Array.isArray(root['indices'])) {
    for (const item of root['indices']) {
      const row = record(item)
      if (row === null) continue
      const name = text(row['name'])
      if (name === null) continue
      indices.push({
        name, close: num(row['close']), changePct: num(row['changePct']),
        ret20: num(row['ret20']), retYtd: num(row['retYtd']),
        ma20: num(row['ma20']), ma60: num(row['ma60']),
        aboveMa20: row['aboveMa20'] === true, aboveMa60: row['aboveMa60'] === true,
        volumeRatio: num(row['volumeRatio']),
      })
    }
  }
  if (indices.length === 0) return null
  const warnings: string[] = []
  if (Array.isArray(root['warnings'])) for (const item of root['warnings']) if (typeof item === 'string') warnings.push(item)
  return { asOf, summary, indices, warnings, source }
}

export function modelFromBlock(block: ToolBlock): MarketCardModel | null {
  return 'kind' in block ? readMarketPayload(block.meta) : null
}

export function resultText(block: ToolBlock): string | null {
  if (!('kind' in block)) return null
  const parts: string[] = []
  for (const item of block.content) parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  return parts.length === 0 ? null : parts.join('\n')
}

export function pct(value: number): string { return `${(value * 100).toFixed(1)}%` }
