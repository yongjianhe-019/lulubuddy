/**
 * Shared presentation pieces for the Xiaohongshu post card: the card shell, KPI
 * capsules, section headings, copy action, warning list, and the plain-text
 * fallback used when a result is not a recognized payload.
 *
 * @module @deepseek-ai/dsh-client-ui-xhs-view/parts
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { isSettled, resultText, type ToolBlock } from './model.ts'
import css from './XhsView.module.css'

/** Full props of the registered post card: ui-tool owner data plus the locale seat. */
export type XhsViewProps = ToolCallViewProps & PropsLocale<'xhs'>

/** The card's bound translate function. */
export type XhsTranslate = XhsViewProps['t']

/** One card shell: localized title over the card body. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={css.card} data-xhs-view>
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

/** The publication notes a result carried. */
export function WarningList({ warnings, t }: { warnings: readonly string[]; t: XhsTranslate }) {
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
 * One copy action. The clipboard call is the browser's; a missing or rejected
 * clipboard is reported instead of leaving a button that silently did nothing.
 */
export function CopyButton({ text, label, t }: { text: string; label: string; t: XhsTranslate }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])
  const copy = (): void => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    if (clipboard === undefined) {
      setState('failed')
      return
    }
    void clipboard.writeText(text).then(() => {
      setState('copied')
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => { setState('idle') }, 1500)
    }).catch(() => { setState('failed') })
  }
  return (
    <button type="button" className={css.copyButton} onClick={copy}>
      {state === 'copied' ? t('copied') : state === 'failed' ? t('copy.failed') : label}
    </button>
  )
}

/**
 * The fallback the card renders when its result is not a recognized payload:
 * the running notice, the empty notice, or the raw text.
 */
export function PlainResult({ block, title, t, running }: {
  block: ToolBlock
  title: string
  t: XhsTranslate
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
