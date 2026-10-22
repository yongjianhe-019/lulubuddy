import { describe, expect, it } from 'vitest'
import { renderDeck } from '../src/render.ts'
import type { PptDeck } from '../src/types.ts'

const deck: PptDeck = {
  title: 'Quarterly review',
  theme: 'orange',
  slides: [
    { layout: 'cover', title: 'A quarter in one line', kicker: 'REVIEW', lead: 'The conclusion first.', source: 'Source: internal' },
    { layout: 'kpi', title: 'Four numbers', metrics: [
      { value: '67%', label: 'ONE', size: 4 },
      { value: '54%', label: 'TWO' },
      { value: '61%', label: 'THREE' },
      { value: '130%', label: 'FOUR', size: 4 },
    ] },
    { layout: 'compare', title: 'Two curves', left: { tag: 'LEFT', value: '-27.8%', bullets: ['one'] }, right: { tag: 'RIGHT', value: '+61.4%', bullets: ['two'] } },
    { layout: 'bars', title: 'Five rates', bars: [67, 65, 64, 60, 54].map((value, i) => ({ label: `Row ${String(i + 1)}`, value })) },
    { layout: 'timeline', title: 'Five steps', steps: ['Apr', 'May', 'Jul', 'Aug', 'Sep'].map(label => ({ label })) },
    { layout: 'layers', title: 'Three layers', layers: [
      { tag: 'LAYER 01', title: 'One', description: 'First.' },
      { tag: 'LAYER 02', title: 'Two', description: 'Second.' },
      { tag: 'LAYER 03', title: 'Three', description: 'Third.' },
    ] },
    { layout: 'closing', title: 'One thing to keep', takeaways: [
      { title: 'One', description: 'First.' },
      { title: 'Two', description: 'Second.' },
      { title: 'Three', description: 'Third.' },
    ] },
  ],
}

describe('renderDeck', () => {
  it('renders every named layout into one complete deck', () => {
    const html = renderDeck(deck)
    expect(html).toContain('<title>Quarterly review</title>')
    expect(html).toContain('data-layout="SWISS-COVER-ASCII"')
    expect(html).toContain('data-layout="S06"')
    expect(html).toContain('data-layout="S08"')
    expect(html).toContain('data-layout="S07"')
    expect(html).toContain('data-layout="S11"')
    expect(html).toContain('data-layout="S05"')
    expect(html).toContain('data-layout="S10"')
    expect(html).toContain('--accent:#FF6B35;')
    expect(html).not.toContain('[必填]')
    expect(html.match(/data-slide-id=/gu)?.length).toBe(7)
  })

  it('rejects a layout whose data shape is wrong', () => {
    expect(() => renderDeck({ ...deck, slides: [deck.slides[0]!, { layout: 'kpi', title: 'Only one', metrics: [{ value: '1', label: 'one' }] }, deck.slides[2]!, deck.slides[3]!, deck.slides[4]!] })).toThrow(/exactly 4 metrics/u)
  })
})
