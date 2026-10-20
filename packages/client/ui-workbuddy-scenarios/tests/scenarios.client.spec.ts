/**
 * The scenario taxonomy and the plugin's registrations: the shape every later
 * agent-backed sub-scenario copies, the two dictionary sides saying the same
 * thing, and the selector installed over the composer dock.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as hostApply } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { SCENARIOS, scenarioById } from '../src/client/scenarios.ts'
import { en, zh } from '../src/client/locales.ts'

/** Every sub-scenario across the three scenarios, in row order. */
const SUBS = SCENARIOS.flatMap(scenario => scenario.subs)

describe('the scenario taxonomy', () => {
  it('carries three scenarios with nineteen sub-scenarios between them', () => {
    expect(SCENARIOS.map(scenario => scenario.id)).toEqual(['office', 'code', 'design'])
    expect(SUBS).toHaveLength(19)
    // Every chip is addressable by a unique id inside its own row.
    for (const scenario of SCENARIOS) {
      expect(new Set(scenario.subs.map(sub => sub.id)).size).toBe(scenario.subs.length)
    }
  })

  it('resolves a scenario by id and reports an unknown one', () => {
    expect(scenarioById('code')?.labelKey).toBe('scenario.code')
    expect(scenarioById('nope')).toBeUndefined()
  })

  it('names an agent preset only where a capability backs the pick', () => {
    // Finance, video, and Xiaohongshu are the sub-scenarios whose pick reaches
    // an agent instead of only writing a starter; the other seventeen stay as
    // they were.
    expect(SUBS.filter(sub => sub.presetId !== undefined).map(sub => sub.id)).toEqual(['finance', 'video', 'xhs'])
    expect(SUBS.find(sub => sub.id === 'finance')?.presetId).toBe('finance')
    expect(SUBS.find(sub => sub.id === 'video')?.presetId).toBe('video')
    expect(SUBS.find(sub => sub.id === 'xhs')?.presetId).toBe('xiaohongshu')
  })

  it('carries video generation under the design scenario rather than office', () => {
    // The chip is the same capability wherever it sits, but the row it sits in
    // is what a deployment reads as its home; office must not keep a duplicate.
    expect(scenarioById('office')?.subs.map(sub => sub.id)).not.toContain('video')
    expect(scenarioById('design')?.subs.map(sub => sub.id)).toContain('video')
    expect(scenarioById('design')?.subs.map(sub => sub.id)).toContain('xhs')
  })

  it('keeps slide decks in office alone now that the design row has no deck entry', () => {
    // One capability has one home: the design row's deck-design chip duplicated
    // the office row's deck chip, so the office chip is the survivor and it
    // names the artifact rather than the medium.
    expect(scenarioById('design')?.subs.map(sub => sub.id)).not.toContain('ppt')
    expect(scenarioById('office')?.subs.map(sub => sub.id)).toContain('slides')
    for (const side of [zh, en]) {
      expect(side['office.slides']).toMatch(/PPT|deck/i)
      expect(side).not.toHaveProperty('design.ppt')
      expect(side).not.toHaveProperty('design.ppt.template')
    }
  })

  it('keeps the two dictionaries on the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('states the finance starter as a question rather than as a protocol', () => {
    // The preset owns the routing rules and the tool list, so the starter must
    // not restate them or name a tool the agent does not have.
    for (const side of [zh, en]) {
      const starter = side['office.finance.template']
      expect(starter).not.toContain('sector_theme_query')
      expect(starter).not.toContain('opportunity_radar')
      expect(starter.length).toBeLessThan(100)
    }
  })
})

describe('ui-workbuddy-scenarios apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'uiWorkspace'])
  })

  it('registers the selector over the composer dock and nowhere else', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    locale.setLocale('zh')
    ctx.provide('locale', locale)
    const starts: string[] = []
    ctx.provide('uiWorkspace', {
      startSession: (_workspaceId: unknown, options?: { agentPreset?: string }) => {
        if (options?.agentPreset !== undefined) starts.push(options.agentPreset)
      },
    })
    await ctx.plugin({ inject: [...inject], apply }).await()
    const slots = ctx.get('slots') as SlotRegistry

    slots.register({
      name: 'root',
      children: { conversation: { kind: 'single', scope: 'root' } },
    } as never, () => null)
    slots.register({
      name: 'conversation',
      children: { 'conversation.input.dock': { kind: 'list', scope: 'session' } },
    } as never, () => null)

    const entries = slots.entries('conversation.input.dock')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.options).toMatchObject({ id: 'workbuddy-scenarios', order: 8 })

    // The plugin's own copy reaches the seat through the registration's
    // locale namespace, and the business face forwards to the launcher.
    const face = (entries[0]!.inject as unknown as () => { startSession: (id: string) => void })()
    face.startSession('finance')
    expect(starts).toEqual(['finance'])
    expect(locale.bind('workbuddy.scenarios')('scenario.office')).toBe(zh['scenario.office'])
  })
})
