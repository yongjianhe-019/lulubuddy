/**
 * The WorkBuddy two-level scenario selector for the composer's input dock.
 *
 * The upper row picks one of three scenarios; the lower row shows that
 * scenario's sub-scenarios behind a horizontally scrolling strip with a step
 * arrow at each end.
 *
 * A pick reaches two things, one per kind of sub-scenario. A starter-only pick
 * writes its prompt starter into the composer draft through the session-scope
 * `inputActions` face. A pick that names an agent preset opens a session
 * composed from that preset through the `agentPresetLaunch` service, because
 * the capability belongs to the agent rather than to the text: the session
 * cannot be a conversation that has already run a turn, so the service stages
 * the preset and starts the New Session flow, which reuses a blank session and
 * creates one otherwise. Nothing is ever sent.
 *
 * A pick is marked on the chip so the click has visible feedback; the mark is
 * local, not durable, because the draft or the session behind it is the durable
 * thing and the user may replace either entirely.
 */
import { useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { IconChevronLeftOutlineMedium, IconChevronRightOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock seat) and
// the session-scope standard kit that carries `inputActions`.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ui-agent-preset client face that declares agentPresetLaunch.
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import { SCENARIOS } from './scenarios.ts'
import type { Scenario, SubScenario } from './scenarios.ts'
import css from './ScenarioTabs.module.css'

/** Full component props: the dock runtime share, the inject face, and the locale seat. */
export type ScenarioTabsProps =
  PropsRuntime<'conversation.input.dock'>
  & InjectFace<ScenarioTabsInjected>
  & PropsLocale<'workbuddy.scenarios'>

/** Registration-side business face of the scenario selector. */
export interface ScenarioTabsInjected {
  /** Open a session whose agent is composed from one preset. */
  startSession: (presetId: string) => void
}

/** One arrow step, in CSS pixels: roughly two chips plus their gap. */
const SCROLL_STEP = 240

/**
 * Render the scenario selector.
 * @param props - composed slot props; the runtime share carries `session` and
 * `inputActions`, the inject face carries `startSession`.
 * @returns the selector element tree.
 */
export function ScenarioTabs({ t, session, inputActions, startSession }: ScenarioTabsProps): ReactNode {
  // The scenario picker belongs to the New Session surface. Once the Session
  // has run a turn, its agent is already chosen and the chips would only
  // compete with the conversation; a new Session brings them back.
  if (!session.blank) return null
  // The selected scenario itself is the state, so no lookup can miss: the
  // only values that can be selected are the declared ones.
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0] as Scenario)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: -1 | 1): void => {
    const strip = stripRef.current
    /* v8 ignore next -- defensive: the arrows render only while the strip is mounted, so a click cannot find a null ref. */
    if (strip === null) return
    strip.scrollBy({ left: direction * SCROLL_STEP, behavior: 'smooth' })
  }

  const pick = (sub: SubScenario): void => {
    setPickedId(sub.id)
    if (sub.presetId === undefined) {
      inputActions.setDraft(t(sub.templateKey))
      return
    }
    // A blank session is both the one allowed to change preset and the one the
    // New Session flow reuses, so the starter lands in the composer the user is
    // looking at. A session that already ran keeps its composition: the flow
    // starts a fresh session, and there the user types their own question.
    if (session.blank) inputActions.setDraft(t(sub.templateKey))
    startSession(sub.presetId)
  }

  return (
    <div className={css.wrap}>
      <div className={css.scenarios} role="group" aria-label={t('scenario.group.aria')}>
        {SCENARIOS.map(candidate => (
          <button
            key={candidate.id}
            type="button"
            className={clsx(css.scenario, candidate.id === scenario.id && css.scenarioActive)}
            aria-pressed={candidate.id === scenario.id}
            data-workbuddy-scenario={candidate.id}
            onClick={() => { setScenario(candidate) }}
          >
            {t(candidate.labelKey)}
          </button>
        ))}
      </div>
      <div className={css.subRow}>
        <button
          type="button"
          className={css.arrow}
          aria-label={t('scroll.prev')}
          onClick={() => { scroll(-1) }}
        >
          <IconChevronLeftOutlineMedium size={12} />
        </button>
        <div className={css.subStrip} ref={stripRef} role="group" aria-label={t('sub.group.aria')}>
          {scenario.subs.map(sub => (
            <button
              key={sub.id}
              type="button"
              className={clsx(css.sub, sub.id === pickedId && css.subPicked)}
              data-workbuddy-sub={sub.id}
              onClick={() => { pick(sub) }}
            >
              {t(sub.labelKey)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={css.arrow}
          aria-label={t('scroll.next')}
          onClick={() => { scroll(1) }}
        >
          <IconChevronRightOutlineMedium size={12} />
        </button>
      </div>
    </div>
  )
}
