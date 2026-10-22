/**
 * Render a structured deck into the Swiss template shipped with this package.
 *
 * The renderer is deliberately layout-locked: the model chooses one of seven
 * named layouts, and this module owns the markup, theme, and safety rules. It
 * never accepts raw HTML from the model, so a deck cannot smuggle scripts or
 * break the template's grid.
 *
 * @module @deepseek-ai/dsh-ppt-local/render
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PptBar, PptCompareSide, PptDeck, PptLayer, PptMetric, PptSlide, PptStep, PptTakeaway, PptTheme } from './types.ts'

function assetPath(relative: string): string {
  const candidates = [
    new URL(`../${relative}`, import.meta.url),
    new URL(`../../${relative}`, import.meta.url),
  ].map(url => fileURLToPath(url))
  const found = candidates.find(candidate => existsSync(candidate))
  if (found === undefined) throw new Error(`ppt-local: bundled asset is missing: ${relative}`)
  return found
}

const TEMPLATE = assetPath('assets/template-swiss.html')

/** The four legal Swiss accent palettes. */
const PALETTES: Record<PptTheme, Readonly<Record<string, string>>> = {
  ikb: {
    '--paper': '#fafaf8', '--paper-rgb': '250,250,248', '--ink': '#0a0a0a', '--ink-rgb': '10,10,10',
    '--grey-1': '#f0f0ee', '--grey-2': '#d4d4d2', '--grey-3': '#737373',
    '--accent': '#002FA7', '--accent-rgb': '0,47,167', '--accent-on': '#ffffff',
  },
  lemon: {
    '--paper': '#fafaf8', '--paper-rgb': '250,250,248', '--ink': '#0a0a0a', '--ink-rgb': '10,10,10',
    '--grey-1': '#f0f0ee', '--grey-2': '#d4d4d2', '--grey-3': '#737373',
    '--accent': '#FFD500', '--accent-rgb': '255,213,0', '--accent-on': '#0a0a0a',
  },
  green: {
    '--paper': '#fafaf8', '--paper-rgb': '250,250,248', '--ink': '#0a0a0a', '--ink-rgb': '10,10,10',
    '--grey-1': '#f0f0ee', '--grey-2': '#d4d4d2', '--grey-3': '#737373',
    '--accent': '#C5E803', '--accent-rgb': '197,232,3', '--accent-on': '#0a0a0a',
  },
  orange: {
    '--paper': '#fafaf8', '--paper-rgb': '250,250,248', '--ink': '#0a0a0a', '--ink-rgb': '10,10,10',
    '--grey-1': '#f0f0ee', '--grey-2': '#d4d4d2', '--grey-3': '#737373',
    '--accent': '#FF6B35', '--accent-rgb': '255,107,53', '--accent-on': '#ffffff',
  },
}

/** Escape one text node. The model's text is never treated as markup. */
function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Escape text and preserve explicit line breaks. */
function lines(text: string): string {
  return escape(text).replace(/\r?\n/g, '<br/>')
}

/** One chrome row with a section label and the page position. */
function chrome(slide: PptSlide, index: number, total: number, dark: boolean): string {
  const color = dark ? 'rgba(255,255,255,.62)' : 'var(--text-helper)'
  return `<div class="chrome-min"><div class="l">${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${escape((slide.kicker ?? 'PRESENTATION').toUpperCase())}</div><div class="r" style="color:${color}">${escape(slide.title)}</div></div>`
}

/** The common left-top heading block. */
function heading(slide: PptSlide, dark: boolean): string {
  const kicker = slide.kicker === undefined ? '' : `<div class="t-cat accent">${escape(slide.kicker)}</div>`
  const lead = slide.lead === undefined ? '' : `<p class="lead" style="max-width:58ch;margin-top:3.6vh">${lines(slide.lead)}</p>`
  return `<div data-anim="line" style="margin-top:2.4vh">${kicker}<h2 class="h-xl" style="margin-top:1.4vh;font-size:min(4.8vw,8.6vh);color:${dark ? 'var(--paper)' : 'var(--text-primary)'}">${lines(slide.title)}</h2>${lead}</div>`
}

