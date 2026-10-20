/**
 * The market-data-refresh card: the refresh mode, the newly covered datasets
 * with their row counts and date ranges, and the cache files ordered by their
 * last modification time.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/MarketDataRefreshView
 */

import { useMemo } from 'react'
import { deriveMarketDataRefresh, formatDate, formatNumber, formatTimestamp, parseFinanceResult, type DatasetModel } from './model.ts'
import {
  Card, Kpi, KpiRow, PlainResult, SectionTitle, WarningList,
  type FinanceTranslate, type FinanceViewProps,
} from './parts.tsx'
import css from './FinanceView.module.css'

/** One dataset's coverage line. */
function DatasetRow({ name, dataset, t }: { name: string; dataset: DatasetModel; t: FinanceTranslate }) {
  return (
    <li className={css.timelineItem}>
      <span className={css.timelineName}>{name}</span>
      <span className={css.timelineMeta}>
        {dataset.rows !== null ? t('unit.rows', { value: formatNumber(dataset.rows) }) : null}
      </span>
      <span className={css.timelineDate}>
        {dataset.firstDate !== null && dataset.lastDate !== null
          ? `${formatDate(dataset.firstDate)} – ${formatDate(dataset.lastDate)}`
          : null}
      </span>
    </li>
  )
}

/**
 * Render one `market_data_refresh` result.
 * @param props - keyed toolview owner data plus the finance locale seat.
 * @returns the refresh card, or the plain fallback.
 */
export function MarketDataRefreshView({ block, t }: FinanceViewProps) {
  const model = useMemo(() => {
    const parsed = parseFinanceResult(block)
    if (parsed === null) return null
    const refresh = deriveMarketDataRefresh(parsed.document)
    return refresh === null ? null : { parsed, refresh }
  }, [block])
  if (model === null) return <PlainResult block={block} title={t('card.refresh')} t={t} />

  const { parsed, refresh } = model
  return (
    <Card title={t('card.refresh')}>
      <WarningList warnings={parsed.warnings} t={t} />
      <KpiRow>
        {refresh.force !== null
          ? <Kpi label={t('refresh.mode')} value={refresh.force ? t('refresh.force') : t('refresh.incremental')} />
          : null}
        {refresh.cacheDirectory !== null ? <Kpi label={t('refresh.cache')} value={refresh.cacheDirectory} /> : null}
        <Kpi
          label={t('refresh.cacheFiles')}
          value={t('unit.rows', { value: String(refresh.cacheFiles.length) })}
        />
      </KpiRow>
      <section>
        <SectionTitle>{t('refresh.datasets')}</SectionTitle>
        <ul className={css.timeline}>
          {refresh.datasets.map(dataset => (
            <DatasetRow key={dataset.name} name={dataset.name} dataset={dataset} t={t} />
          ))}
          {refresh.macro !== null
            ? <DatasetRow name={t('refresh.macro')} dataset={refresh.macro} t={t} />
            : null}
        </ul>
      </section>
      {refresh.cacheFiles.length > 0 ? (
        <section>
          <SectionTitle>{t('refresh.modified')}</SectionTitle>
          <ul className={css.timeline}>
            {refresh.cacheFiles.map(file => (
              <li key={file.file} className={css.timelineItem}>
                <span className={css.timelineName}>{file.file}</span>
                <span className={css.timelineDate}>
                  {file.modified === null ? null : formatTimestamp(file.modified)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  )
}
