/**
 * WorkBuddy shell plugin, browser half. Two read-only index surfaces replicate
 * where WorkBuddy's office shell points at capabilities:
 *
 * - The left navigation: one `sidebar.panellist` row whose id addresses a
 *   capability index in the layout's root-scoped keyed `main` slot.
 * - The right results area: one tab type in `ctx.sidebarRightTabs`, with its
 *   body and chip title in the keyed `sidebar.right.pane.tab` and
 *   `sidebar.right.pane.tab.title` seats.
 *
 * Both surfaces state facts only. Every WorkBuddy capability named here is
 * either backed by an existing DSH package or has no counterpart, and neither
 * case has a DSH write path this plugin could offer as a control.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-layout SlotMap merge (the root-scoped keyed 'main' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-sidebar SlotMap merge (the sidebar.panellist seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the tab registry service and both keyed tab seats.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { CapabilityIcon } from './CapabilityIcon.tsx'
import { CapabilityIndex } from './CapabilityIndex.tsx'
import { SHELL_ID, shellDefinition } from './definition.ts'
import { en, zh } from './locales.ts'
import { ResultsBody } from './ResultsBody.tsx'
import { ResultsTitle } from './ResultsTitle.tsx'

export type { CapabilityIndexProps } from './CapabilityIndex.tsx'
export type { ResultsBodyProps } from './ResultsBody.tsx'
export type { WorkBuddyShellKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'workbuddy.shell'

/** Ascending position of the capability row among the sidebar's global panels. */
const PANEL_ORDER = 20

/** Required services: the slot registry, the locale registry, and the tab registry. */
export const inject = ['slots', 'locale', 'sidebarRightTabs']

/**
 * Client plugin body: register the dictionaries, the results tab type, the
 * capability navigation row and its main panel, and the tab body and title.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbuddy-shell: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register(shellDefinition(t)), 'ui-workbuddy-shell: results type')

  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: SHELL_ID,
    order: PANEL_ORDER,
    label: () => t('panel.label'),
  }, CapabilityIcon)), 'ui-workbuddy-shell: capability row')

  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: SHELL_ID,
    locale: NS,
  }, CapabilityIndex)), 'ui-workbuddy-shell: capability panel')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: SHELL_ID, locale: NS },
    ResultsBody,
  )), 'ui-workbuddy-shell: results tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: SHELL_ID },
    ResultsTitle,
  )), 'ui-workbuddy-shell: results tab title')
}
