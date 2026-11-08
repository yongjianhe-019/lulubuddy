// @vitest-environment jsdom
/** The left panel's capability index: WorkBuddy's capabilities paired with their DSH backing, in the layout's main seat. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { CapabilityIndex } from '../src/client/CapabilityIndex.tsx'
import type { CapabilityIndexProps } from '../src/client/CapabilityIndex.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

function props(): CapabilityIndexProps {
  return ({ t: makeTranslate(zh) } as unknown) as CapabilityIndexProps
}

describe('CapabilityIndex', () => {
  it('states every WorkBuddy capability and what backs it', () => {
    const { container } = render(<CapabilityIndex {...props()} />)
    expect(container.querySelector('h2')?.textContent).toBe('能力索引')
    expect([...container.querySelectorAll('li')].map(row => row.getAttribute('data-workbuddy-row')))
      .toEqual(['experts', 'skills', 'automation', 'connectors', 'memory'])
    const experts = container.querySelector('[data-workbuddy-row="experts"]')!
    expect(experts.textContent).toBe('专家中心由 packages/subagent 与 Agent 预设提供。')
    const skills = container.querySelector('[data-workbuddy-row="skills"]')!
    expect(skills.textContent).toBe('技能市场由 packages/skill 提供文件系统发现；DSH 没有市场界面。')
    const automation = container.querySelector('[data-workbuddy-row="automation"]')!
    expect(automation.textContent).toBe('自动化由 packages/schedule 提供能力；DSH 没有写入界面。')
  })

  it('states plainly that memory has no DSH counterpart', () => {
    const { container } = render(<CapabilityIndex {...props()} />)
    const memory = container.querySelector('[data-workbuddy-row="memory"]')!
    expect(memory.textContent).toBe('记忆DSH 没有对应能力。无对应能力')
  })
})
