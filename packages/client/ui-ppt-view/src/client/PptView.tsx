/**
 * The presentation result card: title, slide count, size, a preview that opens
 * the generated HTML in the existing document iframe, and a direct PPTX
 * download. The card only presents files the host already wrote.
 *
 * @module @deepseek-ai/dsh-client-ui-ppt-view/PptView
 */

import { useMemo } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { downloadHref, fileSize, fileName, pptFromBlock, resultText } from './model.ts'
import css from './PptView.module.css'

/** Full props: ui-tool owner data plus the `ppt` locale seat. */
export type PptViewProps = ToolCallViewProps & PropsLocale<'ppt'>

/**
 * Render one `ppt_create` or `ppt_export` result.
 * @param props - call node, the owner's openFile action, and copy.
 * @returns the card, or the raw fallback when the payload is not recognized.
 */
export function PptView({ block, openFile, t }: PptViewProps) {
  const model = useMemo(() => pptFromBlock(block), [block])
  if (model === null) {
    const text = resultText(block)
    return (
      <section className={css.card} data-ppt-view>
        <header className={css.header}><span className={css.title}>{t('fallback.title')}</span></header>
        <pre className={css.raw}>{text ?? t('fallback.running')}</pre>
      </section>
    )
  }
  const size = fileSize(model.bytes)
  return (
    <section className={css.card} data-ppt-view>
      <header className={css.header}>
        <span className={css.title}>{t('card.title')}</span>
        <span className={css.status}>{model.pptxPath === null ? t('status.partial') : t('status.ready')}</span>
      </header>
      <div className={css.heading}>
        <div className={css.deckTitle}>{model.title}</div>
        <div className={css.subtitle}>{t('card.subtitle')}</div>
      </div>
      <div className={css.kpis}>
        <Kpi label={t('kpi.slides')} value={t('unit.slides', { value: String(model.slideCount) })} />
        <Kpi label={t('kpi.format')} value={t('unit.format')} />
        <Kpi label={t('kpi.size')} value={t(`unit.${size.unit}`, { value: size.value })} />
      </div>
      <div className={css.actions}>
        <button type="button" className={css.preview} onClick={() => { openFile(model.htmlPath) }} aria-label={t('action.previewAria')}>
          {t('action.preview')}
        </button>
        {model.pptxPath === null
          ? <span className={css.disabled}>{t('note.partial')}</span>
          : <a className={css.download} href={model.pptxUrl ?? downloadHref(model.pptxPath)} download={fileName(model.pptxPath)} aria-label={t('action.downloadAria')}>
            {t('action.download')}
          </a>}
      </div>
      {model.warnings.length === 0 ? null : (
        <section className={css.warnings}>
          <div className={css.sectionTitle}>{t('warnings.title')}</div>
          <ul>{model.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </section>
      )}
      <div className={css.paths}>
        <Path label={t('path.html')} value={model.htmlPath} />
        {model.pptxPath === null ? null : <Path label={t('path.pptx')} value={model.pptxPath} />}
      </div>
      <p className={css.note}>{model.pptxPath === null ? t('note.partial') : t('note.download')}</p>
    </section>
  )
}

/** One KPI capsule. */
function Kpi({ label, value }: { label: string; value: string }) {
  return <span className={css.kpi}><span className={css.kpiLabel}>{label}</span><span className={css.kpiValue}>{value}</span></span>
}

/** One written path. */
function Path({ label, value }: { label: string; value: string }) {
  return <div className={css.path}><span className={css.pathLabel}>{label}</span><code className={css.pathValue}>{value}</code></div>
}
