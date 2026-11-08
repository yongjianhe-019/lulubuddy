/**
 * Ask / Plan / Craft segmented control for the composer's left input strip.
 * Selection derives from the host-computed `plan` and `permissions`
 * projections and submits the same command lines a user could type, so the
 * pushed projection frame is the only confirmation and the control holds no
 * mode state of its own. The seat stays empty while either capability is
 * absent from the composition.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the `plan` and `permissions` SessionProjectionMap merges for useProjection.
import type {} from '@deepseek-ai/dsh-plan-mode/client'
import type {} from '@deepseek-ai/dsh-permission-presets/client'
import { deriveMode, modeCommands, type WorkBuddyMode } from './mode.ts'
import type { ModeKey } from './locales.ts'
import css from './ModeControl.module.css'

/** Injected business face of the composer mode seat. */
export interface ModeControlInjected {
  /**
   * Execute the command lines one selection submits, in order.
   * @param lines - command lines to submit; execution stops at the first failure.
   * @returns null when every line settled; a user-visible failure line otherwise.
   */
  runMode: (lines: readonly string[]) => Promise<string | null>
}

/** Full component props: runtime share + injected verbs + the locale seat. */
export type ModeControlProps =
  PropsRuntime<'conversation.input.left'> & InjectFace<ModeControlInjected> & PropsLocale<'workbuddy.mode'>

/** Mode order and copy keys. */
const OPTIONS: readonly { id: WorkBuddyMode; labelKey: ModeKey; titleKey: ModeKey }[] = [
  { id: 'ask', labelKey: 'mode.ask', titleKey: 'mode.ask.title' },
  { id: 'plan', labelKey: 'mode.plan', titleKey: 'mode.plan.title' },
  { id: 'craft', labelKey: 'mode.craft', titleKey: 'mode.craft.title' },
]

/**
 * Render the collaboration mode control.
 * @param props - composed slot props.
 * @returns the control element tree, or null while a capability is absent.
 */
export function ModeControl({ useProjection, runMode, t }: ModeControlProps) {
  const plan = useProjection('plan')
  const permissions = useProjection('permissions')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const active = deriveMode(plan, permissions)
  if (active === undefined || plan === undefined || permissions === undefined) return null

  const select = (mode: WorkBuddyMode): void => {
    const lines = modeCommands(mode, plan, permissions)
    if (lines.length === 0) return
    setBusy(true)
    setError(null)
    void runMode(lines).then((failure) => {
      if (!aliveRef.current) return
      setBusy(false)
      setError(failure)
    }, (reason: unknown) => {
      if (!aliveRef.current) return
      setBusy(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <span className={css.wrap}>
      <span className={css.group} role="group" aria-label={t('mode.group.aria')}>
        {OPTIONS.map(({ id, labelKey, titleKey }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.option, active === id && css.selected)}
            aria-pressed={active === id}
            title={t(titleKey)}
            disabled={busy}
            onClick={() => { select(id) }}
          >
            {t(labelKey)}
          </button>
        ))}
      </span>
      {error !== null && <span className={css.error} role="status" title={error}>{t('mode.failed')}</span>}
    </span>
  )
}