/** The source line every body slide can carry. */
function source(slide: PptSlide, dark: boolean): string {
  if (slide.source === undefined) return ''
  return `<div class="t-meta" style="margin-top:auto;padding-top:2vh;color:${dark ? 'rgba(255,255,255,.55)' : 'var(--text-helper)'}">${escape(slide.source)}</div>`
}

/** A cover: full accent field, ASCII breathing canvas, one large statement. */
function cover(slide: PptSlide, index: number, total: number): string {
  return `<section class="slide accent" data-animate="hero" data-slide-id="cover" data-layout="SWISS-COVER-ASCII">
  <div class="canvas-card">
    <canvas class="ascii-bg" aria-hidden="true"></canvas>
    <div class="chrome-min"><div class="l">${escape(slide.kicker ?? 'PRESENTATION')}</div><div class="r">${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div></div>
    <div style="flex:1;padding:0;display:grid;grid-template-rows:auto 1fr auto;gap:2.6vh">
      <div></div>
      <h1 data-anim="title" style="align-self:center;font-family:var(--sans),var(--sans-zh);font-weight:200;font-size:min(7.2vw,12.8vh);line-height:.94;letter-spacing:-.025em;color:#fff">${lines(slide.title)}</h1>
      <div data-anim="bottom" style="display:grid;grid-template-rows:auto auto;gap:1.6vh;border-top:1px solid rgba(255,255,255,.22);padding-top:2vh">
        <div data-anim="lead" class="lead" style="max-width:56ch;color:rgba(255,255,255,.86)">${slide.lead === undefined ? '' : lines(slide.lead)}</div>
        <div style="display:flex;justify-content:space-between;align-items:end"><div class="t-meta" style="color:rgba(255,255,255,.6)">${escape(slide.source ?? '')}</div><div></div></div>
      </div>
    </div>
  </div>
</section>`
}

/** Four KPI towers, heights chosen by the model's relative ranking. */
function kpi(slide: PptSlide, index: number, total: number): string {
  const metrics = slide.metrics ?? []
  if (metrics.length !== 4) throw new Error('kpi layout needs exactly 4 metrics')
  const icons = ['battery-charging', 'ship', 'trending-up', 'zap']
  const cards = metrics.map((metric: PptMetric, i: number) => {
    const height = Math.min(4, Math.max(1, metric.size ?? (i === 0 ? 4 : 3)))
    const accent = i === 0 ? ' b-accent' : ''
    return `<div class="bar-tower"><div class="cap"><i data-lucide="${icons[i] ?? 'circle'}"></i></div><div class="body-block h-${height}${accent}"><div class="lbl">${escape(metric.label)}</div><div class="nb">${escape(metric.value)}</div>${metric.note === undefined ? '' : `<div class="sub">${lines(metric.note)}</div>`}</div></div>`
  }).join('')
  return `<section class="slide light" data-animate="measure-up" data-slide-id="s${index + 1}" data-layout="S06">
  <div class="canvas-card">
    ${chrome(slide, index, total, false)}
    ${heading(slide, false)}
    <div class="bar-towers" style="margin-top:4.2vh">${cards}</div>
    ${source(slide, false)}
  </div>
</section>`
}

/** Two equal columns with a hairline rule. */
function compare(slide: PptSlide, index: number, total: number): string {
  const { left, right } = slide
  if (left === undefined || right === undefined) throw new Error('compare layout needs left and right')
  const column = (side: PptCompareSide, accent: boolean): string => `<div class="col${accent ? ' accent' : ''}">
    <div class="col-tag"><span class="num">0${accent ? 2 : 1}</span> ${escape(side.tag)}</div>
    <div class="col-ttl">${escape(side.value)}</div>
    ${side.description === undefined ? '' : `<p class="col-desc">${lines(side.description)}</p>`}
    ${side.bullets === undefined || side.bullets.length === 0 ? '' : `<ul class="col-list">${side.bullets.map(item => `<li>${lines(item)}</li>`).join('')}</ul>`}
  </div>`
  return `<section class="slide dark" data-animate="duo-mirror" data-slide-id="s${index + 1}" data-layout="S08">
  <div class="canvas-card">
    ${chrome(slide, index, total, true)}
    ${heading(slide, true)}
    <div class="duo-compare" style="margin-top:3.2vh">${column(left, false)}<span class="vrule"></span>${column(right, true)}</div>
    ${source(slide, true)}
  </div>
</section>`
}

