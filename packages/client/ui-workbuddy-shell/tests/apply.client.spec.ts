/**
 * The plugin's registrations, and their removal when the plugin goes.
 *
 * The tab registry is real, because "registered" means what it says a type is;
 * the slot and locale faces are recorders, because what matters here is what was
 * handed to them — the capability row and its `main` panel under one id, the
 * results body and title under the type's id — and that every registration is
 * gone after dispose, which is what makes a reload safe.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { CapabilityIcon } from '../src/client/CapabilityIcon.tsx'
import { CapabilityIndex } from '../src/client/CapabilityIndex.tsx'
import { SHELL_ID, SHELL_KIND } from '../src/client/definition.ts'
import { apply, inject } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'
import { apply as hostApply } from '../src/index.ts'
import { ResultsBody } from '../src/client/ResultsBody.tsx'
import { ResultsTitle } from '../src/client/ResultsTitle.tsx'

interface Recorded {
  name: string
  id?: string
  key?: string
  order?: number
  label?: unknown
  locale?: string
  component: unknown
}

async function boot() {
  const ctx = new Context()
  const tabs = new SidebarRightTabRegistry(ctx)
  const registered: Recorded[] = []
  const slots = {
    inject: vi.fn((_name: string, register: () => () => void) => register()),
    register: vi.fn((options: Omit<Recorded, 'component'>, component: unknown) => {
      const entry: Recorded = { ...options, component }
      registered.push(entry)
      return () => { registered.splice(registered.indexOf(entry), 1) }
    }),
  }
  const dictionaries = new Map<string, unknown>()
  const locale = {
    // Copy is the dictionary's contract; the key stands in for the translation.
    bind: vi.fn(() => (key: string) => key),
    register: vi.fn((ns: string, dicts: unknown) => {
      dictionaries.set(ns, dicts)
      return () => { dictionaries.delete(ns) }
    }),
  }
  ctx.provide('sidebarRightTabs', tabs as never)
  ctx.provide('slots', slots as never)
  ctx.provide('locale', locale as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { tabs, registered, dictionaries, fiber }
}

describe('ui-workbuddy-shell apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('registers the results type, its dictionaries, and every seat under the package id', async () => {
    const { tabs, registered, dictionaries } = await boot()
    const definition = tabs.get(SHELL_KIND)
    expect(definition?.id).toBe(SHELL_ID)
    expect(definition?.kind).toBe(SHELL_KIND)
    // The band stays at the registry default and no guide entry is advertised,
    // so a passive index cannot outrank the seeded Files type.
    expect(definition?.priority).toBeUndefined()
    expect(definition?.guide).toBeUndefined()
    expect(definition?.title('sidebar://workbuddy-results')).toBe('results.tab')
    expect(dictionaries.get('workbuddy.shell')).toEqual({ zh, en })

    // The left row and its main body share one id, so the row addresses the
    // panel; the right body and title share the type's id, so the chip and its
    // body dispatch together. The seat key is the id, never the kind.
    expect(registered.map(entry => [entry.name, entry.id ?? entry.key, entry.locale, entry.component])).toEqual([
      ['sidebar.panellist', SHELL_ID, undefined, CapabilityIcon],
      ['main', SHELL_ID, 'workbuddy.shell', CapabilityIndex],
      ['sidebar.right.pane.tab', SHELL_ID, 'workbuddy.shell', ResultsBody],
      ['sidebar.right.pane.tab.title', SHELL_ID, undefined, ResultsTitle],
    ])

    // The sidebar resolves the row's accessible name through the locale thunk.
    const panel = registered[0]!
    expect(panel.order).toBe(20)
    expect((panel.label as () => string)()).toBe('panel.label')
  })

  it('takes every registration back when the plugin is disposed', async () => {
    const { tabs, registered, dictionaries, fiber } = await boot()
    await fiber.dispose()
    expect(tabs.get(SHELL_KIND)).toBeUndefined()
    expect(registered).toEqual([])
    expect(dictionaries.size).toBe(0)
  })
})
