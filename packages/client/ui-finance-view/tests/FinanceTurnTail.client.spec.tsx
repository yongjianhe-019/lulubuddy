// @vitest-environment jsdom
/**
 * The turn footer: the newest analysis this turn published, drawn under the
 * answer. The footer is outside the process disclosure's fold, so these specs
 * assert the two things the fold would otherwise hide — that the charts are
 * present, and that only the turn that produced them draws them.
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { FinanceTurnTail, type FinanceTurnTailProps } from '../src/client/FinanceTurnTail.tsx'
import { zh } from '../src/client/locales.ts'
import { chartFixtureMeta } from './fixtures.client.ts'

const t: FinanceTurnTailProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

/** Props for one closing turn over one projection value. */
function props(value: unknown, turn = 4): FinanceTurnTailProps {
  return {
    matched: { turn: { turn }, seq: 12, openFile: () => {} },
    useProjection: () => value,
    t,
  } as unknown as FinanceTurnTailProps
}

/** One projection value as the host publishes it. */
function projected(stem: string, turn = 4): unknown {
  return { charts: chartFixtureMeta(stem), turn, seq: 12 }
}

describe('finance turn footer', () => {
  it('draws the valuation bars and both legs of a timing result', () => {
    const view = render(<FinanceTurnTail {...props(projected('marketSignal'))} />)
    expect(view.container.textContent).toContain('本次分析图表')
    // Two candlestick panels, one per leg, side by side.
    expect(view.container.querySelectorAll('figure')).toHaveLength(2)
    expect(screen.getAllByText('沪深300').length).toBeGreaterThan(0)
    expect(screen.getAllByText('中证2000').length).toBeGreaterThan(0)
  })

  it('draws the bars and the single index window of an index result', () => {
    const view = render(<FinanceTurnTail {...props(projected('csi300'))} />)
    expect(view.container.querySelectorAll('figure')).toHaveLength(1)
    // The footer's own head labels the block; the bars label themselves.
    expect(screen.getAllByText('PE分位').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PB分位').length).toBeGreaterThan(0)
    expect(screen.getAllByText('均值分位').length).toBeGreaterThan(0)
    expect(view.container.querySelectorAll('[role="progressbar"]')).toHaveLength(3)
    expect(view.container.textContent).toContain('日线走势')
  })

  it('draws nothing for a turn the newest payload did not come from', () => {
    const view = render(<FinanceTurnTail {...props(projected('csi300', 4), 5)} />)
    expect(view.container.firstChild).toBeNull()
  })

  it('draws nothing without a published payload', () => {
    expect(render(<FinanceTurnTail {...props(null)} />).container.firstChild).toBeNull()
    cleanup()
    expect(render(<FinanceTurnTail {...props({ charts: null, turn: 4, seq: 12 })} />).container.firstChild).toBeNull()
    cleanup()
    expect(render(<FinanceTurnTail {...props({ charts: { version: 9 }, turn: 4, seq: 12 })} />).container.firstChild).toBeNull()
  })

  it('draws the bars alone when the result published no bars of its own', () => {
    const value = {
      charts: {
        version: 1,
        series: [{ id: 'percentiles', kind: 'bar', categories: ['pe_percentile'], columns: { value: [0.75] } }],
      },
      turn: 4,
      seq: 12,
    }
    const view = render(<FinanceTurnTail {...props(value)} />)
    expect(view.container.querySelectorAll('figure')).toHaveLength(0)
    expect(view.container.querySelectorAll('[role="progressbar"]')).toHaveLength(1)
  })

  it('draws nothing for a payload that carries neither bars nor a window', () => {
    const value = {
      charts: { version: 1, series: [{ id: 'valuation', kind: 'line', dates: ['2026-09-22'], columns: { pe: [12.8] } }] },
      turn: 4,
      seq: 12,
    }
    expect(render(<FinanceTurnTail {...props(value)} />).container.firstChild).toBeNull()
  })

  it('falls back to the generic bar title for a series id it does not know', () => {
    const series = (chartFixtureMeta('csi300') as { series: unknown[] }).series[0]
    const value = { charts: { version: 1, series: [{ ...(series as object), id: 'price_unknown' }] }, turn: 4, seq: 12 }
    const view = render(<FinanceTurnTail {...props(value)} />)
    expect(view.container.querySelectorAll('figure')).toHaveLength(1)
    expect(view.container.textContent).toContain('日线走势')
  })
})
