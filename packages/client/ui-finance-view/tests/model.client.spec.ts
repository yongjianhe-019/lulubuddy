/** Defensive decoding and view-model derivation for the finance cards. */

import { describe, expect, it } from 'vitest'
import {
  asArray, asBoolean, asNumber, asRecord, asString, asStringArray,
  deriveIndexAnalysis, deriveMacroSnapshot, deriveMarketDataRefresh, deriveMarketTiming,
  dimensionFields, dimensionScore, extractDocument, extractWarnings,
  formatDate, formatNumber, formatPercent, formatTimestamp, formatValue, indexLabelKey,
  isSettled, macroLabel, macroRowLabel, parseDimensionMax, parseFinanceResult, resultText,
  candlestickModel, chartRange, chartSeries, comparisonPanels, erpPanels, readChartPayload,
  readChartProjection, resultCharts, timeSeries, valuationPanels, valuationPercentiles,
  type ChartSeriesModel,
} from '../src/client/model.ts'
import { bridgeDocument, fixtureText, running, settled, settledCharts } from './fixtures.client.ts'

describe('narrowing helpers', () => {
  it('accepts only non-array objects', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord([])).toBeNull()
    expect(asRecord(null)).toBeNull()
    expect(asRecord('x')).toBeNull()
  })

  it('accepts only finite numbers', () => {
    expect(asNumber(1.5)).toBe(1.5)
    expect(asNumber(Number.NaN)).toBeNull()
    expect(asNumber('1')).toBeNull()
  })

  it('accepts only non-empty strings', () => {
    expect(asString('a')).toBe('a')
    expect(asString('')).toBeNull()
    expect(asString(1)).toBeNull()
  })

  it('accepts only booleans', () => {
    expect(asBoolean(true)).toBe(true)
    expect(asBoolean(false)).toBe(false)
    expect(asBoolean('true')).toBeNull()
  })

  it('accepts only arrays', () => {
    expect(asArray([1])).toEqual([1])
    expect(asArray({ length: 1 })).toBeNull()
  })

  it('keeps only the string members of an array', () => {
    expect(asStringArray(['a', 1, '', 'b'])).toEqual(['a', 'b'])
    expect(asStringArray('a')).toEqual([])
  })

  it('narrows a settled block', () => {
    expect(isSettled(settled('x'))).toBe(true)
    expect(isSettled(running())).toBe(false)
  })
})

describe('formatters', () => {
  it('renders integers verbatim and rounds fractions to six places', () => {
    expect(formatNumber(55)).toBe('55')
    expect(formatNumber(48.5)).toBe('48.5')
    expect(formatNumber(-3.4000000000000004)).toBe('-3.4')
  })

  it('renders each JSON value kind as generic text', () => {
    expect(formatValue(6.7521)).toBe('6.7521')
    expect(formatValue('秋末')).toBe('秋末')
    expect(formatValue(true)).toBe('true')
    expect(formatValue(null)).toBe('—')
    expect(formatValue(undefined)).toBe('—')
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
  })

  it('renders a fraction as a one-decimal percentage number', () => {
    expect(formatPercent(0.5271317829457365)).toBe('52.7')
    expect(formatPercent(0)).toBe('0.0')
  })

  it('names each timing index', () => {
    expect(indexLabelKey('csi300')).toBe('index.csi300')
    expect(indexLabelKey('csi2000')).toBe('index.csi2000')
  })

  it('takes the date and the date-and-minute prefix of an ISO timestamp', () => {
    expect(formatDate('2026-09-18T00:00:00')).toBe('2026-09-18')
    expect(formatTimestamp('2026-09-19T23:09:43')).toBe('2026-09-19 23:09')
  })
})

describe('dimension decoding', () => {
  it('parses the trailing parenthesized maximum, signed bonuses included', () => {
    expect(parseDimensionMax('估值温度(30)')).toBe(30)
    expect(parseDimensionMax('ERP极端信号(+15)')).toBe(15)
    expect(parseDimensionMax('趋势动量')).toBeNull()
  })

  it('prefers 得分 and falls back to the 总分 key one dimension publishes', () => {
    expect(dimensionScore({ 得分: 10 })).toBe(10)
    expect(dimensionScore({ 总分: 16 })).toBe(16)
    expect(dimensionScore({ 状态: '未触发' })).toBeNull()
  })

  it('lists every field except the one that carried the score', () => {
    expect(dimensionFields({ 等级: '中性偏低', 得分: 10 }).map(field => field.label)).toEqual(['等级'])
    expect(dimensionFields({ 总分: 16, M2: '7.5%' }).map(field => field.label)).toEqual(['M2'])
    expect(dimensionFields({ 状态: '未触发' })).toEqual([
      { label: '状态', labelKey: null, value: '未触发' },
    ])
  })
})

