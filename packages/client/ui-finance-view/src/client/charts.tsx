/**
 * Hand-written chart shapes for the finance cards: a linear score bar, the
 * semi-circular threshold gauge, a candlestick panel over daily bars, and
 * stacked trend panels over a monthly series. Every shape takes semantic tokens
 * through CSS classes, so the WorkBuddy skin recolors them with no component
 * change.
 *
 * The series these draw are read from the tool result's presentation metadata;
 * a series the payload does not carry draws nothing rather than an empty frame.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/charts
 */

import type { CSSProperties } from 'react'
import css from './FinanceView.module.css'

/** Gauge geometry in its own viewBox units. */
const GAUGE = { width: 120, height: 64, cx: 60, cy: 58, radius: 46 } as const

/** Candlestick panel geometry: one shared width, a price panel over a volume panel. */
const BAR = { width: 720, price: 168, volume: 40, gap: 10, pad: 6 } as const

/** Trend panel geometry: one panel per drawn column. */
const TREND = { width: 720, height: 72, pad: 6 } as const

/** Round a computed coordinate so the emitted path stays stable. */
function round(value: number): number {
  return Number(value.toFixed(2))
}

/** A point on the gauge arc; the angle runs from 0 (right) to PI (left). */
function point(angle: number, radius: number): readonly [number, number] {
  return [round(GAUGE.cx + radius * Math.cos(angle)), round(GAUGE.cy - radius * Math.sin(angle))]
}

/** Clamp a value into the gauge's ratio span. */
function ratioOf(value: number, max: number): number {
  return max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
}

/** The span a scale maps onto, and whether it has any extent to map. */
interface Span {
  readonly min: number
  readonly max: number
}

/** The smallest and largest members of a numeric series. */
function spanOf(values: readonly (number | null)[]): Span | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (value === null) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  return min <= max ? { min, max } : null
}

/** One value's y coordinate inside a panel, top-down. */
function scaleY(value: number, span: Span, top: number, height: number): number {
  const extent = span.max - span.min
  // A flat series has no extent to scale: it draws on the panel's centre line.
  const ratio = extent > 0 ? (span.max - value) / extent : 0.5
  return round(top + ratio * height)
}

/** One panel's horizontal step and the centre of its i-th band. */
function bandCenter(index: number, count: number): number {
  const width = BAR.width / count
  return round(index * width + width / 2)
}

/**
 * One labelled score bar with an accessible progressbar value.
 * @param props.label - the dimension name.
 * @param props.score - the achieved score.
 * @param props.max - the dimension's parsed maximum.
 * @param props.valueText - the localized `score / max` text.
 * @param props.reference - a boundary on the same scale to mark on the track.
 * @returns the bar row.
 */
export function ScoreBar({ label, score, max, valueText, reference }: {
  label: string
  score: number
  max: number
  valueText: string
  reference?: number | undefined
}) {
  const fill = `${ratioOf(score, max) * 100}%`
  return (
    <div className={css.barRow}>
      <span className={css.barLabel}>{label}</span>
      <span
        className={css.barTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score}
      >
        <span className={css.barFill} style={{ '--finance-bar-fill': fill } as CSSProperties} />
        {reference === undefined
          ? null
          : <span className={css.barReference} style={{ '--finance-bar-reference': `${ratioOf(reference, max) * 100}%` } as CSSProperties} />}
      </span>
      <span className={css.barValue}>{valueText}</span>
    </div>
  )
}

/**
 * The total-score gauge with its threshold tick.
 * @param props.label - the accessible name of the whole gauge.
 * @param props.value - the total score.
 * @param props.threshold - the ice-point threshold.
 * @param props.max - the score scale the arc spans.
 * @param props.valueText - the localized score text.
 * @param props.thresholdText - the localized threshold text.
 * @returns the gauge.
 */
