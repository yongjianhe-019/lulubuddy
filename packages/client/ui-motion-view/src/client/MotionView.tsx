/**
 * The motion result card: the finished MP4 plays in place, with the poster,
 * contact sheet, QC facts, direct downloads, and the source project.
 *
 * @module @deepseek-ai/dsh-client-ui-motion-view/MotionView
 */

import { useMemo, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { downloadHref, fileName, fileSize, mediaHref, motionFromBlock, resultText } from './model.ts'
import css from './MotionView.module.css'

export type MotionViewProps = ToolCallViewProps & PropsLocale<'motion'>

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function MotionView({ block, openFile, t }: MotionViewProps) {
  const model = useMemo(() => motionFromBlock(block), [block])
  const [unplayable, setUnplayable] = useState(false)
  if (model === null) {
    const text = resultText(block)
    return (
      <section className={css.card} data-motion-view>
        <header className={css.header}><span className={css.title}>{t('card.title')}</span></header>
        <pre className={css.raw}>{text ?? t('state.empty')}</pre>
      </section>
    )
  }
  const size = fileSize(model.bytes)
  const qc = model.qc
  return (
    <section className={css.card} data-motion-view>
      <header className={css.header}>
        <span className={css.title}>{t('card.title')}</span>
        <span className={css.status}>{t('card.ready')}</span>
      </header>
      <div className={css.heading}>
        <div className={css.videoTitle}>{model.title}</div>
        <div className={css.meta}>{model.projectDir}</div>
      </div>
      <div className={css.kpis}>
        <span className={css.kpi}>
          <span className={css.kpiLabel}>{t('kpi.duration')}</span>
          <span className={css.kpiValue}>{t('unit.seconds', { value: (model.durationMs / 1000).toFixed(1) })}</span>
        </span>
        <span className={css.kpi}>
          <span className={css.kpiLabel}>{t('kpi.frame')}</span>
          <span className={css.kpiValue}>
            {t('unit.frame', { width: String(model.width), height: String(model.height), fps: textOf(qc?.['fps']) ?? '—' })}
          </span>
        </span>
        <span className={css.kpi}>
          <span className={css.kpiLabel}>{t('kpi.size')}</span>
          <span className={css.kpiValue}>{t(`unit.${size.unit}`, { value: size.value })}</span>
        </span>
        {model.platform === null ? null : (
          <span className={css.kpi}>
            <span className={css.kpiLabel}>{t('kpi.platform')}</span>
            <span className={css.kpiValue}>
              {model.platform}{model.safeArea === null ? '' : ` · ${model.safeArea}`}
            </span>
          </span>
        )}
      </div>
      <section>
        <div className={css.sectionTitle}>{t('section.media')}</div>
        {unplayable
          ? <p className={css.notice}>{t('media.unsupported')}</p>
          : (
            <video
              className={css.player}
              controls
              preload="metadata"
              poster={model.posterPath === null ? undefined : mediaHref(model.posterPath)}
              src={mediaHref(model.videoPath)}
              onError={() => { setUnplayable(true) }}
            />
          )}
      </section>
      <div className={css.actions}>
        <a className={css.download} href={downloadHref(model.videoPath)} download={fileName(model.videoPath)}>{t('action.download')}</a>
        {model.posterPath === null ? null : (
          <a className={css.secondary} href={downloadHref(model.posterPath)} download={fileName(model.posterPath)}>
            {t('action.poster')}
          </a>
        )}
        {model.sheetPath === null ? null : (
          <a className={css.secondary} href={downloadHref(model.sheetPath)} download={fileName(model.sheetPath)}>
            {t('action.sheet')}
          </a>
        )}
        <button type="button" className={css.secondary} onClick={() => { openFile(model.htmlPath) }}>{t('action.source')}</button>
      </div>
      {model.posterPath === null ? null : (
        <section>
          <div className={css.sectionTitle}>{t('section.poster')}</div>
          <img className={css.poster} src={mediaHref(model.posterPath)} alt={`${model.title} poster`} />
        </section>
      )}
      <section>
        <div className={css.sectionTitle}>{t('section.qc')}</div>
        {qc === null ? <p className={css.notice}>{t('qc.none')}</p> : (
          <div className={css.qcRow}>
            <span>{t('qc.codec')}: {textOf(qc['codec']) ?? '—'}</span>
            <span>{t('qc.audio')}: {textOf(qc['audioCodec']) ?? '—'}</span>
            <span>{t('qc.loudness')}: {textOf(qc['meanDb']) ?? '—'} / {textOf(qc['maxDb']) ?? '—'} dB</span>
          </div>
        )}
      </section>
      {model.warnings.length === 0 ? null : (
        <section className={css.warnings}><ul>{model.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></section>
      )}
      <p className={css.note}>{t('note.delivery')}</p>
    </section>
  )
}