/** Five to eight horizontal percentage bars. */
function bars(slide: PptSlide, index: number, total: number): string {
  const bars = slide.bars ?? []
  if (bars.length < 5 || bars.length > 8) throw new Error('bars layout needs 5 to 8 rows')
  const rows = bars.map((bar: PptBar, i: number) => {
    if (!Number.isFinite(bar.value) || bar.value < 0 || bar.value > 100) throw new Error(`bars[${String(i)}].value must be between 0 and 100`)
    const display = bar.display ?? `${bar.value.toFixed(1)}%`
    return `<div class="row-lbl">${escape(bar.label)}</div><div class="row-track"><div class="row-fill${i === 0 ? ' accent' : ''}" style="width:${bar.value}%"></div></div><div class="row-val">${escape(display)}</div>`
  }).join('')
  return `<section class="slide light" data-animate="bar-grow" data-slide-id="s${index + 1}" data-layout="S07">
  <div class="canvas-card">
    ${chrome(slide, index, total, false)}
    ${heading(slide, false)}
    <div class="h-bar-chart" style="margin-top:5.4vh;gap:2.6vh 1.6vw">${rows}</div>
    ${source(slide, false)}
  </div>
</section>`
}

/** Five to seven alternating timeline nodes. */
function timeline(slide: PptSlide, index: number, total: number): string {
  const steps = slide.steps ?? []
  if (steps.length < 5 || steps.length > 7) throw new Error('timeline layout needs 5 to 7 steps')
  const nodes = steps.map((step: PptStep, i: number) => `<div class="th-node ${i % 2 === 0 ? 'up' : 'down'}${i === steps.length - 1 ? ' accent' : ''}"><span class="dot"></span><div class="label"><span class="yr">${escape(step.label)}</span>${step.value === undefined ? '' : `<span class="name">${escape(step.value)}</span>`}</div></div>`).join('')
  return `<section class="slide dark" data-animate="timeline-walk" data-slide-id="s${index + 1}" data-layout="S11">
  <div class="canvas-card">
    ${chrome(slide, index, total, true)}
    ${heading(slide, true)}
    <div class="timeline-h" style="margin-top:6vh"><div class="tl-row">${nodes}</div></div>
    ${source(slide, true)}
  </div>
</section>`
}

/** Exactly three horizontal layer blocks. */
function layers(slide: PptSlide, index: number, total: number): string {
  const items = slide.layers ?? []
  if (items.length !== 3) throw new Error('layers layout needs exactly 3 layers')
  const tones = ['b-grey', 'b-accent', 'b-ink']
  const icons = ['car', 'battery-charging', 'ship']
  const blocks = items.map((layer: PptLayer, i: number) => `<div class="stack-block ${tones[i] ?? 'b-grey'}"><div class="layer-nb">${escape(layer.tag)}</div><div class="layer-icon"><i data-lucide="${icons[i] ?? 'circle'}" style="width:3vw;height:3vw;stroke-width:1.4"></i></div><div class="layer-ttl">${escape(layer.title)}</div><div class="layer-desc">${lines(layer.description)}</div></div>`).join('')
  return `<section class="slide light" data-animate="stack-build" data-slide-id="s${index + 1}" data-layout="S05">
  <div class="canvas-card">
    ${chrome(slide, index, total, false)}
    ${heading(slide, false)}
    <div class="stack-row" style="margin-top:4.6vh">${blocks}</div>
    ${source(slide, false)}
  </div>
</section>`
}

