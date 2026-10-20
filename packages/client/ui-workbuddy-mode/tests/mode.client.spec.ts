/** Pure mode derivation and the command lines each selection submits. */
import { describe, expect, it } from 'vitest'
import type { PermissionSelection } from '@deepseek-ai/dsh-permission-presets/client'
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'
import { deriveMode, modeCommands, READ_ONLY_PRESET, WRITE_PRESET } from '../src/client/mode.ts'

const OFF: PlanProjection = { active: false, pending: false }
const ON: PlanProjection = { active: true, pending: false }
const ENTERING: PlanProjection = { active: false, pending: true }
const LEAVING: PlanProjection = { active: true, pending: true }

const presets = (currentValue: string): PermissionSelection => ({ currentValue })

describe('deriveMode', () => {
  it('hides the control while either capability is absent', () => {
    expect(deriveMode(undefined, presets('workspace-write'))).toBeUndefined()
    expect(deriveMode(OFF, undefined)).toBeUndefined()
  })

  it('folds a pending plan selection the way the Host will', () => {
    expect(deriveMode(ON, presets('workspace-write'))).toBe('plan')
    expect(deriveMode(ENTERING, presets('workspace-write'))).toBe('plan')
    expect(deriveMode(LEAVING, presets('workspace-write'))).toBe('craft')
  })

  it('reads plan mode as stronger than the permission preset', () => {
    expect(deriveMode(ON, presets(READ_ONLY_PRESET))).toBe('plan')
  })

  it('reads a read-only preset as Ask and anything else as Craft', () => {
    expect(deriveMode(OFF, presets(READ_ONLY_PRESET))).toBe('ask')
    expect(deriveMode(OFF, presets('workspace-write'))).toBe('craft')
    expect(deriveMode(OFF, presets('danger-full-access'))).toBe('craft')
    expect(deriveMode(OFF, presets('custom'))).toBe('craft')
  })
})

describe('modeCommands', () => {
  it('enters plan mode only from off, and is inert once pending', () => {
    expect(modeCommands('plan', OFF, presets('workspace-write'))).toEqual(['/plan'])
    expect(modeCommands('plan', ON, presets('workspace-write'))).toEqual([])
    expect(modeCommands('plan', ENTERING, presets('workspace-write'))).toEqual([])
  })

  it('Ask leaves plan mode and restricts writes, and is inert once held', () => {
    expect(modeCommands('ask', ON, presets('workspace-write'))).toEqual(['/plan off', `/permission ${READ_ONLY_PRESET}`])
    expect(modeCommands('ask', OFF, presets('workspace-write'))).toEqual([`/permission ${READ_ONLY_PRESET}`])
    expect(modeCommands('ask', OFF, presets(READ_ONLY_PRESET))).toEqual([])
  })

  it('Craft lifts a read-only restriction instead of forcing a write preset', () => {
    expect(modeCommands('craft', OFF, presets(READ_ONLY_PRESET))).toEqual([`/permission ${WRITE_PRESET}`])
    expect(modeCommands('craft', ON, presets(READ_ONLY_PRESET))).toEqual(['/plan off', `/permission ${WRITE_PRESET}`])
  })

  it('Craft leaves a wider preset untouched', () => {
    expect(modeCommands('craft', OFF, presets('danger-full-access'))).toEqual([])
    expect(modeCommands('craft', OFF, presets('workspace-write'))).toEqual([])
  })
})
