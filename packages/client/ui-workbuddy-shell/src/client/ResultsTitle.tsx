/**
 * The results tab type's chip title: the index glyph before the tab's title.
 * Registered under `sidebar.right.pane.tab.title`; without it the chip would
 * show the bare label. The index body draws its own rows and never this glyph.
 */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconListPenOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-sidebar-right SlotMap merge (the keyed tab-title seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import css from './ResultsTitle.module.css'

/**
 * The title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the index glyph followed by the tab's title text.
 */
export function ResultsTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <IconListPenOutlineMedium className={css.titleIcon} />
      {tab.title}
    </>
  )
}