export function ThresholdGauge({ label, value, threshold, max, valueText, thresholdText }: {
  label: string
  value: number
  threshold: number
  max: number
  valueText: string
  thresholdText: string
}) {
  const [leftX, leftY] = point(Math.PI, GAUGE.radius)
  const [rightX, rightY] = point(0, GAUGE.radius)
  const [endX, endY] = point(Math.PI * (1 - ratioOf(value, max)), GAUGE.radius)
  const [tickX1, tickY1] = point(Math.PI * (1 - ratioOf(threshold, max)), GAUGE.radius - 7)
  const [tickX2, tickY2] = point(Math.PI * (1 - ratioOf(threshold, max)), GAUGE.radius + 3)
  return (
    <div className={css.gaugeWrap} role="img" aria-label={`${label}, ${valueText}, ${thresholdText}`}>
      <svg className={css.gauge} viewBox={`0 0 ${GAUGE.width} ${GAUGE.height}`} aria-hidden="true">
        <path
          className={css.gaugeTrack}
          d={`M ${leftX} ${leftY} A ${GAUGE.radius} ${GAUGE.radius} 0 0 1 ${rightX} ${rightY}`}
        />
        {ratioOf(value, max) > 0
          ? <path className={css.gaugeValue} d={`M ${leftX} ${leftY} A ${GAUGE.radius} ${GAUGE.radius} 0 0 1 ${endX} ${endY}`} />
          : null}
        <line className={css.gaugeTick} x1={tickX1} y1={tickY1} x2={tickX2} y2={tickY2} />
      </svg>
      <div className={css.gaugeLabels}>
        <span className={css.gaugeValueText}>{valueText}</span>
        <span className={css.gaugeThresholdText}>{thresholdText}</span>
      </div>
    </div>
  )
}

/** One daily bar already resolved into panel coordinates. */
interface BarShape {
  readonly x: number
  readonly width: number
  readonly up: boolean
  readonly bodyTop: number
  readonly bodyHeight: number
  readonly wickTop: number
  readonly wickBottom: number
  readonly volumeTop: number
  readonly volumeHeight: number
}

/** Props of the candlestick panel: one aligned OHLCV window plus its copy. */
export interface CandlestickChartProps {
  /** Localized panel title. */
  readonly title: string
  /** Localized first-to-last axis label. */
  readonly rangeText: string
  /** Accessible summary of the drawn window. */
  readonly caption: string
  readonly dates: readonly string[]
  readonly open: readonly (number | null)[]
  readonly high: readonly (number | null)[]
  readonly low: readonly (number | null)[]
  readonly close: readonly (number | null)[]
  readonly volume: readonly (number | null)[]
}

/** Resolve every drawable daily bar, skipping the days the source left without a full bar. */
function barShapesOf(props: CandlestickChartProps): readonly BarShape[] {
  const priceSpan = spanOf([...props.low, ...props.high])
  if (priceSpan === null) return []
  const volumeSpan = spanOf(props.volume)
  const count = props.dates.length
  const bodyWidth = round(Math.max(1, BAR.width / count * 0.6))
  const volumeBase = BAR.price + BAR.gap + BAR.volume
  const shapes: BarShape[] = []
  for (let index = 0; index < count; index += 1) {
    const barOpen = props.open[index] ?? null
    const barHigh = props.high[index] ?? null
    const barLow = props.low[index] ?? null
    const barClose = props.close[index] ?? null
    if (barOpen === null || barHigh === null || barLow === null || barClose === null) continue
    const bodyTop = scaleY(Math.max(barOpen, barClose), priceSpan, BAR.pad, BAR.price - 2 * BAR.pad)
    const bodyBottom = scaleY(Math.min(barOpen, barClose), priceSpan, BAR.pad, BAR.price - 2 * BAR.pad)
    const traded = props.volume[index] ?? null
    const volumeHeight = volumeSpan === null || volumeSpan.max <= 0 || traded === null
      ? 0
      : round(traded / volumeSpan.max * BAR.volume)
    shapes.push({
      x: bandCenter(index, count),
      width: bodyWidth,
      up: barClose >= barOpen,
      bodyTop,
      bodyHeight: Math.max(1, round(bodyBottom - bodyTop)),
      wickTop: scaleY(barHigh, priceSpan, BAR.pad, BAR.price - 2 * BAR.pad),
      wickBottom: scaleY(barLow, priceSpan, BAR.pad, BAR.price - 2 * BAR.pad),
      volumeTop: round(volumeBase - volumeHeight),
      volumeHeight,
    })
  }
  return shapes
}

