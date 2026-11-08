// @vitest-environment jsdom
/**
 * The scenario selector's user-visible behaviour: the two-level pick, the
 * composer draft a starter-only pick writes, the session a capability pick
 * opens, and the strip's step arrows.
 *
 * The component receives plain props, so every case drives it directly and
 * asserts what a person sees rather than class names or render counts.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScenarioTabs } from '../src/client/ScenarioTabs.tsx'
import type { ScenarioTabsProps } from '../src/client/ScenarioTabs.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]

/**
 * Render the selector over stubbed composer actions.
 * @param blank - whether the current session is still blank, which is what
 * decides whether a capability pick can plant its starter in place.
 * @returns the recording doubles the assertions read.
 */
function bench(blank = true) {
  const setDraft = vi.fn()
  const startSession = vi.fn()
  render(<ScenarioTabs {...({
    t,
    session: { blank },
    inputActions: { setDraft },
    startSession,
  } as unknown as ScenarioTabsProps)} />)
  return { setDraft, startSession }
}

/** One sub-scenario chip by the visible label the dictionary gives it. */
function chip(label: string): HTMLElement {
  return screen.getByRole('button', { name: label })
}

describe('the two-level scenario selector', () => {
  it('opens on the first scenario and switches rows when another is picked', () => {
    bench()

    expect(screen.getByRole('button', { name: en['scenario.office'] })).toBeTruthy()
    expect(chip(en['office.documents'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: en['code.daily'] })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: en['scenario.code'] }))

    // One sub-scenario row is shown at a time, so the pick replaces it.
    expect(screen.queryByRole('button', { name: en['office.documents'] })).toBeNull()
    expect(chip(en['code.daily'])).toBeTruthy()
  })

  it('writes a starter-only pick into the composer draft and marks the chip', () => {
    const { setDraft, startSession } = bench()

    fireEvent.click(chip(en['office.documents']))

    expect(setDraft).toHaveBeenCalledWith(en['office.documents.template'])
    expect(startSession).not.toHaveBeenCalled()
    expect(chip(en['office.documents']).className).toContain('subPicked')

    fireEvent.click(chip(en['office.analytics']))
    expect(chip(en['office.documents']).className).not.toContain('subPicked')
    expect(chip(en['office.analytics']).className).toContain('subPicked')
  })

  it('opens a session on the sub-scenario preset, seeding the draft it reuses', () => {
    const { setDraft, startSession } = bench(true)

    fireEvent.click(chip(en['office.market']))

    // The blank session is the one the New Session flow reuses, so the starter
    // lands in the composer the user is looking at while the agent changes
    // underneath it.
    expect(setDraft).toHaveBeenCalledWith(en['office.market.template'])
    expect(startSession).toHaveBeenCalledWith('market')
  })

  it('hides the picker in a committed session', () => {
    bench(false)

    expect(screen.queryByRole('button', { name: en['scenario.office'] })).toBeNull()
    expect(screen.queryByRole('button', { name: en['office.market'] })).toBeNull()
  })

  it('steps the sub-scenario strip in both directions', () => {
    bench()
    const strip = screen.getByRole('group', { name: en['sub.group.aria'] })
    const scrollBy = vi.fn()
    Object.assign(strip, { scrollBy })

    fireEvent.click(screen.getByRole('button', { name: en['scroll.next'] }))
    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' })

    fireEvent.click(screen.getByRole('button', { name: en['scroll.prev'] }))
    expect(scrollBy).toHaveBeenCalledWith({ left: -240, behavior: 'smooth' })
  })

  it('reports the active scenario without hiding the others', () => {
    bench()

    expect(screen.getByRole('button', { name: en['scenario.office'] }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: en['scenario.design'] }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: en['scenario.design'] }))

    expect(screen.getByRole('button', { name: en['scenario.design'] }).getAttribute('aria-pressed')).toBe('true')
    expect(chip(en['design.poster'])).toBeTruthy()
  })
})