/** A split closing with three imperatives. */
function closing(slide: PptSlide, index: number, total: number): string {
  const takeaways = slide.takeaways ?? []
  if (takeaways.length !== 3) throw new Error('closing layout needs exactly 3 takeaways')
  const rules = takeaways.map((item: PptTakeaway, i: number) => {
    const accent = i === 2
    return `<div style="display:grid;grid-template-columns:auto 1fr;gap:2vw;align-items:start;padding:2.6vh 0;border-top:1px solid var(--border-subtle);${accent ? 'border-bottom:2px solid var(--accent)' : ''}">
      <div style="font-family:var(--sans);font-weight:200;font-size:min(4.4vw,7.8vh);line-height:.9;color:${accent ? 'var(--accent)' : 'var(--text-primary)'}">0${i + 1}</div>
      <div><h3 style="font-family:var(--sans),var(--sans-zh);font-weight:400;font-size:max(18px,1.8vw);line-height:1.2;letter-spacing:-.015em;color:${accent ? 'var(--accent)' : 'var(--text-primary)'};margin-bottom:1vh">${escape(item.title)}</h3><p style="font-family:var(--sans),var(--sans-zh);font-size:max(16px,.94vw);line-height:1.6;color:var(--text-secondary);font-weight:400">${lines(item.description)}</p></div></div>`
  }).join('')
  return `<section class="slide split" data-animate="split-statement" data-slide-id="closing" data-layout="S10">
  <div class="canvas-card">
    <div class="split-half">
      <div class="half b-accent" style="padding:5.6vh 3.6vw 7vh;justify-content:space-between;position:relative;overflow:hidden">
        <canvas class="ascii-bg" aria-hidden="true"></canvas>
        <div class="chrome-min" style="margin-bottom:0;position:relative;z-index:1"><div class="l">${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div><div class="r">CLOSING</div></div>
        <div data-anim="manifesto" style="display:flex;flex-direction:column;gap:2vh;position:relative;z-index:1">
          <div class="t-meta" style="color:rgba(255,255,255,.78);letter-spacing:.22em;margin-bottom:1.6vh">TAKEAWAY</div>
          <h2 style="font-family:var(--sans),var(--sans-zh);font-size:min(7vw,12vh);line-height:.96;letter-spacing:-.025em;font-weight:200;color:#fff">${lines(slide.title)}</h2>
          <div style="font-family:var(--sans),var(--sans-zh);font-size:max(14px,1vw);line-height:1.6;color:rgba(255,255,255,.82);font-weight:400;max-width:34ch;margin-top:1.4vh">${slide.lead === undefined ? '' : lines(slide.lead)}</div>
        </div>
        <div data-anim="signature" style="display:flex;justify-content:space-between;align-items:end;border-top:1px solid rgba(255,255,255,.22);padding-top:2vh;position:relative;z-index:1"><div class="t-meta" style="color:rgba(255,255,255,.62)">${escape(slide.source ?? '')}</div><div class="t-meta" style="color:rgba(255,255,255,.62)">${new Date().toISOString().slice(0, 10)}</div></div>
      </div>
      <div class="half" style="padding:5.6vh 3.6vw 7vh;justify-content:space-between">
        <div class="chrome-min"><div class="l">TAKEAWAYS</div><div class="r">03 RULES</div></div>
        <div data-anim="rules" style="display:flex;flex-direction:column;gap:0">${rules}</div>
        <div data-anim="foot" class="t-meta" style="color:var(--text-helper);text-align:right">→ 完 · END OF FIELD NOTE</div>
      </div>
    </div>
  </div>
</section>`
}

