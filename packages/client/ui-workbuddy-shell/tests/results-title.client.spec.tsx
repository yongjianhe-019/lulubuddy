// @vitest-environment jsdom
/** The results tab's chip title: the index glyph, then the type's label. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ResultsTitle } from '../src/client/ResultsTitle.tsx'

afterEach(cleanup)

function props(title: string): PropsRuntime<'sidebar.right.pane.tab.title'> {
  return ({ useTabInfo: () => ({ tab: { title } }) } as unknown) as PropsRuntime<'sidebar.right.pane.tab.title'>
}

describe('ResultsTitle', () => {
  it('draws the index glyph before the title text, sized to the chip line', () => {
    const { container } = render(<ResultsTitle {...props('WorkBuddy 结果区')} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(container.textContent).toBe('WorkBuddy 结果区')
  })
})
