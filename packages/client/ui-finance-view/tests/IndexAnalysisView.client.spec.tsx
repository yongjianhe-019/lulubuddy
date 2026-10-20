// @vitest-environment jsdom
/**
 * The CSI 300 / CSI 2000 cards, driven by the exact tool-output text the host
 * renderer produced from live bridge runs. The CSI 300 fixture is a measured
 * `csi300_analysis` document (close 4507.393, total score 55, season 秋末).
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { Csi2000AnalysisView, Csi300AnalysisView } from '../src/client/IndexAnalysisView.tsx'
import { zh } from '../src/client/locales.ts'
import type { FinanceViewProps } from '../src/client/parts.tsx'
import { fixtureText, running, settled, settledCharts, type SettledBlock } from './fixtures.client.ts'

const t: FinanceViewProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

function props(block: SettledBlock | ReturnType<typeof running>): FinanceViewProps {
  return {
    callId: 'call-finance',
    toolName: 'csi300_analysis',
    block,
    openFile: vi.fn(),
    t,
  } as unknown as FinanceViewProps
}

describe('CSI 300 card over the measured document', () => {
  it('renders the real close, score, season, and PE percentile', () => {
    const view = render(<Csi300AnalysisView {...props(settled(fixtureText('csi300')))} />)
    expect(view.container.textContent).toContain('沪深300分析')
    expect(view.container.textContent).toContain('沪深300')
    expect(view.container.textContent).toContain('4507.393')
    expect(view.container.textContent).toContain('55')
    expect(view.container.textContent).toContain('秋末')
    expect(view.container.textContent).toContain('重点关注，准备资金')
    expect(view.container.textContent).toContain('52.7%')
    expect(view.container.textContent).toContain('2026-09-18')
    expect(view.container.textContent).toContain('是')
  })

  it('bars each scored dimension against its parsed maximum', () => {
    render(<Csi300AnalysisView {...props(settled(fixtureText('csi300')))} />)
    expect(screen.getAllByRole('progressbar')).toHaveLength(6)
    const valuation = screen.getByRole('progressbar', { name: '估值温度(30)' })
    expect(valuation.getAttribute('aria-valuenow')).toBe('10')
    expect(valuation.getAttribute('aria-valuemax')).toBe('30')
    expect(screen.getByText('10 / 30')).toBeTruthy()
    expect(screen.getByText('15 / 25')).toBeTruthy()
  })

  it('shows the threshold gauge and marks a detail-only dimension', () => {
    const view = render(<Csi300AnalysisView {...props(settled(fixtureText('csi300')))} />)
    expect(screen.getByRole('img', { name: /总分与冰点阈值/ })).toBeTruthy()
    expect(view.container.textContent).toContain('55 / 100')
    expect(view.container.textContent).toContain('冰点阈值 50')
    expect(screen.getByText('ERP极端信号(+15)')).toBeTruthy()
    expect(screen.getByText('无得分')).toBeTruthy()
    expect(view.container.querySelectorAll('details').length).toBeGreaterThan(0)
  })
})

describe('CSI 2000 card over the measured document', () => {
  it('renders the real close and score without a gauge or PE percentile', () => {
    const view = render(<Csi2000AnalysisView {...props(settled(fixtureText('csi2000')))} />)
    expect(view.container.textContent).toContain('中证2000分析')
    expect(view.container.textContent).toContain('中证2000')
    expect(view.container.textContent).toContain('3192.21')
    expect(view.container.textContent).toContain('48.5')
    expect(view.container.textContent).toContain('夏/秋')
    expect(view.container.textContent).not.toContain('冰点阈值')
  })

  it('bars the dimension whose score hides under the 总分 key', () => {
    render(<Csi2000AnalysisView {...props(settled(fixtureText('csi2000')))} />)
    expect(screen.getByText('16 / 35')).toBeTruthy()
    expect(screen.getByText('三通道买入信号')).toBeTruthy()
    expect(screen.getByText('通道')).toBeTruthy()
  })
})

describe('degenerate documents', () => {
  it('renders only the total score when every other KPI is absent', () => {
    const view = render(<Csi300AnalysisView {...props(settled('```json\n{"score":{"total_score":1}}\n```'))} />)
    expect(view.container.textContent).toContain('1')
    expect(view.container.querySelectorAll('[role="progressbar"]')).toHaveLength(0)
    expect(view.container.querySelector('details')).toBeNull()
    expect(view.container.textContent).toContain('沪深300分析')
  })

  it('renders a scored dimension with no remaining fields', () => {
    const view = render(<Csi300AnalysisView {...props(settled(
      '```json\n{"score":{"total_score":1,"details":{"X(10)":{"得分":1}}}}\n```',
    ))} />)
    expect(screen.getAllByText('分项明细')).toHaveLength(1)
    expect(view.container.querySelector('details')).toBeNull()
  })

  it('renders a false ice point as 否 and surfaces warnings', () => {
    const text = 'Data warnings:\n- stale macro\n\n```json\n{"score":{"total_score":1},"ice_point":false}\n```'
    const view = render(<Csi300AnalysisView {...props(settled(text))} />)
    expect(view.container.textContent).toContain('否')
    expect(screen.getByText('数据警告')).toBeTruthy()
    expect(screen.getByText('stale macro')).toBeTruthy()
  })
})

describe('fallbacks', () => {
  it('keeps the running card plain', () => {
    const view = render(<Csi2000AnalysisView {...props(running('csi2000_analysis'))} />)
    expect(view.container.textContent).toContain('中证2000分析')
    expect(view.container.textContent).toContain('分析运行中')
  })

  it('renders unrecognized, failed, and empty results as text', () => {
    const malformed = render(<Csi300AnalysisView {...props(settled('not a document'))} />)
    expect(malformed.container.querySelector('pre')?.textContent).toBe('not a document')
    cleanup()
    const unrelated = render(<Csi300AnalysisView {...props(settled('```json\n{"unrelated":1}\n```'))} />)
    expect(unrelated.container.querySelector('pre')?.textContent).toContain('unrelated')
    cleanup()
    const failed = render(<Csi300AnalysisView {...props(settled('```json\n{"ok":false,"error":"boom"}\n```'))} />)
    expect(failed.container.querySelector('pre')?.textContent).toContain('boom')
    cleanup()
    const empty = render(<Csi300AnalysisView {...props(settled('x', { content: [] }))} />)
    expect(empty.container.textContent).toContain('无结果内容')
  })
})

describe('CSI 300 charts over a measured chart payload', () => {
  it('draws the daily bars, the valuation trend, and the premium trend', () => {
    const view = render(<Csi300AnalysisView {...props(settledCharts('csi300'))} />)
    // Daily bars: one real window of 120 bars, so the price panel is present.
    expect(screen.getByRole('img', { name: /日线走势/ })).toBeTruthy()
    expect(view.container.textContent).toContain('日线走势')
    expect(view.container.textContent).toContain('估值趋势')
    expect(view.container.textContent).toContain('股债性价比趋势')
    // One candlestick panel plus two panels per trend section: the valuation
    // columns and the premium columns the same payload published.
    expect(view.container.querySelectorAll('figure')).toHaveLength(5)
    expect(screen.getAllByText('PE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PB').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ERP').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ERP分位').length).toBeGreaterThan(0)
    // The measured window ends on the run's own last trading day.
    expect(view.container.textContent).toContain('2026-04-01 – 2026-09-22')
    // The percentile bars: three readings plus the boundary they are graded at.
    expect(view.container.textContent).toContain('估值分位（近5年）')
    expect(screen.getAllByText('PE分位').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PB分位').length).toBeGreaterThan(0)
    expect(screen.getAllByText('均值分位').length).toBeGreaterThan(0)
    expect(view.container.textContent).toContain('中位 50；达到或高于该档')
    expect(view.container.querySelectorAll('[role="progressbar"] [style*="--finance-bar-reference"]')).toHaveLength(3)
  })

  it('draws percentile bars without a boundary note when the result names none', () => {
    const meta = {
      version: 1,
      series: [{ id: 'percentiles', kind: 'bar', categories: ['pe_percentile'], columns: { value: [0.75] } }],
    }
    const view = render(<Csi300AnalysisView {...props(settled(fixtureText('csi300'), { meta }))} />)
    expect(view.container.textContent).toContain('估值分位（近5年）')
    expect(screen.getAllByText('PE分位').length).toBeGreaterThan(0)
    expect(view.container.textContent).not.toContain('中位')
  })

  it('draws no chart when the result carries no presentation metadata', () => {
    const view = render(<Csi300AnalysisView {...props(settled(fixtureText('csi300')))} />)
    expect(view.container.querySelector('figure')).toBeNull()
    expect(view.container.textContent).not.toContain('日线走势')
    // The scored document still renders in full.
    expect(view.container.textContent).toContain('沪深300')
  })

  it('draws no chart while the call is still running', () => {
    const view = render(<Csi300AnalysisView {...props(running())} />)
    expect(view.container.querySelector('figure')).toBeNull()
    expect(view.container.textContent).toContain('分析运行中')
  })
})
