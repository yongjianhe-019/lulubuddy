// @vitest-environment jsdom
/** Hand-written chart shapes: the score bar, the threshold gauge, the daily
 * candlestick panel, and the stacked trend panels. */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CandlestickChart, ScoreBar, ThresholdGauge, TrendChart } from '../src/client/charts.tsx'

afterEach(cleanup)

function barFill(view: ReturnType<typeof render>): string {
  return (view.container.querySelector('[role="progressbar"] > span') as HTMLElement).style
    .getPropertyValue('--finance-bar-fill')
}

describe('ScoreBar', () => {
  it('exposes the score and its parsed maximum to assistive technology', () => {
    render(<ScoreBar label="估值温度(30)" score={10} max={30} valueText="10 / 30" />)
    const bar = screen.getByRole('progressbar', { name: '估值温度(30)' })
    expect(bar.getAttribute('aria-valuenow')).toBe('10')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('30')
    expect(screen.getByText('10 / 30')).toBeTruthy()
  })

  it('fills proportionally when the score is inside the maximum', () => {
    const view = render(<ScoreBar label="X" score={10} max={30} valueText="10 / 30" />)
    expect(barFill(view)).toMatch(/^33\.33/)
  })

  it('fills completely above the maximum and not at all at or below zero', () => {
    const over = render(<ScoreBar label="over" score={40} max={30} valueText="40 / 30" />)
    expect(barFill(over)).toBe('100%')
    cleanup()
    const under = render(<ScoreBar label="under" score={-5} max={30} valueText="-5 / 30" />)
    expect(barFill(under)).toBe('0%')
  })

  it('marks a reference boundary on the same scale as the fill', () => {
    const view = render(<ScoreBar label="PE分位" score={75.8} max={100} valueText="75.8%" reference={50} />)
    const marker = view.container.querySelectorAll('[role="progressbar"] > span')[1] as HTMLElement
    expect(marker).toBeTruthy()
    expect(marker.style.getPropertyValue('--finance-bar-reference')).toBe('50%')
  })

  it('marks no boundary when the dimension carries none', () => {
    const view = render(<ScoreBar label="PE分位" score={75.8} max={100} valueText="75.8%" />)
    expect(view.container.querySelectorAll('[role="progressbar"] > span')).toHaveLength(1)
  })

  it('renders an empty bar when the dimension has no positive maximum', () => {
    const view = render(<ScoreBar label="zero" score={1} max={0} valueText="1 / 0" />)
    expect(barFill(view)).toBe('0%')
  })
})

describe('ThresholdGauge', () => {
  const props = {
    label: '总分与冰点阈值',
    value: 55,
    threshold: 50,
    max: 100,
    valueText: '55 / 100',
    thresholdText: '冰点阈值 50',
  }

  it('draws the track, the value arc, and the threshold tick', () => {
    const view = render(<ThresholdGauge {...props} />)
    expect(screen.getByRole('img', { name: /总分与冰点阈值/ })).toBeTruthy()
    expect(view.container.querySelectorAll('path')).toHaveLength(2)
    expect(view.container.querySelector('line')).toBeTruthy()
    expect(screen.getByText('55 / 100')).toBeTruthy()
    expect(screen.getByText('冰点阈值 50')).toBeTruthy()
  })

  it('omits the value arc at a zero value', () => {
    const view = render(<ThresholdGauge {...props} value={0} valueText="0 / 100" />)
    expect(view.container.querySelectorAll('path')).toHaveLength(1)
  })

  it('clamps a value above the scale and a zero scale to an empty arc', () => {
    const clamped = render(<ThresholdGauge {...props} value={140} max={100} valueText="140 / 100" />)
    expect(clamped.container.querySelectorAll('path')).toHaveLength(2)
    cleanup()
    const zeroScale = render(<ThresholdGauge {...props} max={0} valueText="55 / 0" />)
    expect(zeroScale.container.querySelectorAll('path')).toHaveLength(1)
  })
})

/** Props of one candlestick panel over two bars, the second of which falls. */
function candles(over: Partial<Parameters<typeof CandlestickChart>[0]> = {}) {
  return {
    title: '日线走势',
    rangeText: '2026-09-18 – 2026-09-21',
    caption: '2 个数据点，2026-09-18 至 2026-09-21',
    dates: ['2026-09-18', '2026-09-21'],
    open: [10, 12],
    high: [12, 12],
    low: [9, 8],
    close: [11, 9],
    volume: [100, 50],
    ...over,
  }
}

