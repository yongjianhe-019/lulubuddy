// @vitest-environment jsdom
/** The results tab body: the WorkBuddy results surfaces paired with what DSH has, read-only. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh } from '../src/client/locales.ts'
import { ResultsBody } from '../src/client/ResultsBody.tsx'
import type { ResultsBodyProps } from '../src/client/ResultsBody.tsx'

afterEach(cleanup)

function props(): ResultsBodyProps {
  return ({ t: makeTranslate(zh) } as unknown) as ResultsBodyProps
}

describe('ResultsBody', () => {
  it('states each results surface and what DSH has for it', () => {
    const { container } = render(<ResultsBody {...props()} />)
    expect(container.querySelector('h2')?.textContent).toBe('结果区索引')
    expect([...container.querySelectorAll('li')].map(row => row.getAttribute('data-workbuddy-row')))
      .toEqual(['changes', 'preview', 'share'])
    const changes = container.querySelector('[data-workbuddy-row="changes"]')!
    expect(changes.textContent).toBe('变更记录DSH 没有独立的变更记录面板；文件改动以会话内的工具行与交付行呈现。')
    const preview = container.querySelector('[data-workbuddy-row="preview"]')!
    expect(preview.textContent).toBe('浏览器预览DSH 没有内置浏览器；右侧栏的文档预览可以只读渲染 HTML 文件。')
  })

  it('states plainly that sharing has no DSH counterpart', () => {
    const { container } = render(<ResultsBody {...props()} />)
    expect(container.querySelector('[data-workbuddy-row="share"]')?.textContent).toBe('分享DSH 没有对应能力。无对应能力')
  })
})
