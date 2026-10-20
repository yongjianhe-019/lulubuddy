/**
 * WorkBuddy scenario plugin, browser half: the two-level scenario selector in
 * the composer's input dock.
 *
 * Most picks write a prompt starter into the composer through the session-scope
 * `inputActions` face, which needs no service of its own: `setDraft` is the
 * documented programmatic-write entry, so those picks add no session state and
 * no model-visible input beyond the starter the user chose to put in the draft.
 * A pick that stands for a whole capability reaches the agent instead: the
 * `agentPresetLaunch` service opens a session composed from the named preset, so
 * that sub-scenario's tools and instructions arrive with the session rather than
 * as text the user would have to be trusted to send.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the Workspace UI navigation service merge (ctx.uiWorkspace).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ScenarioTabs } from './ScenarioTabs.tsx'
import type { ScenarioTabsInjected } from './ScenarioTabs.tsx'
import { en, zh, type ScenarioKey } from './locales.ts'

export type { ScenarioTabsInjected, ScenarioTabsProps } from './ScenarioTabs.tsx'
export type { Scenario, SubScenario } from './scenarios.ts'
export { SCENARIOS, scenarioById } from './scenarios.ts'
export type { ScenarioKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer scenario selector's copy. */
    'workbuddy.scenarios': ScenarioKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'workbuddy.scenarios'

/**
 * Required services: the seat's slot registry, the locale registry, and the
 * preset launcher a capability pick opens its session through.
 */
export const inject = ['slots', 'locale', 'uiWorkspace']

/**
 * Client plugin body: register the scenario selector over the input dock.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbuddy-scenarios: dictionaries')

  const injected = (): ScenarioTabsInjected => ({
    startSession: (presetId: string) => {
      ctx.uiWorkspace.startSession(undefined, { clearPreviousDraft: false, agentPreset: presetId })
    },
  })

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'workbuddy-scenarios',
    order: 8,
    locale: NS,
    inject: injected,
  }, ScenarioTabs))
}
