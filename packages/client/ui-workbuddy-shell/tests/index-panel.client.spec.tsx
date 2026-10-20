// @vitest-environment jsdom
/**
 * The shared index panel: a heading, a lead, one informational row per surface,
 * and the marker on a surface DSH does not have. Rows are list items, never
 * buttons — nothing here could act.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { IndexRow } from '../src/client/index-data.ts'
import { IndexPanel } from '../src/client/IndexPanel.tsx'
import type { IndexPanelProps } from '../src/client/IndexPanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: IndexPanelProps['t'] = makeTranslate(zh)
const ROWS: readonly IndexRow[] = [
  { id: 'backed', nameKey: 'cap.connectors.name', backingKey: 'cap.connectors.backing' },
  { id: 'absent', nameKey: 'cap.memory.name', backingKey: 'cap.memory.backing', absent: true },
]

function mount(rows: readonly IndexRow[] = ROWS) {
  return render(<IndexPanel t={t} titleKey="capability.title" leadKey="capability.lead" rows={rows} />)
}

describe('IndexPanel', () => {
  it('states the heading, the lead, and one row per surface in order', () => {
    const { container } = mount()
    expect(container.querySelector('h2')?.textContent).toBe('能力索引')
    expect(container.querySelector('p')?.textContent).toBe(
      'WorkBuddy 的每一项能力，以及它在 DSH 中对应的能力；DSH 没有对应能力的会明确标出。')
    expect([...container.querySelectorAll('li')].map(row => row.getAttribute('data-workbuddy-row')))
      .toEqual(['backed', 'absent'])
    expect(container.querySelector('[data-workbuddy-row="backed"]')?.textContent)
      .toBe('连接器由 packages/mcp 提供。')
  })

  it('marks a surface DSH has no counterpart for, and only that one', () => {
    const { container } = mount()
    const backed = container.querySelector('[data-workbuddy-row="backed"]')!
    const absent = container.querySelector('[data-workbuddy-row="absent"]')!
    expect(backed.querySelector('span:last-child')?.textContent).toBe('由 packages/mcp 提供。')
    expect(absent.querySelector('span:last-child')?.textContent).toBe('无对应能力')
    expect(absent.textContent).toBe('记忆DSH 没有对应能力。无对应能力')
  })

  it('renders no rows for an empty index', () => {
    const { container } = mount([])
    expect(container.querySelectorAll('li')).toHaveLength(0)
    expect(container.querySelector('[data-workbuddy-index]')).not.toBeNull()
  })
})
