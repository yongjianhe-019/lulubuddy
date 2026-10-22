/**
 * The WorkBuddy scenario taxonomy: three scenarios, each with its own row of
 * sub-scenarios. The data is flat on purpose — labels and prompt starters live
 * in the locale dictionaries, so this module carries only identity and shape.
 *
 * A sub-scenario pick does one of two things. One that names no `presetId` seeds
 * its prompt starter into the composer draft, which was the surface's whole
 * behaviour. One that names a `presetId` opens a session whose agent is composed
 * from that preset instead: the starter still rides along as the question to ask
 * that agent, while the capability behind the pick is the preset's tools and
 * instructions rather than the text.
 */
import type { ScenarioKey } from './locales.ts'

/** One pickable sub-scenario under a scenario. */
export interface SubScenario {
  /** Stable identity, unique within its scenario. */
  readonly id: string
  /** Locale key for the sub-scenario's chip label. */
  readonly labelKey: ScenarioKey
  /** Locale key for the prompt starter a pick writes into the draft. */
  readonly templateKey: ScenarioKey
  /**
   * Agent preset a pick opens a session on, absent for a starter-only pick.
   * Naming one is how a sub-scenario states the capability it stands for; the
   * preset itself owns the tools and instructions behind that capability.
   */
  readonly presetId?: string
}

/** One scenario and its sub-scenario row. */
export interface Scenario {
  /** Stable identity, and the `data-workbuddy-scenario` value the specs key on. */
  readonly id: string
  /** Locale key for the scenario tab's label. */
  readonly labelKey: ScenarioKey
  /** Sub-scenarios in WorkBuddy's own order. */
  readonly subs: readonly SubScenario[]
}

/** The three scenarios and their sub-scenario rows. */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'office',
    labelKey: 'scenario.office',
    subs: [
      { id: 'documents', labelKey: 'office.documents', templateKey: 'office.documents.template' },
      {
        id: 'finance',
        labelKey: 'office.finance',
        templateKey: 'office.finance.template',
        presetId: 'finance',
      },
      { id: 'analytics', labelKey: 'office.analytics', templateKey: 'office.analytics.template' },
      { id: 'workbench', labelKey: 'office.workbench', templateKey: 'office.workbench.template' },
      {
        id: 'slides',
        labelKey: 'office.slides',
        templateKey: 'office.slides.template',
        presetId: 'ppt',
      },
      { id: 'research', labelKey: 'office.research', templateKey: 'office.research.template' },
    ],
  },
  {
    id: 'code',
    labelKey: 'scenario.code',
    subs: [
      { id: 'daily', labelKey: 'code.daily', templateKey: 'code.daily.template' },
      { id: 'website', labelKey: 'code.website', templateKey: 'code.website.template' },
      { id: 'agent', labelKey: 'code.agent', templateKey: 'code.agent.template' },
      { id: 'skill', labelKey: 'code.skill', templateKey: 'code.skill.template' },
      { id: 'cicd', labelKey: 'code.cicd', templateKey: 'code.cicd.template' },
      { id: 'docs', labelKey: 'code.docs', templateKey: 'code.docs.template' },
    ],
  },
  {
    id: 'design',
    labelKey: 'scenario.design',
    subs: [
      { id: 'web', labelKey: 'design.web', templateKey: 'design.web.template' },
      { id: 'poster', labelKey: 'design.poster', templateKey: 'design.poster.template' },
      {
        id: 'video',
        labelKey: 'design.video',
        templateKey: 'design.video.template',
        presetId: 'video',
      },
      {
        id: 'xhs',
        labelKey: 'design.xhs',
        templateKey: 'design.xhs.template',
        presetId: 'xiaohongshu',
      },
      { id: 'mobile', labelKey: 'design.mobile', templateKey: 'design.mobile.template' },
      { id: 'system', labelKey: 'design.system', templateKey: 'design.system.template' },
      { id: 'brand', labelKey: 'design.brand', templateKey: 'design.brand.template' },
    ],
  },
]

/**
 * Resolve one scenario by id.
 * @param id - scenario identity.
 * @returns the scenario, or undefined for an unknown id.
 */
export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find(scenario => scenario.id === id)
}
