/**
 * The short-video card: the rendered file played in place, the facts a viewer
 * checks before watching it, and the scene timeline the render actually
 * produced.
 *
 * The player reads the playback URL only when the deployment mounted the route
 * for it, and a browser that cannot decode the file says so instead of showing
 * a dead control; the file's own path is always shown, because opening it
 * directly is what remains available either way.
 *
 * @module @deepseek-ai/dsh-client-ui-video-view/VideoCreateView
 */

import { useMemo, useState } from 'react'
import {
  fileSize, productionNotes, renderFromBlock, seconds,
  type RenderModel,
} from './model.ts'
import { Card, Kpi, KpiRow, PlainResult, SectionTitle, WarningList, type VideoViewProps } from './parts.tsx'
import css from './VideoView.module.css'

/**
 * Render one `video_create` result.
 * @param props - keyed toolview owner data plus the video locale seat.
 * @returns the card, or the plain fallback when the result carries no render.
 */
export function VideoCreateView({ block, t }: VideoViewProps) {
  // A browser that cannot decode the container is a fact only this component
  // learns, from the element's own error.
  const [unplayable, setUnplayable] = useState(false)
  const model = useMemo(() => {
    const render = renderFromBlock(block)
    return render === null ? null : { render, warnings: productionNotes(block) }
  }, [block])
  if (model === null) return <PlainResult block={block} title={t('card.create')} t={t} running={t('state.running')} />

  const { render, warnings } = model
  const size = fileSize(render.bytes)
  return (
    <Card title={t('card.create')}>
      <WarningList warnings={warnings} t={t} />
      <KpiRow>
        <Kpi label={t('kpi.duration')} value={t('unit.seconds', { value: seconds(render.durationMs) })} />
        <Kpi label={t('kpi.frame')} value={t('unit.frame', { width: String(render.width), height: String(render.height), fps: String(render.fps) })} />
        <Kpi label={t('kpi.scenes')} value={t('unit.scenes', { value: String(render.scenes.length) })} />
        <Kpi label={t('kpi.size')} value={t(`unit.${size.unit}`, { value: size.value })} />
        <Kpi label={t('kpi.voice')} value={render.voice} />
      </KpiRow>
      <section>
        <SectionTitle>{t('media.label')}</SectionTitle>
        {render.url !== null && !unplayable
          ? (
            <video
              className={css.player}
              src={render.url}
              controls
              preload="metadata"
              aria-label={render.title}
              onError={() => { setUnplayable(true) }}
            />
          )
          : <p className={css.notice}>{t(render.url === null ? 'media.unavailable' : 'media.unsupported')}</p>}
        <div className={css.outputRow}>
          <span className={css.outputLabel}>{t('output.label')}</span>
          <code className={css.outputPath}>{render.output}</code>
        </div>
      </section>
      <SceneTimeline render={render} t={t} />
    </Card>
  )
}

/**
 * The scene timeline a render produced.
 * @param props - the render and the card's bound translate function.
 * @returns the timeline section.
 */
function SceneTimeline({ render, t }: { render: RenderModel; t: VideoViewProps['t'] }) {
  return (
    <section>
      <SectionTitle>{t('storyboard.title')}</SectionTitle>
      <ol className={css.sceneList}>
        {render.scenes.map(scene => (
          <li key={scene.index} className={css.scene}>
            <div className={css.sceneHead}>
              <span className={css.sceneIndex}>{t('scene.label', { index: String(scene.index) })}</span>
              <span className={css.sceneRange}>
                {t('scene.range', { start: seconds(scene.startMs), end: seconds(scene.endMs) })}
              </span>
              {scene.cached ? <span className={css.sceneCached}>{t('scene.cached')}</span> : null}
            </div>
            {scene.heading === null ? null : <div className={css.sceneHeading}>{scene.heading}</div>}
            <p className={css.sceneNarration}>{scene.narration}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
