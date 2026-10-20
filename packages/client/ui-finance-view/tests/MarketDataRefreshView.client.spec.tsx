// @vitest-environment jsdom
/**
 * The refresh card, driven by the exact tool-output text the host renderer
 * produced from a live `refresh` run (csi300_daily 5996 rows, 8052 macro rows,
 * 37 cache files).
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MarketDataRefreshView } from '../src/client/MarketDataRefreshView.tsx'
import { zh } from '../src/client/locales.ts'
import type { FinanceViewProps } from '../src/client/parts.tsx'
import { fixtureText, running, settled, type RunningBlock, type SettledBlock } from './fixtures.client.ts'

const t: FinanceViewProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

function props(block: SettledBlock | RunningBlock): FinanceViewProps {
  return {
    callId: 'call-finance',
    toolName: 'market_data_refresh',
    block,
    openFile: vi.fn(),
    t,
  } as unknown as FinanceViewProps
}

const doc = (body: string): SettledBlock => settled(`\`\`\`json\n${body}\n\`\`\``)

describe('refresh card over the measured document', () => {
  it('renders the datasets, their coverage, and the cache summary', () => {
    const view = render(<MarketDataRefreshView {...props(settled(fixtureText('refresh')))} />)
    expect(view.container.textContent).toContain('市场数据刷新')
    expect(view.container.textContent).toContain('增量刷新')
    expect(view.container.textContent).toContain('csi300_daily')
    expect(view.container.textContent).toContain('5996 行')
    expect(view.container.textContent).toContain('2002-01-04 – 2026-09-18')
    expect(view.container.textContent).toContain('宏观数据')
    expect(view.container.textContent).toContain('8052 行')
    expect(view.container.textContent).toContain('缓存目录')
  })

  it('renders the cache timeline newest first', () => {
    render(<MarketDataRefreshView {...props(settled(fixtureText('refresh')))} />)
    expect(screen.getByText('更新时间')).toBeTruthy()
    expect(screen.getAllByText('2026-09-19 23:09').length).toBeGreaterThan(0)
    expect(screen.getByText('bond_yield_10y.parquet')).toBeTruthy()
  })
})

describe('degenerate documents', () => {
  it('marks a forced refresh and omits a missing cache', () => {
    const view = render(<MarketDataRefreshView {...props(doc('{"force":true,"datasets":{"a":{"rows":1}}}'))} />)
    expect(view.container.textContent).toContain('强制刷新')
    expect(view.container.textContent).toContain('1 行')
    expect(view.container.textContent).not.toContain('缓存目录')
    expect(view.container.textContent).not.toContain('更新时间')
    expect(view.container.textContent).not.toContain('宏观数据')
  })

  it('renders a dataset without rows or a range, and a file without a time', () => {
    render(<MarketDataRefreshView {...props(doc(
      '{"datasets":{"bare":{}},"macro":{"rows":2},"cache":{"files":[{"file":"x.parquet"}]}}',
    ))} />)
    expect(screen.getByText('bare')).toBeTruthy()
    expect(screen.getByText('宏观数据')).toBeTruthy()
    expect(screen.getByText('2 行')).toBeTruthy()
    expect(screen.getByText('x.parquet')).toBeTruthy()
  })

  it('surfaces warnings', () => {
    const text = 'Data warnings:\n- partial refresh\n\n```json\n{"datasets":{"a":{"rows":1}}}\n```'
    const view = render(<MarketDataRefreshView {...props(settled(text))} />)
    expect(screen.getByText('数据警告')).toBeTruthy()
    expect(view.container.textContent).toContain('partial refresh')
  })
})

describe('fallbacks', () => {
  it('keeps the running card plain', () => {
    const view = render(<MarketDataRefreshView {...props(running('market_data_refresh'))} />)
    expect(view.container.textContent).toContain('分析运行中')
  })

  it('renders an unrecognized result as text', () => {
    const view = render(<MarketDataRefreshView {...props(settled('boom'))} />)
    expect(view.container.querySelector('pre')?.textContent).toBe('boom')
    cleanup()
    const unrelated = render(<MarketDataRefreshView {...props(doc('{"unrelated":1}'))} />)
    expect(unrelated.container.querySelector('pre')?.textContent).toContain('unrelated')
  })
})
