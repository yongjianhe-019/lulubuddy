// @vitest-environment jsdom
/** The capability row's glyph: drawn at the sidebar's requested size and marked while the panel is selected. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CapabilityIcon } from '../src/client/CapabilityIcon.tsx'

afterEach(cleanup)

function props(size: number, active: boolean): PropsRuntime<'sidebar.panellist'> {
  return ({ size, active } as unknown) as PropsRuntime<'sidebar.panellist'>
}

const classOf = (container: HTMLElement): string | null => container.querySelector('svg')?.getAttribute('class') ?? null

describe('CapabilityIcon', () => {
  it('draws the glyph at the requested size', () => {
    const { container } = render(<CapabilityIcon {...props(18, false)} />)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('18')
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('18')
  })

  it('marks the glyph while the panel is selected', () => {
    const idle = render(<CapabilityIcon {...props(16, false)} />)
    const selected = render(<CapabilityIcon {...props(16, true)} />)
    expect(classOf(idle.container)).not.toBe(classOf(selected.container))
  })
})
