// @vitest-environment jsdom
/**
 * The market-timing card, driven by the exact tool-output text the host
 * renderer produced from a live `market_signal` run (CSI 300 BUY, CSI 2000
 * RESTORE, with the composed position advice).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MarketTimingView } from '../src/client/MarketTimingView.tsx'
import { zh } from '../src/client/locales.ts'
import type { FinanceViewProps } from '../src/client/parts.tsx'
import { fixtureText, running, settled, settledCharts, type RunningBlock, type SettledBlock } from './fixtures.client.ts'

const t: FinanceViewProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

function props(block: SettledBlock | RunningBlock): FinanceViewProps {
  return {
    callId: 'call-finance',
    toolName: 'market_timing_signal',
    block,
    openFile: vi.fn(),
    t,
  } as unknown as FinanceViewProps
}

const doc = (body: string): SettledBlock => settled(`\`\`\`json\n${body}\n\`\`\``)

describe('timing card over the measured signal', () => {
  it('renders both actions, scores, and the position advice', () => {
    const view = render(<MarketTimingView {...props(settled(fixtureText('marketSignal')))} />)
    expect(view.container.textContent).toContain('市场择时信号')
    expect(view.container.textContent).toContain('沪深300')
    expect(view.container.textContent).toContain('中证2000')
    expect(view.container.textContent).toContain('55')
    expect(view.container.textContent).toContain('48.5')
    expect(view.container.textContent).toContain('BUY')
    expect(view.container.textContent).toContain('RESTORE')
    expect(view.container.textContent).toContain('回站MA60(回补档2)')
    expect(view.container.textContent).toContain('仓位建议')
    expect(view.container.textContent).toContain('累计回补67%')
    expect(view.container.textContent).toContain('2026-09-18')
    expect(view.container.textContent).toContain('0.0%')
    expect(view.container.textContent).toContain('66.7%')
  })

  it('tones each action by its meaning and shows the ice-point flag', () => {
    render(<MarketTimingView {...props(settled(fixtureText('marketSignal')))} />)
    expect(screen.getByText('BUY').getAttribute('data-tone')).toBe('success')
    expect(screen.getByText('RESTORE').getAttribute('data-tone')).toBe('info')
    expect(screen.getAllByText('是')[0]?.getAttribute('data-tone')).toBe('warning')
    expect(screen.getAllByText('否')[0]?.getAttribute('data-tone')).toBe('quiet')
  })

  it('tones a sell and an unrecognized action differently', () => {
    render(<MarketTimingView {...props(doc(
      '{"signal":{"score_300":1,"action_300":"SELL","score_2000":2,"action_2000":"HOLD"}}',
    ))} />)
    expect(screen.getByText('SELL').getAttribute('data-tone')).toBe('danger')
    expect(screen.getByText('HOLD').getAttribute('data-tone')).toBe('neutral')
  })
})

describe('degenerate documents', () => {
  it('renders a leg with every optional field absent', () => {
    const view = render(<MarketTimingView {...props(doc('{"signal":{"score_300":1}}'))} />)
    expect(view.container.textContent).toContain('沪深300')
    expect(view.container.textContent).toContain('中证2000')
    expect(view.container.textContent).not.toContain('档位')
    expect(screen.queryByText('BUY')).toBeNull()
  })

  it('surfaces warnings and omits an absent advice line', () => {
    const text = 'Data warnings:\n- signal lag\n\n```json\n{"signal":{"score_300":1}}\n```'
    render(<MarketTimingView {...props(settled(text))} />)
    expect(screen.getByText('数据警告')).toBeTruthy()
    expect(screen.getByText('signal lag')).toBeTruthy()
    expect(screen.queryByText('仓位建议')).toBeNull()
  })
})

describe('fallbacks', () => {
  it('keeps the running card plain', () => {
    const view = render(<MarketTimingView {...props(running('market_timing_signal'))} />)
    expect(view.container.textContent).toContain('分析运行中')
  })

  it('renders an unrecognized result as text', () => {
    const view = render(<MarketTimingView {...props(settled('boom'))} />)
    expect(view.container.querySelector('pre')?.textContent).toBe('boom')
    cleanup()
    const unrelated = render(<MarketTimingView {...props(doc('{"unrelated":1}'))} />)
    expect(unrelated.container.querySelector('pre')?.textContent).toContain('unrelated')
  })
})

describe('market-timing charts over a measured chart payload', () => {
  it('draws each leg\'s own bars plus both closes on one shared axis', () => {
    const view = render(<MarketTimingView {...props(settledCharts('marketSignal'))} />)
    expect(screen.getAllByText('日线走势').length).toBeGreaterThan(0)
    expect(screen.getAllByText('指数收盘对比').length).toBeGreaterThan(0)
    // Two candlestick panels and two comparison panels.
    expect(view.container.querySelectorAll('figure')).toHaveLength(4)
    expect(screen.getAllByText('沪深300').length).toBeGreaterThan(0)
    expect(screen.getAllByText('中证2000').length).toBeGreaterThan(0)
    // Both panels read out the run's own last close for their index.
    expect(view.container.textContent).toContain('最新 4544.588，区间 4440.616–5059.658')
    expect(view.container.textContent).toContain('最新 3258.67，区间 2722.13–3753.25')
  })

  it('draws only the leg whose bars the result carried', () => {
    const payload = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/charts/marketSignal.meta.json'), 'utf8')) as {
      series: unknown[]
    }
    const leg = JSON.parse(JSON.stringify(payload.series[0])) as unknown
    const meta = { version: 1, series: [leg] }
    const view = render(<MarketTimingView {...props(settled(fixtureText('marketSignal'), { meta }))} />)
    expect(view.container.querySelectorAll('figure')).toHaveLength(1)
    expect(view.container.textContent).toContain('日线走势')
    expect(view.container.textContent).not.toContain('指数收盘对比')
  })

  it('draws no panel when the result carries no metadata', () => {
    const view = render(<MarketTimingView {...props(settled(fixtureText('marketSignal')))} />)
    expect(view.container.textContent).not.toContain('指数收盘对比')
    expect(view.container.textContent).not.toContain('日线走势')
    expect(view.container.querySelectorAll('figure')).toHaveLength(0)
    expect(view.container.textContent).toContain('市场择时信号')
  })
})