describe('CandlestickChart', () => {
  it('draws one wick, body, and volume bar per complete day', () => {
    const view = render(<CandlestickChart {...candles()} />)
    expect(screen.getByRole('img', { name: /日线走势/ })).toBeTruthy()
    expect(screen.getByText('日线走势')).toBeTruthy()
    expect(screen.getByText('2026-09-18 – 2026-09-21')).toBeTruthy()
    expect(view.container.querySelectorAll('line')).toHaveLength(2)
    expect(view.container.querySelectorAll('rect')).toHaveLength(4)
  })

  it('marks a falling day differently from a rising one', () => {
    const view = render(<CandlestickChart {...candles()} />)
    const [rising, falling] = [...view.container.querySelectorAll('g')].map(node => node.getAttribute('class'))
    expect(rising).toBeTruthy()
    expect(falling).toBeTruthy()
    expect(rising).not.toBe(falling)
  })

  it('skips a day the source left without a full bar and omits a zero-volume bar', () => {
    const view = render(<CandlestickChart {...candles({ close: [11, null], volume: [0, 50] })} />)
    expect(view.container.querySelectorAll('line')).toHaveLength(1)
    // The surviving day keeps its body only: its traded volume is zero.
    expect(view.container.querySelectorAll('rect')).toHaveLength(1)
  })

  it('draws nothing when no day carries a full bar', () => {
    const view = render(<CandlestickChart {...candles({ dates: [], open: [], high: [], low: [], close: [], volume: [] })} />)
    expect(view.container.firstChild).toBeNull()
  })

  it('draws a flat window on the panel centre line instead of at a zero span', () => {
    const view = render(<CandlestickChart {...candles({ open: [10, 10], high: [10, 10], low: [10, 10], close: [10, 10] })} />)
    const wick = view.container.querySelector('line')
    expect(wick?.getAttribute('y1')).toBe(wick?.getAttribute('y2'))
  })

  it('skips a day whose bar arrays are shorter than the date axis', () => {
    const view = render(<CandlestickChart {...candles({ open: [10], high: [12], low: [9], close: [11] })} />)
    expect(view.container.querySelectorAll('line')).toHaveLength(1)
  })

  it('draws a window whose bars carry no volume at all', () => {
    const view = render(<CandlestickChart {...candles({ volume: [null, null] })} />)
    expect(view.container.querySelectorAll('rect')).toHaveLength(2)
  })
})

describe('TrendChart', () => {
  const panels = [
    { key: 'pe', label: 'PE', readout: '最新 12.77，区间 12.25–13.37', points: [12.25, null, 12.77] },
    { key: 'pb', label: 'PB', readout: '最新 1.42，区间 1.40–1.42', points: [1.55, 1.48, 1.42] },
  ]

  it('draws one labelled panel per column and breaks the line at a gap', () => {
    const view = render(<TrendChart panels={panels} caption="3 个数据点" />)
    expect(screen.getByRole('img', { name: '3 个数据点' })).toBeTruthy()
    expect(screen.getByText('PE')).toBeTruthy()
    expect(screen.getByText('最新 12.77，区间 12.25–13.37')).toBeTruthy()
    expect(screen.getByText('PB')).toBeTruthy()
    // PE splits into two runs around its gap; PB stays one run.
    expect(view.container.querySelectorAll('polyline')).toHaveLength(3)
  })

  it('draws a single-point panel at the centre of its own axis', () => {
    const view = render(<TrendChart panels={[{ key: 'pe', label: 'PE', readout: 'x', points: [12] }]} caption="1 个数据点" />)
    expect(view.container.querySelector('polyline')?.getAttribute('points')).toMatch(/^360,/)
  })

  it('ends a panel on its last value without drawing a trailing point', () => {
    const view = render(<TrendChart panels={[{ key: 'pe', label: 'PE', readout: 'x', points: [12.25, null] }]} caption="1" />)
    expect(view.container.querySelectorAll('polyline')).toHaveLength(1)
  })

  it('starts a run after a leading gap instead of drawing a point at the origin', () => {
    const view = render(<TrendChart panels={[{ key: 'pe', label: 'PE', readout: 'x', points: [null, 12] }]} caption="1" />)
    const line = view.container.querySelector('polyline')
    expect(line).toBeTruthy()
    expect(line?.getAttribute('points')?.split(' ')).toHaveLength(1)
  })

  it('draws nothing when no panel carries a point', () => {
    const view = render(<TrendChart panels={[{ key: 'pe', label: 'PE', readout: '', points: [null, null] }]} caption="0" />)
    expect(view.container.firstChild).toBeNull()
  })
})
