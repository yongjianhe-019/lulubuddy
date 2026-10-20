/**
 * The Xiaohongshu post card: the finished video played in place, the title,
 * body, hashtags, pinned comment, both publication gates, and the files one
 * publication wrote.
 *
 * The card is a presentation of the payload the host produced; it never runs a
 * gate, measures a video, or writes a file. Copy actions are the browser's
 * clipboard.
 *
 * @module @deepseek-ai/dsh-client-ui-xhs-view/XhsPostView
 */

import { useMemo, useState } from 'react'
import { fileSize, postFromBlock, publishCopy, seconds } from './model.ts'
import {
  Card, CopyButton, Kpi, KpiRow, PlainResult, SectionTitle, WarningList, type XhsViewProps,
} from './parts.tsx'
import css from './XhsView.module.css'

/**
 * Render one `xhs_post` result.
 * @param props - keyed toolview owner data plus the post locale seat.
 * @returns the card, or the plain fallback when the result carries no payload.
 */
export function XhsPostView({ block, t }: XhsViewProps) {
  const [unplayable, setUnplayable] = useState(false)
  const post = useMemo(() => postFromBlock(block), [block])
  if (post === null) {
    return <PlainResult block={block} title={t('card.title')} t={t} running={t('state.running')} />
  }
  const size = fileSize(post.video.bytes)
  return (
    <Card title={t('card.title')}>
      <WarningList warnings={post.warnings} t={t} />
      <div className={css.headRow}>
        <div className={css.headText}>
          <div className={css.postTitle}>{post.title}</div>
          <div className={css.postMeta}>
            {t('card.subtitle', { number: String(post.number), topic: post.topic })}
          </div>
        </div>
        <span className={css.status}>{t('status.ready')}</span>
      </div>

      <KpiRow>
        <Kpi label={t('kpi.duration')} value={t('unit.seconds', { value: seconds(post.video.durationMs) })} />
        <Kpi label={t('kpi.frame')} value={t('unit.frame', {
          width: String(post.video.width),
          height: String(post.video.height),
          fps: String(post.video.fps),
        })} />
        <Kpi label={t('kpi.size')} value={t(`unit.${size.unit}`, { value: size.value })} />
      </KpiRow>

      <section>
        <SectionTitle>{t('media.label')}</SectionTitle>
        {post.video.url !== null && !unplayable
          ? (
            <video
              className={css.player}
              src={post.video.url}
              controls
              preload="metadata"
              aria-label={post.title}
              onError={() => { setUnplayable(true) }}
            />
          )
          : <p className={css.notice}>{t(post.video.url === null ? 'media.unavailable' : 'media.unsupported')}</p>}
      </section>

      <section>
        <div className={css.sectionHead}>
          <SectionTitle>{t('section.title')}</SectionTitle>
          <CopyButton text={post.title} label={t('copy.title')} t={t} />
        </div>
        <div className={css.titleText}>{post.title}</div>
      </section>

      <section>
        <div className={css.sectionHead}>
          <SectionTitle>{t('section.body')}</SectionTitle>
          <CopyButton text={post.body} label={t('copy.body')} t={t} />
        </div>
        <pre className={css.body}>{post.body}</pre>
      </section>

      <section>
        <div className={css.sectionHead}>
          <SectionTitle>{t('section.tags')}</SectionTitle>
          <CopyButton text={post.tags.join(' ')} label={t('copy.tags')} t={t} />
        </div>
        <div className={css.tags}>
          {post.tags.map(tag => <span key={tag} className={css.tag}>{tag}</span>)}
        </div>
      </section>

      <section>
        <div className={css.sectionHead}>
          <SectionTitle>{t('section.pinned')}</SectionTitle>
          <CopyButton text={post.pinnedComment} label={t('copy.pinned')} t={t} />
        </div>
        <p className={css.pinned}>{post.pinnedComment}</p>
      </section>

      <section>
        <SectionTitle>{t('section.checks')}</SectionTitle>
        <div className={css.checks}>
          <Check
            label={t('check.detect')}
            passed={post.checks.detect.passed}
            detail={`${post.checks.detect.verdict} · ${t('check.hits', { value: String(post.checks.detect.hits) })}`}
            passLabel={t('check.pass')}
            failLabel={t('check.fail')}
          />
          <Check
            label={t('check.scan')}
            passed={post.checks.scan.passed}
            detail={t('check.hardSoft', {
              hard: String(post.checks.scan.hard),
              soft: String(post.checks.scan.soft),
            })}
            passLabel={t('check.pass')}
            failLabel={t('check.fail')}
          />
        </div>
      </section>

      <section>
        <SectionTitle>{t('section.files')}</SectionTitle>
        <div className={css.files}>
          <FileRow label={t('file.draft')} path={post.files.draft} />
          <FileRow label={t('file.publish')} path={post.files.publish} />
          <FileRow label={t('file.video')} path={post.files.video} />
        </div>
      </section>

      <div className={css.actions}>
        <CopyButton text={publishCopy(post)} label={t('copy.all')} t={t} />
      </div>
      <p className={css.note}>{t('note.unpublished')}</p>
    </Card>
  )
}

/** One publication gate as a pass/fail row. */
function Check({ label, passed, detail, passLabel, failLabel }: {
  label: string
  passed: boolean
  detail: string
  passLabel: string
  failLabel: string
}) {
  return (
    <div className={css.check}>
      <span className={css.checkLabel}>{label}</span>
      <span className={passed ? css.checkPass : css.checkFail}>{passed ? passLabel : failLabel}</span>
      <span className={css.checkDetail}>{detail}</span>
    </div>
  )
}

/** One written file, shown by label and absolute path. */
function FileRow({ label, path }: { label: string; path: string }) {
  return (
    <div className={css.file}>
      <span className={css.fileLabel}>{label}</span>
      <code className={css.filePath}>{path}</code>
    </div>
  )
}
