/**
 * Body of the right results-area tab, registered into the keyed
 * `sidebar.right.pane.tab` seat under the tab type's id. It draws the same
 * read-only index as the left navigation: each WorkBuddy results surface paired
 * with what DSH has for it. Nothing here opens, refreshes, or shares anything —
 * DSH has no write path for any of these surfaces, so a row is a statement.
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar-right SlotMap merge (the keyed tab-body seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { RESULT_ROWS } from './index-data.ts'
import { IndexPanel } from './IndexPanel.tsx'

/** Full component props: the tab-body runtime share plus the locale seat. */
export type ResultsBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'workbuddy.shell'>

/**
 * Render the results-area index.
 * @param props - composed slot props; only the locale seat carries data.
 * @returns the results index element tree.
 */
export function ResultsBody({ t }: ResultsBodyProps): ReactNode {
  return <IndexPanel t={t} titleKey="results.title" leadKey="results.lead" rows={RESULT_ROWS} />
}
