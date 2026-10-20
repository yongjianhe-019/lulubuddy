/**
 * The one read-only index panel both WorkBuddy shell surfaces draw: a heading,
 * a one-line lead, and one informational row per WorkBuddy surface. A row is a
 * statement, so it is a list item and never a button — no surface here has a DSH
 * write path a click could reach.
 */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { IndexRow } from './index-data.ts'
import type { WorkBuddyShellKey } from './locales.ts'
import css from './IndexPanel.module.css'

/** Plain props of the shared index panel; each surface supplies its own copy. */
export interface IndexPanelProps {
  /** Namespace-bound translate, read fresh on every label call. */
  readonly t: TranslateNS<'workbuddy.shell'>
  /** Locale key of the panel heading. */
  readonly titleKey: WorkBuddyShellKey
  /** Locale key of the lead line under the heading. */
  readonly leadKey: WorkBuddyShellKey
  /** The rows to state, in display order. */
  readonly rows: readonly IndexRow[]
}

/**
 * Render one WorkBuddy shell index.
 * @param props - the surface's copy keys and rows.
 * @returns the panel element tree.
 */
export function IndexPanel({ t, titleKey, leadKey, rows }: IndexPanelProps): ReactNode {
  return (
    <section className={css.panel} data-workbuddy-index>
      <header className={css.header}>
        <h2 className={css.title}>{t(titleKey)}</h2>
        <p className={css.lead}>{t(leadKey)}</p>
      </header>
      <ul className={css.rows}>
        {rows.map(row => (
          <li
            key={row.id}
            className={clsx(css.row, row.absent === true && css.absent)}
            data-workbuddy-row={row.id}
          >
            <span className={css.name}>{t(row.nameKey)}</span>
            <span className={css.backing}>{t(row.backingKey)}</span>
            {row.absent === true && <span className={css.tag}>{t('index.absent')}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
