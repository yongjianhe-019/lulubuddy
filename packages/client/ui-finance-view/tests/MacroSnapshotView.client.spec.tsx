// @vitest-environment jsdom
/**
 * The macro-snapshot card, driven by the exact tool-output text the host
 * renderer produced from a live `macro_snapshot` run (USD/CNY 6.7521,
 * manufacturing PMI 49.8, CSI 300 PE 12.68, 10-year yield 1.682).
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MacroSnapshotView } from '../src/client/MacroSnapshotView.tsx'
import { zh } from '../src/client/locales.ts'
import type { FinanceViewProps } from '../src/client/parts.tsx'
import { fixtureText, running, settled, type RunningBlock, type SettledBlock } from './fixtures.client.ts'

const t: FinanceViewProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

function props(block: SettledBlock | RunningBlock): FinanceViewProps {
  return {
    callId: 'call-finance',
    toolName: 'macro_snapshot',
    block,
    openFile: vi.fn(),
    t,
  } as unknown as FinanceViewProps
}

const doc = (body: string): SettledBlock => settled(`\`\`\`json\n${body}\n\`\`\``)

describe('macro card over the measured document', () => {
  it('renders the real latest facts with localized labels', () => {
    const view = render(<MacroSnapshotView {...props(settled(fixtureText('macroSnapshot')))} />)
    expect(view.container.textContent).toContain('宏观快照')
    expect(view.container.textContent).toContain('美元/人民币')
    expect(view.container.textContent).toContain('6.7521')
    expect(view.container.textContent).toContain('制造业PMI')
    expect(view.container.textContent).toContain('49.8')
    expect(view.container.textContent).toContain('2026-09-18')
    expect(view.container.textContent).toContain('6 行')
  })

  it('renders the valuation and bond-yield rows with their dates', () => {
    const view = render(<MacroSnapshotView {...props(settled(fixtureText('macroSnapshot')))} />)
    expect(view.container.textContent).toContain('估值')
    expect(view.container.textContent).toContain('12.68')
    expect(view.container.textContent).toContain('十年国债收益率')
    expect(view.container.textContent).toContain('1.682')
  })
})

describe('degenerate documents', () => {
  it('keeps an unknown macro key verbatim and omits absent sections', () => {
    const view = render(<MacroSnapshotView {...props(doc('{"latest":{"mystery_fact":1}}'))} />)
    expect(view.container.textContent).toContain('mystery_fact')
    expect(view.container.textContent).not.toContain('历史行数')
    expect(view.container.textContent).not.toContain('估值')
    expect(view.container.textContent).not.toContain('十年国债收益率')
  })

  it('renders a dated row and an undated row, and counts an empty history', () => {
    const view = render(<MacroSnapshotView {...props(doc(
      '{"as_of":"2026-01-02T00:00:00","latest":{"a":1},"recent":[],"valuation":[{"date":"2026-01-02T00:00:00","pe":1},{"pb":2}],"bond_yield_10y":[{"yield_10y":3}]}',
    ))} />)
    expect(view.container.textContent).toContain('0 行')
    expect(view.container.textContent).toContain('2026-01-02')
    expect(view.container.textContent).toContain('PB')
    expect(view.container.textContent).toContain('收益率')
  })

  it('surfaces warnings', () => {
    const text = 'Data warnings:\n- gold_price coverage 31%\n\n```json\n{"latest":{"a":1}}\n```'
    const view = render(<MacroSnapshotView {...props(settled(text))} />)
    expect(screen.getByText('数据警告')).toBeTruthy()
    expect(view.container.textContent).toContain('gold_price coverage 31%')
  })
})

describe('fallbacks', () => {
  it('keeps the running card plain', () => {
    const view = render(<MacroSnapshotView {...props(running('macro_snapshot'))} />)
    expect(view.container.textContent).toContain('分析运行中')
  })

  it('renders an unrecognized result as text', () => {
    const view = render(<MacroSnapshotView {...props(settled('boom'))} />)
    expect(view.container.querySelector('pre')?.textContent).toBe('boom')
    cleanup()
    const unrelated = render(<MacroSnapshotView {...props(doc('{"unrelated":1}'))} />)
    expect(unrelated.container.querySelector('pre')?.textContent).toContain('unrelated')
  })
})
