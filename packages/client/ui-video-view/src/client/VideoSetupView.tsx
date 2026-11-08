/**
 * The render-environment card: what a `video_setup` call found and what it
 * installed, so a person waiting on a first render can see what the wait is.
 *
 * @module @deepseek-ai/dsh-client-ui-video-view/VideoSetupView
 */

import { useMemo } from 'react'
import { extractDocument, productionNotes, readSetupDocument, resultText } from './model.ts'
import { Card, Kpi, KpiRow, PlainResult, WarningList, type VideoViewProps } from './parts.tsx'
import css from './VideoView.module.css'

/**
 * Render one `video_setup` result.
 * @param props - keyed toolview owner data plus the video locale seat.
 * @returns the card, or the plain fallback when the result carries no report.
 */
export function VideoSetupView({ block, t }: VideoViewProps) {
  const model = useMemo(() => {
    const text = resultText(block)
    if (text === null) return null
    const document = extractDocument(text)
    if (document === null) return null
    const setup = readSetupDocument(document)
    if (setup === null) return null
    return { setup, warnings: productionNotes(block) }
  }, [block])
  if (model === null) return <PlainResult block={block} title={t('card.setup')} t={t} running={t('state.setup')} />

  const { setup, warnings } = model
  return (
    <Card title={t('card.setup')}>
      <WarningList warnings={warnings} t={t} />
      <KpiRow>
        <Kpi label={t('kpi.project')} value={setup.projectRoot} />
        <Kpi label={t('kpi.remotion')} value={setup.remotionVersion ?? '—'} />
        <Kpi label={t('kpi.edgeTts')} value={setup.edgeTtsVersion ?? '—'} />
      </KpiRow>
      <ul className={css.checkList}>
        <Check
          label={t('setup.laid')}
          detail={setup.laidTemplate ? t('setup.laid.yes') : t('setup.laid.no')}
        />
        <Check
          label={t('setup.packages')}
          detail={setup.installedPackages ? t('setup.installed') : t('setup.present')}
        />
        <Check
          label={t('setup.browser')}
          detail={setup.browserReady ? t('setup.ready') : t('setup.laid.no')}
        />
      </ul>
    </Card>
  )
}

/**
 * One readiness row.
 * @param props - the row's label and its reported detail.
 * @returns the row.
 */
function Check({ label, detail }: { label: string; detail: string }) {
  return (
    <li className={css.check}>
      <span className={css.checkLabel}>{label}</span>
      <span className={css.checkDetail}>{detail}</span>
    </li>
  )
}
