// @vitest-environment jsdom
/**
 * ModeControl over the `plan` and `permissions` projections: nothing renders
 * while either capability is absent, the active option follows the projections
 * only, and a click submits the derived command lines through the injected
 * face and stays busy until it settles.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { PermissionSelection } from '@deepseek-ai/dsh-permission-presets/client'
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'
import { ModeControl, type ModeControlProps } from '../src/client/ModeControl.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

// The framework-injected t seat, stubbed over the zh dictionaries.
const t: ModeControlProps['t'] = makeTranslate(zh, commonZh)

function setup(
  plan: PlanProjection | undefined,
  permissions: PermissionSelection | undefined,
  runMode = vi.fn(() => Promise.resolve<string | null>(null)),
) {
  const planStore = createSnapshotStore<{ value: PlanProjection | undefined }>({ value: plan })
  const permStore = createSnapshotStore<{ value: PermissionSelection | undefined }>({ value: permissions })
  // The two seats carry different projection types, so the fake dispatches on
  // the key rather than holding them in one homogeneous record.
  const useProjection = (key: string, selector?: (value: unknown) => unknown) => {
    const bound = bindSnapshotSelector((key === 'plan' ? planStore : permStore) as never)
    return (bound as (pick: (state: { value: unknown }) => unknown) => unknown)(s => (selector ?? (value => value))(s.value))
  }
  const props = { useProjection, runMode, t } as unknown as ModeControlProps
  const view = render(<ModeControl {...props} />)
  return { planStore, permStore, runMode, view }
}

const option = (name: string) => screen.getByRole('button', { name })
const pressed = (name: string): string | null => option(name).getAttribute('aria-pressed')

const WRITE: PermissionSelection = { currentValue: 'workspace-write' }
const READ: PermissionSelection = { currentValue: 'read-only' }
const OFF: PlanProjection = { active: false, pending: false }
const ON: PlanProjection = { active: true, pending: false }

describe('ModeControl', () => {
  it('renders nothing while either capability is absent', () => {
    const absent = setup(undefined, WRITE)
    expect(absent.view.container.innerHTML).toBe('')
    cleanup()
    const noPermissions = setup(OFF, undefined)
    expect(noPermissions.view.container.innerHTML).toBe('')
  })

  it('renders the group labelled from the locale seat and marks the derived mode', () => {
    setup(ON, WRITE)
    expect(screen.getByRole('group', { name: '协作模式' })).toBeDefined()
    expect(pressed('Plan')).toBe('true')
    expect(pressed('Ask')).toBe('false')
    expect(pressed('Craft')).toBe('false')
    expect(option('Craft').getAttribute('title')).toBe('你说我做：立即执行并交付')
  })

  it('marks Ask for a read-only preset with plan mode off', () => {
    setup(OFF, READ)
    expect(pressed('Ask')).toBe('true')
  })

  it('submits the derived lines and keeps selection on the projection until it confirms', async () => {
    let settle!: (value: string | null) => void
    const runMode = vi.fn(() => new Promise<string | null>((done) => { settle = done }))
    const { planStore, permStore } = setup(OFF, WRITE, runMode)

    fireEvent.click(option('Plan'))
    expect(runMode).toHaveBeenCalledWith(['/plan'])
    // Busy: every option is disabled while the command is in flight.
    expect((option('Plan') as HTMLButtonElement).disabled).toBe(true)
    // No client optimism: selection still follows the projections.
    expect(pressed('Craft')).toBe('true')

    planStore.set({ value: ON })
    await waitFor(() => { expect(pressed('Plan')).toBe('true') })
    settle(null)
    await waitFor(() => { expect((option('Plan') as HTMLButtonElement).disabled).toBe(false) })
    void permStore
  })

  it('is inert when the selection already holds', () => {
    const { runMode } = setup(ON, WRITE)
    fireEvent.click(option('Plan'))
    expect(runMode).not.toHaveBeenCalled()
  })

  it('surfaces an admitted failure line without changing the selection', async () => {
    const runMode = vi.fn(() => Promise.resolve('boom (E_FAIL)'))
    setup(OFF, WRITE, runMode)
    fireEvent.click(option('Ask'))
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('模式切换失败') })
    expect(screen.getByRole('status').getAttribute('title')).toBe('boom (E_FAIL)')
    expect(pressed('Craft')).toBe('true')
  })

  it('surfaces a rejected promise as an error line', async () => {
    const runMode = vi.fn(() => Promise.reject(new Error('transport down')))
    setup(OFF, WRITE, runMode)
    fireEvent.click(option('Ask'))
    await waitFor(() => { expect(screen.getByRole('status').getAttribute('title')).toBe('transport down') })
  })

  it('stringifies a non-Error rejection', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a non-Error rejection is the input this case exists to exercise.
    const runMode = vi.fn(() => Promise.reject('plain string'))
    setup(OFF, WRITE, runMode)
    fireEvent.click(option('Ask'))
    await waitFor(() => { expect(screen.getByRole('status').getAttribute('title')).toBe('plain string') })
  })

  it('drops a settlement that arrives after unmount', async () => {
    let settle!: (value: string | null) => void
    const runMode = vi.fn(() => new Promise<string | null>((done) => { settle = done }))
    const { view } = setup(OFF, WRITE, runMode)
    fireEvent.click(option('Ask'))
    view.unmount()
    settle('late failure')
    await Promise.resolve()
    expect(runMode).toHaveBeenCalledTimes(1)
  })

  it('drops a rejection that arrives after unmount', async () => {
    let fail!: (reason: unknown) => void
    const runMode = vi.fn(() => new Promise<string | null>((_done, reject) => { fail = reject }))
    const { view } = setup(OFF, WRITE, runMode)
    fireEvent.click(option('Ask'))
    view.unmount()
    fail(new Error('late'))
    await Promise.resolve()
    expect(runMode).toHaveBeenCalledTimes(1)
  })
})
