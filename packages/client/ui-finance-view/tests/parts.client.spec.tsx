// @vitest-environment jsdom
/** Shared card pieces: shell, KPI capsules, warnings, field table, fallback. */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ChartPanelModel, FieldModel, TimeSeriesModel } from '../src/client/model.ts'
import {
  Card, chartCaption, chartRangeText, FieldTable, Kpi, KpiRow, percentileRows, PlainResult,
  SectionTitle, trendPanels, WarningList, fieldLabel,
  type FinanceViewProps,
} from '../src/client/parts.tsx'
import { zh } from '../src/client/locales.ts'
import { running, settled } from './fixtures.client.ts'

const t: FinanceViewProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

describe('card shell', () => {
  it('renders its title and body', () => {
    render(<Card title="沪深300分析"><KpiRow><Kpi label="总分" value="55" /></KpiRow></Card>)
    expect(screen.getByText('沪深300分析')).toBeTruthy()
    expect(screen.getByText('总分')).toBeTruthy()
    expect(screen.getByText('55')).toBeTruthy()
  })

  it('renders a section title', () => {
    render(<SectionTitle>分项明细</SectionTitle>)
    expect(screen.getByText('分项明细')).toBeTruthy()
  })
})

describe('field labels', () => {
  it('resolves a known fact key and keeps an unknown document key verbatim', () => {
    expect(fieldLabel({ label: 'usd_cny', labelKey: 'macro.field.usdCny', value: '6.7521' }, t)).toBe('美元/人民币')
    expect(fieldLabel({ label: 'mystery', labelKey: null, value: '1' }, t)).toBe('mystery')
  })
})

describe('WarningList', () => {
  it('renders nothing without warnings', () => {
    const view = render(<WarningList warnings={[]} t={t} />)
    expect(view.container.firstChild).toBeNull()
  })

  it('renders each warning under the localized heading', () => {
    render(<WarningList warnings={['gold_price: 31% 有效', 'house_price_index lag']} t={t} />)
    expect(screen.getByLabelText('数据警告')).toBeTruthy()
    expect(screen.getByText('gold_price: 31% 有效')).toBeTruthy()
    expect(screen.getByText('house_price_index lag')).toBeTruthy()
  })
})

describe('FieldTable', () => {
  const fields: readonly FieldModel[] = [
    { label: 'pe', labelKey: 'macro.pe', value: '12.68' },
    { label: '等级', labelKey: null, value: '中性偏低' },
  ]

  it('renders nothing without fields', () => {
    const view = render(<FieldTable fields={[]} t={t} />)
    expect(view.container.firstChild).toBeNull()
  })

  it('renders a localized or verbatim label per row', () => {
    render(<FieldTable fields={fields} t={t} />)
    expect(screen.getByText('PE')).toBeTruthy()
    expect(screen.getByText('12.68')).toBeTruthy()
    expect(screen.getByText('等级')).toBeTruthy()
    expect(screen.getByText('中性偏低')).toBeTruthy()
  })
})

describe('PlainResult', () => {
  it('announces a running call', () => {
    render(<PlainResult block={running()} title="沪深300分析" t={t} />)
    expect(screen.getByText('分析运行中')).toBeTruthy()
  })

  it('announces an empty settled result without rendering a code block', () => {
    const view = render(<PlainResult block={settled('x', { content: [] })} title="沪深300分析" t={t} />)
    expect(screen.getByText('无结果内容')).toBeTruthy()
    expect(view.container.querySelector('pre')).toBeNull()
  })

  it('renders the raw text of an unrecognized settled result', () => {
    const view = render(<PlainResult block={settled('not a document')} title="沪深300分析" t={t} />)
    expect(view.container.querySelector('pre')?.textContent).toBe('not a document')
  })
})

describe('chart captions and panels', () => {
  const series: TimeSeriesModel = {
    id: 'valuation',
    kind: 'line',
    dates: ['2021-11-30T00:00:00', '2026-09-21T00:00:00'],
    columns: { pe: [12.25, 12.77] },
  }

  it('labels a published axis with its first and last dates', () => {
    expect(chartRangeText(series.dates, t)).toBe('2021-11-30 – 2026-09-21')
    expect(chartCaption(series.dates, t)).toBe('2 个数据点，2021-11-30 至 2026-09-21')
  })

  it('survives a series whose axis carries no label', () => {
    expect(chartRangeText([], t)).toBe('')
    expect(chartCaption([], t)).toBe('')
  })

  it('adapts a numeric panel with its own unit and range', () => {
    const panels: readonly ChartPanelModel[] = [
      { key: 'pe', labelKey: 'macro.pe', unit: 'number', points: [12.25, null, 13.37] },
    ]
    expect(trendPanels(panels, t)).toEqual([
      { key: 'pe', label: 'PE', readout: '最新 13.37，区间 12.25–13.37', points: [12.25, null, 13.37] },
    ])
  })

  it('renders a premium that is already a percentage without rescaling it', () => {
    const panels: readonly ChartPanelModel[] = [
      { key: 'erp', labelKey: 'chart.erpLevel', unit: 'percent', points: [6.2044, 6.1479] },
    ]
    expect(trendPanels(panels, t)[0]?.readout).toBe('最新 6.15%，区间 6.15%–6.2%')
  })

  it('renders a 0-1 percentile as a percentage', () => {
    const panels: readonly ChartPanelModel[] = [
      { key: 'erp_percentile', labelKey: 'chart.erpPercentile', unit: 'fraction', points: [0.7541, 0.4839] },
    ]
    expect(trendPanels(panels, t)[0]?.readout).toBe('最新 48.4%，区间 48.4%–75.4%')
  })

  it('leaves a panel without a value without a readout', () => {
    const panels: readonly ChartPanelModel[] = [
      { key: 'pe', labelKey: 'macro.pe', unit: 'number', points: [null] },
    ]
    expect(trendPanels(panels, t)[0]?.readout).toBe('')
  })
})

describe('percentile rows', () => {
  it('adapts each percentile onto the 0-100 axis with its own value text', () => {
    const model = {
      reference: 0.5,
      bars: [
        { key: 'pe_percentile', labelKey: 'chart.pePercentile' as const, value: 0.758 },
        { key: 'pb_percentile', labelKey: 'chart.pbPercentile' as const, value: 0.6129 },
      ],
    }
    expect(percentileRows(model, t)).toEqual([
      { key: 'pe_percentile', label: 'PE分位', score: 75.8, valueText: '75.8%' },
      { key: 'pb_percentile', label: 'PB分位', score: 61.3, valueText: '61.3%' },
    ])
  })
})
