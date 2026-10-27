import { useMemo } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { downloadHref, fileName, mediaHref, modelFromBlock, resultText } from './model.ts'
import css from './ImageView.module.css'

export type ImageViewProps = ToolCallViewProps & PropsLocale<'image'>

export function ImageView({ block, openFile, t }: ImageViewProps) {
  const model = useMemo(() => modelFromBlock(block), [block])
  if (model === null) {
    return (
      <section className={css.card} data-image-view>
        <header className={css.header}><span className={css.title}>{t('card.title')}</span></header>
        <pre className={css.raw}>{resultText(block) ?? t('state.empty')}</pre>
      </section>
    )
  }
  return (
    <section className={css.card} data-image-view>
      <header className={css.header}>
        <span className={css.title}>{t('card.title')}</span>
        <span className={css.status}>{t('status.ready')}</span>
      </header>
      <div className={css.kpis}>
        <span className={css.kpi}><span className={css.kpiLabel}>{t('kpi.style')}</span><span className={css.kpiValue}>{t(`style.${model.style}`)}</span></span>
        {model.caption === '' ? null : <span className={css.kpi}><span className={css.kpiLabel}>{t('kpi.caption')}</span><span className={css.kpiValue}>{model.caption}</span></span>}
      </div>
      <div className={css.pair}>
        <figure className={css.figure}>
          <figcaption className={css.caption}>{t('section.source')}</figcaption>
          <img className={css.source} src={mediaHref(model.sourcePath)} alt={t('section.source')} />
        </figure>
        <figure className={css.figure}>
          <figcaption className={css.caption}>{t('section.result')}</figcaption>
          <img className={css.result} src={mediaHref(model.outputPath)} alt={t('section.result')} />
        </figure>
      </div>
      <div className={css.actions}>
        <a className={css.download} href={downloadHref(model.outputPath)} download={fileName(model.outputPath)}>{t('action.download')}</a>
        <button type="button" className={css.secondary} onClick={() => { openFile(model.sourcePath) }}>{t('action.source')}</button>
      </div>
      <p className={css.note}>{t('note.local')}</p>
    </section>
  )
}
