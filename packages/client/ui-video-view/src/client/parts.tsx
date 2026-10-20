/**
 * Shared presentation pieces for the video cards: the card shell, KPI capsules,
 * the production-note list, and the plain-text fallback a card renders when its
 * result is not a recognized document.
 *
 * @module @deepseek-ai/dsh-client-ui-video-view/parts
 */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { isSettled, resultText, type ToolBlock } from './model.ts'
import css from './VideoView.module.css'

/** Full props of a registered video card: ui-tool owner data plus the locale seat. */
export type VideoViewProps = ToolCallViewProps & PropsLocale<'video'>

/** The card's bound translate function. */
export type VideoTranslate = VideoViewProps['t']

/** One card shell: localized title over the card body. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={css.card} data-video-view>
      <header className={css.cardHeader}>
        <span className={css.cardTitle}>{title}</span>
      </header>
      <div className={css.cardBody}>{children}</div>
    </section>
  )
}

/** One horizontal KPI capsule: a label and its value. */
export function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <span className={css.kpi}>
      <span className={css.kpiLabel}>{label}</span>
      <span className={css.kpiValue}>{value}</span>
    </span>
  )
}

/** The wrapped row every card's KPI capsules share. */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className={css.kpiRow}>{children}</div>
}

/** One section heading inside a card. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className={css.sectionTitle}>{children}</div>
}

/**
 * The production notes a result carried.
 * @param props - the notes and the card's bound translate function.
 * @returns the list, or null when the call produced none.
 */
export function WarningList({ warnings, t }: { warnings: readonly string[]; t: VideoTranslate }) {
  if (warnings.length === 0) return null
  return (
    <section className={css.warnings} aria-label={t('warnings.title')}>
      <SectionTitle>{t('warnings.title')}</SectionTitle>
      <ul className={css.warningList}>
        {warnings.map(warning => <li key={warning} className={css.warningItem}>{warning}</li>)}
      </ul>
    </section>
  )
}

/**
 * The fallback every card renders when its result is not a recognized document:
 * the running notice, the empty notice, or the raw text.
 *
 * The running notice is the caller's, because only the card knows what its own
 * call is doing while it has no result — preparing the render environment takes
 * minutes on a first call, and a card that said nothing would read as a hang.
 * @param props - the result node, the card's title, its translate function, and
 * the notice to show while the call is still running.
 * @returns the plain card.
 */
export function PlainResult({ block, title, t, running }: {
  block: ToolBlock
  title: string
  t: VideoTranslate
  running: string
}) {
  const text = resultText(block)
  return (
    <Card title={title}>
      {!isSettled(block)
        ? <p className={css.notice}>{running}</p>
        : text === null
          ? <p className={css.notice}>{t('state.empty')}</p>
          : <pre className={css.raw}>{text}</pre>}
    </Card>
  )
}