/**
 * The daily candlestick panel: one wick and body per bar over a volume strip.
 * @param props - the OHLCV window, its axis, and the panel's copy.
 * @returns the panel, or null when no day carries a full bar.
 */
export function CandlestickChart(props: CandlestickChartProps) {
  const bars = barShapesOf(props)
  if (bars.length === 0) return null
  const height = BAR.price + BAR.gap + BAR.volume
  return (
    <figure className={css.chartWrap}>
      <figcaption className={css.chartHead}>
        <span className={css.chartTitle}>{props.title}</span>
        <span className={css.chartRange}>{props.rangeText}</span>
      </figcaption>
      <svg className={css.chartSvg} viewBox={`0 0 ${BAR.width} ${height}`} role="img" aria-label={`${props.title}, ${props.caption}`}>
        {bars.map(bar => (
          <g key={bar.x} className={bar.up ? css.barUp : css.barDown}>
            <line className={css.barWick} x1={bar.x} y1={bar.wickTop} x2={bar.x} y2={bar.wickBottom} />
            <rect
              className={css.barBody}
              x={round(bar.x - bar.width / 2)}
              y={bar.bodyTop}
              width={bar.width}
              height={bar.bodyHeight}
            />
            {bar.volumeHeight > 0
              ? (
                <rect
                  className={css.barVolume}
                  x={round(bar.x - bar.width / 2)}
                  y={bar.volumeTop}
                  width={bar.width}
                  height={bar.volumeHeight}
                />
              )
              : null}
          </g>
        ))}
      </svg>
    </figure>
  )
}

/** One stacked trend panel: its own scale, its own readout. */
export interface TrendPanel {
  /** Stable column key, used only as the render key. */
  readonly key: string
  /** Localized panel label. */
  readonly label: string
  /** Localized first, last, minimum, and maximum readout. */
  readonly readout: string
  /** The panel's points, `null` where the source had no value. */
  readonly points: readonly (number | null)[]
}

/** Props of the stacked trend panels: one shared axis plus one panel per column. */
export interface TrendChartProps {
  /** Accessible summary of every panel. */
  readonly caption: string
  readonly panels: readonly TrendPanel[]
}

/** One panel's polyline segments: a `null` breaks the line instead of bridging the gap. */
function trendSegments(points: readonly (number | null)[], span: Span): readonly string[] {
  const step = points.length > 1 ? TREND.width / (points.length - 1) : TREND.width
  const segments: string[] = []
  let current: string[] = []
  for (const [index, value] of points.entries()) {
    if (value === null) {
      if (current.length > 0) segments.push(current.join(' '))
      current = []
      continue
    }
    const x = points.length > 1 ? round(index * step) : round(TREND.width / 2)
    current.push(`${x},${scaleY(value, span, TREND.pad, TREND.height - 2 * TREND.pad)}`)
  }
  if (current.length > 0) segments.push(current.join(' '))
  return segments
}

/**
 * One or more trend panels over a shared date axis, each scaled to its own column.
 * @param props - the panels to draw plus the chart's accessible summary.
 * @returns the panels, or null when no panel carries a drawable point.
 */
export function TrendChart({ panels, caption }: TrendChartProps) {
  const drawable = panels
    .map(panel => ({ panel, span: spanOf(panel.points) }))
    .filter((entry): entry is { panel: TrendPanel; span: Span } => entry.span !== null)
  if (drawable.length === 0) return null
  return (
    <div className={css.chartWrap} role="img" aria-label={caption}>
      {drawable.map(({ panel, span }) => (
        <figure key={panel.key} className={css.trendPanel}>
          <figcaption className={css.trendHead}>
            <span className={css.trendLabel}>{panel.label}</span>
            <span className={css.trendReadout}>{panel.readout}</span>
          </figcaption>
          <svg className={css.trendSvg} viewBox={`0 0 ${TREND.width} ${TREND.height}`} aria-hidden="true">
            {trendSegments(panel.points, span).map(segment => (
              <polyline key={segment} className={css.trendLine} points={segment} />
            ))}
          </svg>
        </figure>
      ))}
    </div>
  )
}