/** Render one slide by its named layout. */
function slide(slideSpec: PptSlide, index: number, total: number): string {
  switch (slideSpec.layout) {
    case 'cover': return cover(slideSpec, index, total)
    case 'kpi': return kpi(slideSpec, index, total)
    case 'compare': return compare(slideSpec, index, total)
    case 'bars': return bars(slideSpec, index, total)
    case 'timeline': return timeline(slideSpec, index, total)
    case 'layers': return layers(slideSpec, index, total)
    case 'closing': return closing(slideSpec, index, total)
    default: throw new Error(`unsupported slide layout: ${String(slideSpec.layout)}`)
  }
}

/** The CSS corrections every generated deck shares. */
const CSS_FIXES = `
  /* Keep content above the bottom navigation / page dots. */
  .slide .canvas-card{padding-bottom:7vh}
  .slide.split .canvas-card .half{padding-bottom:7vh !important}
  .slide .h-xl + .lead{margin-top:3.6vh !important}
  .slide.split .split-half h3 + p{margin-top:2vh !important}
  .slide.dark .timeline-h .th-node .name{color:var(--paper)}
  .slide.dark .timeline-h .th-node .desc{color:rgba(255,255,255,.72)}
  .slide.dark .timeline-h .th-node.accent .name{color:var(--accent)}
  .bar-towers{max-height:43vh}
  .bar-tower .body-block.h-4{min-height:34vh}
  .bar-tower .body-block.h-3{min-height:27vh}
  .bar-tower .body-block.h-2{min-height:20vh}
`

/** Build the speaker-note records the template's presenter mode reads. */
function notes(spec: PptDeck): string {
  const records = spec.slides.map((item, i) => ({
    id: item.layout === 'cover' ? 'cover' : item.layout === 'closing' ? 'closing' : `s${String(i + 1)}`,
    title: item.title,
    section: item.kicker ?? (i === 0 ? '开场' : i === spec.slides.length - 1 ? '收束' : '正文'),
    minutes: 0.8,
    purpose: item.lead ?? item.title,
    talk: [item.title, item.lead ?? '用这一页的证据推进判断。'],
    transition: i === spec.slides.length - 1 ? '结束，进入提问' : '进入下一页',
  }))
  return `const SPEAKER_NOTES = ${JSON.stringify(records, null, 2)};`
}

/** Apply one accent palette to the template's root variables. */
function applyTheme(template: string, theme: PptTheme): string {
  let out = template
  for (const [key, value] of Object.entries(PALETTES[theme])) {
    out = out.replace(new RegExp(`${key}:\\s*[^;]+;`, 'u'), `${key}:${value};`)
  }
  return out
}

/**
 * Render one deck.
 * @param spec - validated deck spec.
 * @returns the complete HTML document.
 */
export function renderDeck(spec: PptDeck): string {
  if (spec.slides.length < 5 || spec.slides.length > 12) throw new Error('a deck needs 5 to 12 slides')
  let html = readFileSync(TEMPLATE, 'utf8')
  const slides = spec.slides.map((item, i) =>
    i === 0 && item.lead === undefined && spec.subtitle !== undefined
      ? { ...item, lead: spec.subtitle }
      : item)
  const total = slides.length
  const body = slides.map((item, i) => slide(item, i, total)).join('\n\n')

  const start = html.indexOf('<!-- ============================================================\n     SLIDES 插入区')
  const end = html.indexOf('</div>\n\n<div id="nav">', start)
  if (start < 0 || end < 0) throw new Error('template slide insertion point is missing')
  html = `${html.slice(0, start)}${body}\n${html.slice(end)}`

  const notesStart = html.indexOf('const SPEAKER_NOTES = [')
  const notesEnd = html.indexOf('window.__SPEAKER_NOTES__', notesStart)
  if (notesStart < 0 || notesEnd < 0) throw new Error('template speaker-note insertion point is missing')
  html = `${html.slice(0, notesStart)}${notes(spec)}\n${html.slice(notesEnd)}`

  html = html.replace(/<title>[\s\S]*?<\/title>/u, `<title>${escape(spec.title)}</title>`)
  html = applyTheme(html, spec.theme ?? 'ikb')
  html = html.replace('</style>', `${CSS_FIXES}</style>`)
  return html
}
