/**
 * Pure derivation of the WorkBuddy collaboration mode from the two
 * host-computed projections. The control owns no mode state of its own: the
 * `plan` projection is the logged plan-mode state and the `permissions`
 * projection is the effective preset, so what renders is always what the Host
 * has already committed.
 */
import type { PermissionSelection } from '@deepseek-ai/dsh-permission-presets/client'
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'

/** The three WorkBuddy collaboration modes, in display order. */
export const WORKBUDDY_MODES = ['ask', 'plan', 'craft'] as const

/** One selectable collaboration mode. */
export type WorkBuddyMode = typeof WORKBUDDY_MODES[number]

/** Preset that answers without touching the workspace (`Ask`). */
export const READ_ONLY_PRESET = 'read-only'

/** Preset a `Craft` selection falls back to when `Ask` had restricted writes. */
export const WRITE_PRESET = 'workspace-write'

/** The plan-mode state a selection targets, folding the pending selection the way the Host will. */
function planTarget(plan: PlanProjection): boolean {
  return plan.pending ? !plan.active : plan.active
}

/**
 * Derive the active mode from the two projections. Plan wins over the
 * permission preset because plan mode is the stronger constraint: it holds the
 * model in review regardless of sandbox. A read-only preset with plan mode off
 * is `Ask`; anything else that can write is `Craft`.
 * @param plan - the session's plan projection, or undefined when plan mode is not composed.
 * @param permissions - the session's permission select, or undefined when the permission service is not composed.
 * @returns the active mode, or undefined while either capability is absent (the control hides).
 */
export function deriveMode(
  plan: PlanProjection | undefined,
  permissions: PermissionSelection | undefined,
): WorkBuddyMode | undefined {
  if (plan === undefined || permissions === undefined) return undefined
  if (planTarget(plan)) return 'plan'
  return permissions.currentValue === READ_ONLY_PRESET ? 'ask' : 'craft'
}

/**
 * The command lines one mode selection submits, in order. A selection that
 * already holds submits nothing, so a click on the active mode is inert.
 *
 * `Craft` lifts a read-only restriction instead of forcing a write preset, so
 * a deliberate wider preset (for example full access) survives a round trip
 * through `Ask`.
 * @param mode - the selected mode.
 * @param plan - the session's plan projection.
 * @param permissions - the session's permission select.
 * @returns the command lines to execute, possibly empty.
 */
export function modeCommands(
  mode: WorkBuddyMode,
  plan: PlanProjection,
  permissions: PermissionSelection,
): string[] {
  const leavingPlan = planTarget(plan) ? ['/plan off'] : []
  const restricted = permissions.currentValue === READ_ONLY_PRESET
  switch (mode) {
    case 'plan':
      return planTarget(plan) ? [] : ['/plan']
    case 'ask':
      return [...leavingPlan, ...restricted ? [] : [`/permission ${READ_ONLY_PRESET}`]]
    case 'craft':
      return [...leavingPlan, ...restricted ? [`/permission ${WRITE_PRESET}`] : []]
  }
}