describe('result text', () => {
  it('is null while the call is running', () => {
    expect(resultText(running())).toBeNull()
  })

  it('joins text blocks and serializes a non-text block', () => {
    expect(resultText(settled('hello'))).toBe('hello')
    expect(resultText(settled('x', { content: [] }))).toBeNull()
    const structured = settled('x', { content: [{ type: 'reasoning', text: 'note' }] as never })
    expect(resultText(structured)).toContain('"type": "reasoning"')
  })
})

describe('document extraction', () => {
  it('reads the fenced body, a bare object, and rejects everything else', () => {
    expect(extractDocument('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractDocument('{"a":1}')).toEqual({ a: 1 })
    expect(extractDocument('```json\n[1]\n```')).toBeNull()
    expect(extractDocument('not json')).toBeNull()
    expect(extractDocument('{"a":')).toBeNull()
  })

  it('surfaces preamble bullets and embedded warnings, deduplicated', () => {
    const text = 'Data warnings:\n- alpha\n* beta\nplain line\n\n```json\n{"warnings":["alpha","gamma",7]}\n```'
    expect(extractWarnings(text, { warnings: ['alpha', 'gamma', 7] })).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('reads warnings from unfenced text and tolerates a missing embedded array', () => {
    expect(extractWarnings('- only\n', {})).toEqual(['only'])
  })
})

describe('parseFinanceResult', () => {
  it('returns the document, its warnings, and the text', () => {
    const text = 'Data warnings:\n- stale\n\n```json\n{"close":1,"warnings":["stale","other"]}\n```'
    const parsed = parseFinanceResult(settled(text))
    expect(parsed?.document).toEqual({ close: 1, warnings: ['stale', 'other'] })
    expect(parsed?.warnings).toEqual(['stale', 'other'])
    expect(parsed?.text).toBe(text)
  })

  it('rejects a running call, an empty result, and a bridge failure object', () => {
    expect(parseFinanceResult(running())).toBeNull()
    expect(parseFinanceResult(settled('x', { content: [] }))).toBeNull()
    expect(parseFinanceResult(settled('```json\n{"ok":false,"error":"boom"}\n```'))).toBeNull()
  })
})

describe('macro labels', () => {
  it('maps known fact and row keys and leaves unknown keys to the document', () => {
    expect(macroLabel('usd_cny')).toBe('macro.field.usdCny')
    expect(macroLabel('unknown_fact')).toBeNull()
    expect(macroRowLabel('pe')).toBe('macro.pe')
    expect(macroRowLabel('yield_10y')).toBe('macro.yield')
    expect(macroRowLabel('other')).toBeNull()
  })
})

describe('deriveIndexAnalysis over the measured CSI 300 document', () => {
  const model = deriveIndexAnalysis(bridgeDocument('csi300'))

  it('carries the KPI facts the bridge returned', () => {
    expect(model).toMatchObject({
      index: '沪深300',
      asOf: '2026-09-18T00:00:00',
      close: 4507.393,
      totalScore: 55,
      season: '秋末',
      action: '重点关注，准备资金',
      icePoint: true,
      threshold: 50,
      buyChannel: null,
    })
    expect(model?.pePercentile).toBeCloseTo(0.5271317829457365)
  })

  it('parses each dimension maximum and score from its own key', () => {
    expect(model?.dimensions).toHaveLength(7)
    const valuation = model?.dimensions.find(dimension => dimension.name === '估值温度(30)')
    expect(valuation).toMatchObject({ max: 30, score: 10 })
    expect(valuation?.fields.map(field => field.label)).toEqual(['PE分位', 'PB分位', '均值分位', '等级'])
    const bonus = model?.dimensions.find(dimension => dimension.name === 'ERP极端信号(+15)')
    expect(bonus?.max).toBe(15)
    expect(bonus?.score).toBeNull()
  })

  it('falls back when the score object or its total is absent', () => {
    expect(deriveIndexAnalysis({})).toBeNull()
    expect(deriveIndexAnalysis({ score: {} })).toBeNull()
  })

  it('tolerates absent details, a non-record dimension, and a malformed buy channel', () => {
    expect(deriveIndexAnalysis({ score: { total_score: 1 } })?.dimensions).toEqual([])
    const model = deriveIndexAnalysis({
      score: { total_score: 1, details: { 'X(10)': { 得分: 1 }, bad: 'text' } },
      buy_channel: { detail: {} },
    })
    expect(model?.dimensions).toHaveLength(1)
    expect(model?.buyChannel).toBeNull()
  })

  it('decodes the CSI 2000 buy channel and its 总分-shaped dimension', () => {
    const model = deriveIndexAnalysis(bridgeDocument('csi2000'))
    expect(model).toMatchObject({ totalScore: 48.5, season: '夏/秋', pePercentile: null, icePoint: null, threshold: null })
    const liquidity = model?.dimensions.find(dimension => dimension.name === '宏观流动性(35)')
    expect(liquidity).toMatchObject({ max: 35, score: 16 })
    expect(model?.buyChannel?.map(field => field.label)).toContain('通道')
  })
})

describe('deriveMarketTiming over the measured signal document', () => {
  const model = deriveMarketTiming(bridgeDocument('marketSignal'))

  it('carries both legs and the position advice', () => {
    expect(model?.date).toBe('2026-09-18T00:00:00')
    expect(model?.legs[0]).toMatchObject({ key: 'csi300', score: 55, icePoint: true, action: 'BUY', level: 'PE合理' })
    expect(model?.legs[0]?.reasons).toEqual([])
    expect(model?.legs[1]).toMatchObject({ key: 'csi2000', score: 48.5, icePoint: false, action: 'RESTORE' })
    expect(model?.legs[1]?.reasons).toEqual(['回站MA60(回补档2)'])
    expect(model?.legs[1]?.recoveryPercent).toBeCloseTo(0.6666666666666666)
    expect(model?.advice).toContain('回补')
  })

  it('falls back without a signal, and tolerates a missing leg record', () => {
    expect(deriveMarketTiming({})).toBeNull()
    expect(deriveMarketTiming({ signal: {} })).toBeNull()
    const model = deriveMarketTiming({ signal: { score_300: 55 } })
    expect(model?.legs[1]).toEqual({
      key: 'csi2000',
      score: null,
      icePoint: null,
      action: null,
      level: null,
      reasons: [],
      recoveryPercent: null,
      sellPercent: null,
    })
  })
})

describe('deriveMacroSnapshot over the measured macro document', () => {
  const model = deriveMacroSnapshot(bridgeDocument('macroSnapshot'))

  it('labels known facts and keeps each dated row', () => {
    expect(model?.asOf).toBe('2026-09-18T00:00:00')
    expect(model?.historyRows).toBe(6)
    expect(model?.latest.find(fact => fact.label === 'usd_cny')).toMatchObject({
      labelKey: 'macro.field.usdCny',
      value: '6.7521',
    })
    expect(model?.valuation[0]?.fields.map(field => field.labelKey)).toEqual(['macro.pe', 'macro.pb'])
    expect(model?.bondYield[0]?.fields.map(field => field.labelKey)).toEqual(['macro.yield'])
  })

  it('falls back without a latest row and without any fact', () => {
    expect(deriveMacroSnapshot({})).toBeNull()
    expect(deriveMacroSnapshot({ latest: {} })).toBeNull()
  })

  it('tolerates absent history, non-record rows, and a row without a date', () => {
    const model = deriveMacroSnapshot({ latest: { unknown_fact: 1 }, valuation: [{ pe: 1 }, 'bad'], recent: [] })
    expect(model?.historyRows).toBe(0)
    expect(model?.latest[0]).toMatchObject({ label: 'unknown_fact', labelKey: null })
    expect(model?.valuation).toEqual([{ date: null, fields: [{ label: 'pe', labelKey: 'macro.pe', value: '1' }] }])
  })
})

describe('deriveMarketDataRefresh over the measured refresh document', () => {
  const model = deriveMarketDataRefresh(bridgeDocument('refresh'))

  it('carries every dataset and the cache files newest first', () => {
    expect(model?.force).toBe(false)
    expect(model?.datasets).toHaveLength(7)
    expect(model?.datasets.find(dataset => dataset.name === 'csi300_daily')).toMatchObject({
      rows: 5996,
      firstDate: '2002-01-04T00:00:00',
      lastDate: '2026-09-18T00:00:00',
    })
    expect(model?.macro).toMatchObject({ rows: 8052 })
    expect(model?.cacheDirectory).toContain('StockMarket/data')
    expect(model?.cacheFiles).toHaveLength(37)
    expect(model?.cacheFiles[0]).toEqual({ file: 'bond_yield_10y.parquet', modified: '2026-09-19T23:09:43' })
  })

  it('falls back without a dataset map', () => {
    expect(deriveMarketDataRefresh({})).toBeNull()
  })

  it('tolerates non-record datasets, a missing cache, and unnamed files', () => {
    const model = deriveMarketDataRefresh({
      datasets: { good: { rows: 1 }, bad: 'text' },
      cache: { files: [{ file: 'b.parquet', modified: '2026-01-02T00:00:00' }, { file: 'a.parquet' }, { file: 'c.parquet' }, { nope: 1 }, 5] },
    })
    expect(model?.datasets).toEqual([
      { name: 'good', rows: 1, firstDate: null, lastDate: null },
    ])
    expect(model?.macro).toBeNull()
    expect(model?.cacheDirectory).toBeNull()
    expect(model?.cacheFiles).toEqual([
      { file: 'b.parquet', modified: '2026-01-02T00:00:00' },
      { file: 'a.parquet', modified: null },
      { file: 'c.parquet', modified: null },
    ])
  })
})

describe('measured fixtures', () => {
  it('are the exact host-rendered output for the measured bridge documents', () => {
    // Provenance guard: the specs below drive these real values, so the
    // rendered text must keep them.
    const csi300 = fixtureText('csi300')
    expect(csi300).toContain('4507.393')
    expect(csi300).toContain('"total_score": 55')
    expect(csi300).toContain('秋末')
    expect(bridgeDocument('csi300')).toMatchObject({ close: 4507.393, index: '沪深300' })
  })
})

describe('chart payload narrowing', () => {
  const line: ChartSeriesModel = { id: 'pe', kind: 'line', dates: ['2026-09-18'], columns: { pe: [12.25] } }

  it('reads a published payload and finds its series by id', () => {
    const payload = readChartPayload({ version: 1, series: [line] })
    expect(chartSeries(payload, 'pe')).toEqual(line)
    expect(chartSeries(payload, 'price')).toBeNull()
  })

  it('yields no series for a payload of another revision or without a series list', () => {
    expect(readChartPayload({ version: 2, series: [line] }).series).toEqual([])
    expect(readChartPayload({ version: 1, series: 'pe' }).series).toEqual([])
    expect(readChartPayload(undefined).series).toEqual([])
    expect(readChartPayload('{}').series).toEqual([])
  })

  it('drops a series whose identity, kind, axis, or columns are not what a card can draw', () => {
    const payload = {
      version: 1,
      series: [
        7,
        { ...line, id: '' },
        { ...line, kind: 'bars' },
        { ...line, dates: [] },
        { ...line, dates: [7] },
        { ...line, columns: undefined },
        { ...line, columns: { pe: [1, 2] } },
        { ...line, columns: { pe: ['x'] } },
      ],
    }
    expect(readChartPayload(payload).series).toEqual([])
  })

  it('drops only the columns that do not align with the axis', () => {
    const payload = readChartPayload({ version: 1, series: [{ ...line, columns: { pe: [1, 2], pb: [1] } }] })
    expect(payload.series[0]?.columns).toEqual({ pb: [1] })
  })

  it('drops a candlestick series that is missing a bar column', () => {
    const full = { ...line, kind: 'candlestick', columns: { open: [1], high: [2], low: [0], close: [1] } }
    expect(readChartPayload({ version: 1, series: [full] }).series).toHaveLength(1)
    const short = { ...full, columns: { open: [1], high: [2], low: [0] } }
    expect(readChartPayload({ version: 1, series: [short] }).series).toEqual([])
  })

  it('reads the payload a running call cannot carry', () => {
    expect(resultCharts(running()).series).toEqual([])
  })

  it('reads the payload of a settled call, and nothing when it carries none', () => {
    expect(resultCharts(settled('not a document')).series).toEqual([])
    expect(resultCharts(settled('not a document', { meta: { version: 1, series: [line] } })).series).toEqual([line])
  })
})

describe('chart panel derivation', () => {
  const valuation: ChartSeriesModel = {
    id: 'valuation',
    kind: 'line',
    dates: ['2026-08-31', '2026-09-21'],
    columns: { pe: [12.68, 12.77], pb: [1.4, 1.42] },
  }

  it('derives the valuation panels a card draws, in panel order', () => {
    expect(valuationPanels(valuation).map(panel => panel.key)).toEqual(['pe', 'pb'])
    expect(valuationPanels(valuation)[0]?.unit).toBe('number')
    expect(valuationPanels(valuation)[0]?.labelKey).toBe('macro.pe')
    expect(valuationPanels(valuation)[0]?.points).toEqual([12.68, 12.77])
  })

  it('derives the equity-risk-premium panels as percentages', () => {
    const erp: ChartSeriesModel = { ...valuation, id: 'erp', columns: { erp: [6.2], erp_percentile: [0.48] } }
    expect(erpPanels(erp).map(panel => panel.unit)).toEqual(['percent', 'fraction'])
    expect(erpPanels(erp).map(panel => panel.labelKey)).toEqual(['chart.erpLevel', 'chart.erpPercentile'])
  })

  it('derives the index panels of a composed-timing result', () => {
    const comparison: ChartSeriesModel = { ...valuation, id: 'index_comparison', columns: { csi300: [1], csi2000: [2] } }
    expect(comparisonPanels(comparison).map(panel => panel.labelKey)).toEqual(['index.csi300', 'index.csi2000'])
  })

  it('keeps only the columns a result actually published', () => {
    expect(valuationPanels({ ...valuation, columns: { pe: [12.77] } }).map(panel => panel.key)).toEqual(['pe'])
    expect(valuationPanels(null)).toEqual([])
    expect(erpPanels(null)).toEqual([])
    expect(comparisonPanels(null)).toEqual([])
  })

  it('reduces a date axis to its first and last labels', () => {
    expect(chartRange(['2026-09-18T00:00:00', '2026-09-21T00:00:00'])).toEqual(['2026-09-18', '2026-09-21'])
    expect(chartRange([])).toBeNull()
  })

  it('agrees with the payload a real bridge run published', () => {
    const block = settledCharts('csi300')
    const price = timeSeries(resultCharts(block), 'price')
    expect(price?.kind).toBe('candlestick')
    const dates = price?.dates ?? []
    expect(dates).toHaveLength(120)
    expect(dates[dates.length - 1]).toBe('2026-09-22')
    expect(chartRange(dates)).toEqual(['2026-04-01', '2026-09-22'])
    expect(valuationPanels(chartSeries(resultCharts(block), 'valuation'))).toHaveLength(2)
    expect(erpPanels(chartSeries(resultCharts(block), 'erp'))).toHaveLength(2)
  })
})

describe('candlestick columns', () => {
  const bars: ChartSeriesModel = {
    id: 'price',
    kind: 'candlestick',
    dates: ['2026-09-21'],
    columns: { open: [1], high: [2], low: [0], close: [1.5], volume: [7] },
  }

  it('reads the bar columns of a published candlestick series', () => {
    expect(candlestickModel(bars)).toEqual({
      dates: ['2026-09-21'], open: [1], high: [2], low: [0], close: [1.5], volume: [7],
    })
  })

  it('reports no bars for a series the payload does not describe as a candlestick', () => {
    expect(candlestickModel(null)).toBeNull()
    expect(candlestickModel({ ...bars, kind: 'line' })).toBeNull()
    expect(candlestickModel({ ...bars, columns: { open: [1], high: [2], low: [0] } })).toBeNull()
  })

  it('reads a candlestick series that published no volume', () => {
    const { volume: _dropped, ...rest } = bars.columns
    expect(candlestickModel({ ...bars, columns: rest })?.volume).toEqual([])
  })
})

describe('category series and valuation percentiles', () => {
  const bars: ChartSeriesModel = {
    id: 'percentiles',
    kind: 'bar',
    categories: ['pe_percentile', 'pb_percentile', 'mean_percentile'],
    columns: { value: [0.75, 0.6, 0.675] },
    reference: 0.5,
  }

  it('reads a published bar series and derives its rows in bar order', () => {
    const model = valuationPercentiles(bars)
    expect(model?.reference).toBe(0.5)
    expect(model?.bars.map(bar => bar.key)).toEqual(['pe_percentile', 'pb_percentile', 'mean_percentile'])
    expect(model?.bars.map(bar => bar.labelKey)).toEqual([
      'chart.pePercentile', 'chart.pbPercentile', 'chart.meanPercentile',
    ])
    expect(model?.bars[0]?.value).toBe(0.75)
  })

  it('reports no rows for a series that is not a published bar set', () => {
    expect(valuationPercentiles(null)).toBeNull()
    expect(valuationPercentiles({ ...bars, kind: 'line', dates: [] } as unknown as ChartSeriesModel)).toBeNull()
    expect(valuationPercentiles({ ...bars, columns: { other: [1] } })).toBeNull()
  })

  it('skips a category the card does not draw and a bar without a value', () => {
    const model = valuationPercentiles({ ...bars, categories: ['pe_percentile', 'mystery'], columns: { value: [0.75, null] } })
    expect(model?.bars.map(bar => bar.key)).toEqual(['pe_percentile'])
    expect(valuationPercentiles({ ...bars, categories: ['mystery'], columns: { value: [0.75] } })).toBeNull()
  })

  it('narrows a published bar set that names no boundary, and drops one without a value column', () => {
    const noReference = { id: 'percentiles', kind: 'bar', categories: ['pe_percentile'], columns: { value: [0.75] } }
    expect(readChartPayload({ version: 1, series: [noReference] }).series).toEqual([noReference])
    const noValue = { id: 'percentiles', kind: 'bar', categories: ['pe_percentile'], columns: { pe: [0.75] } }
    expect(readChartPayload({ version: 1, series: [noValue] }).series).toEqual([])
  })

  it('reports no boundary when the result names none', () => {
    const { reference: _dropped, ...rest } = bars
    expect(valuationPercentiles(rest)?.reference).toBeNull()
  })

  it('reads only date series under a time-axis id', () => {
    const payload = readChartPayload({ version: 1, series: [bars] })
    expect(timeSeries(payload, 'percentiles')).toBeNull()
    expect(timeSeries(payload, 'price')).toBeNull()
    const line = { id: 'price', kind: 'line', dates: ['2026-09-21'], columns: { close: [1] } }
    expect(timeSeries(readChartPayload({ version: 1, series: [line] }), 'price')).toEqual(line)
  })

  it('agrees with the percentiles a real bridge run published', () => {
    const model = valuationPercentiles(chartSeries(resultCharts(settledCharts('csi300')), 'percentiles'))
    expect(model?.bars.map(bar => bar.key)).toEqual(['pe_percentile', 'pb_percentile', 'mean_percentile'])
    expect(model?.reference).toBe(0.5)
    for (const bar of model?.bars ?? []) {
      expect(bar.value).toBeGreaterThanOrEqual(0)
      expect(bar.value).toBeLessThanOrEqual(1)
    }
  })
})

describe('chart projection narrowing', () => {
  const charts = { version: 1, series: [{ id: 'price', kind: 'line', dates: ['2026-09-22'], columns: { close: [1] } }] }

  it('reads a published projection value with its turn and seq', () => {
    expect(readChartProjection({ charts, turn: 4, seq: 9 })).toEqual({
      charts: { series: [{ id: 'price', kind: 'line', dates: ['2026-09-22'], columns: { close: [1] } }] },
      turn: 4,
      seq: 9,
    })
  })

  it('reports no charts for a value without a readable payload', () => {
    expect(readChartProjection({ charts: null, turn: null, seq: null })).toEqual({ charts: null, turn: null, seq: null })
    expect(readChartProjection({ charts: { version: 9 }, turn: 4, seq: 9 }).charts).toBeNull()
    expect(readChartProjection({ charts: { version: 1, series: [] }, turn: 4, seq: 9 }).charts).toBeNull()
    expect(readChartProjection(undefined)).toEqual({ charts: null, turn: null, seq: null })
    expect(readChartProjection('nope')).toEqual({ charts: null, turn: null, seq: null })
  })

  it('reports an absent turn and seq as null rather than inventing one', () => {
    expect(readChartProjection({ charts }).turn).toBeNull()
    expect(readChartProjection({ charts }).seq).toBeNull()
  })
})
