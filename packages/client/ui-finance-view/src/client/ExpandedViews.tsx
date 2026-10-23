/**
 * Cards for the expanded StockMarket surface: the composed daily dashboard, the
 * CSI 2000 buy gate, the satellite opportunity radar, the dragon-head review,
 * and the human-maintained positions. The documents are the project's own JSON;
 * these views only arrange the fields a reader checks, and fall back to the raw
 * result for anything they do not recognize.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/ExpandedViews
 */

import { Children, useMemo, type ReactNode } from 'react'
import { asBoolean, asNumber, asRecord, parseFinanceResult } from './model.ts'
import {
  Card, Kpi, KpiRow, PlainResult, SectionTitle, WarningList, type FinanceViewProps,
} from './parts.tsx'
import css from './FinanceView.module.css'

/** Read a non-empty string, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Read an array, or an empty one. */
function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

/** Format a fraction as a whole percent. */
function pct(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(0)}%`
}

/** Format a number with a fixed number of decimals, or an em dash. */
function fixed(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits)
}

/** One header + value row shared by the compact tables. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th scope="row" className={css.tableKey}>{label}</th>
      <td className={css.tableValue}>{value}</td>
    </tr>
  )
}

/** A section that renders nothing when it has no children. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  if (Children.count(children) === 0) return null
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

/** Read the two `core` index rows the dashboard composes. */
function coreRows(document: Record<string, unknown>): readonly { name: string; row: Record<string, unknown> }[] {
  const core = asRecord(document['core'])
  if (core === null) return []
  return ['沪深300', '中证2000']
    .map(name => ({ name, row: asRecord(core[name]) }))
    .filter((entry): entry is { name: string; row: Record<string, unknown> } => entry.row !== null)
}

/** Render the composed daily dashboard. */
export function DashboardView({ block, t }: FinanceViewProps) {
  const parsed = useMemo(() => parseFinanceResult(block), [block])
  const document = parsed?.document
  const rows = document === undefined ? [] : coreRows(document)
  if (parsed === null || document === undefined) {
    return <PlainResult block={block} title={t('card.dashboard')} t={t} />
  }
  const positions = asRecord(document['positions'])
  const dragon = asRecord(document['dragon'])
  const opportunities = list(document['opportunity'])
  const plan = list(document['plan'])
  const date = text(document['date'])
  const report = text(document['report_markdown'])
  const history = list(document['history'])
  return (
    <Card title={t('card.dashboard')}>
      <WarningList warnings={parsed.warnings} t={t} />
      <KpiRow>
        {date === null ? null : <Kpi label={t('dashboard.date')} value={date} />}
        <Kpi label={t('dashboard.conclusion')} value={text(document['conclusion']) ?? '—'} />
        <Kpi label={t('dashboard.position')} value={text(positions?.['position'] as string) ?? '—'} />
      </KpiRow>
      <p className={css.notice}>{text(document['next_trigger']) ?? ''}</p>
      <Section title={t('dashboard.core')}>
        <table className={css.table}>
          <thead><tr><th>{t('dashboard.target')}</th><th>{t('dashboard.close')}</th><th>{t('dashboard.score')}</th><th>{t('dashboard.action')}</th><th>{t('dashboard.missing')}</th></tr></thead>
          <tbody>
            {rows.map(({ name, row }) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{fixed(asNumber(row['close']), 3)}</td>
                <td>{fixed(asNumber(row['score']), 0)}</td>
                <td>{text(row['action']) ?? '—'}</td>
                <td>{list(row['missing']).filter((item): item is string => typeof item === 'string').join('；') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={t('dashboard.opportunity')}>
        {opportunities.length === 0 ? <p className={css.notice}>{t('dashboard.watching')}</p> : (
          <table className={css.table}>
            <thead><tr><th>{t('dashboard.target')}</th><th>{t('dashboard.rr')}</th><th>{t('dashboard.win')}</th><th>{t('dashboard.ev')}</th><th>{t('dashboard.missing')}</th></tr></thead>
            <tbody>
              {opportunities.slice(0, 6).map((entry, index) => {
                const row = asRecord(entry)
                if (row === null) return null
                return (
                  <tr key={`${text(row['name']) ?? 'opp'}-${String(index)}`}>
                    <td>{text(row['name']) ?? '—'}</td>
                    <td>{fixed(asNumber(row['rr']), 2)}</td>
                    <td>{pct(asNumber(row['win']))}</td>
                    <td>{fixed(asNumber(row['ev']), 1)}</td>
                    <td>{list(row['missing']).filter((item): item is string => typeof item === 'string').join('；') || (asBoolean(row['eligible']) ? t('dashboard.eligible') : t('dashboard.watching'))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>
      <Section title={t('dashboard.dragon')}>
        {dragon === null ? null : (
          <div className={css.factGrid}>
            <Kpi label={t('dashboard.env')} value={asBoolean(asRecord(dragon['env'])?.['strong']) === true ? t('dashboard.strong') : t('dashboard.weak')} />
            <Kpi label={t('dashboard.sentiment')} value={text(asRecord(dragon['sentiment'])?.['state']) ?? '—'} />
            <Kpi label={t('dashboard.sectors')} value={list(dragon['sectors']).slice(0, 3).map(item => text(asRecord(item)?.['sector']) ?? '').filter(Boolean).join(' / ') || '—'} />
          </div>
        )}
      </Section>
      <Section title={t('dashboard.history')}>
        {history.length === 0 ? <p className={css.notice}>{t('dashboard.noHistory')}</p> : (
          <ul className={css.historyList}>
            {history.map((item, index) => {
              const entry = asRecord(item)
              if (entry === null) return null
              const kind = text(entry['kind']) ?? '—'
              return (
                <li key={`history-${String(index)}`} className={css.historyItem}>
                  <span className={css.historyDate}>{text(entry['date']) ?? '—'}</span>
                  <span className={css.historyKind}>{t(`journal.${kind}` as 'journal.core')}</span>
                  <span className={css.historySummary}>{text(entry['summary']) ?? '—'}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      <Section title={t('dashboard.report')}>
        {report === null ? null : <pre className={css.report}>{report}</pre>}
      </Section>
      <Section title={t('dashboard.plan')}>
        <table className={css.table}>
          <thead><tr><th>{t('dashboard.engine')}</th><th>{t('dashboard.target')}</th><th>{t('dashboard.action')}</th><th>{t('dashboard.position')}</th><th>{t('dashboard.trigger')}</th></tr></thead>
          <tbody>
            {plan.map((entry, index) => {
              const row = asRecord(entry)
              if (row === null) return null
              return (
                <tr key={`plan-${String(index)}`}>
                  <td>{text(row['engine']) ?? '—'}</td>
                  <td>{text(row['target']) ?? '—'}</td>
                  <td>{text(row['action']) ?? '—'}</td>
                  <td>{text(row['position']) ?? '—'}</td>
                  <td>{text(row['trigger']) ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>
    </Card>
  )
}

/** Render the CSI 2000 ice-point gate. */
export function IceCheckView({ block, t }: FinanceViewProps) {
  const parsed = useMemo(() => parseFinanceResult(block), [block])
  const document = parsed?.document
  if (parsed === null || document === undefined) {
    return <PlainResult block={block} title={t('card.ice')} t={t} />
  }
  const triggered = asBoolean(document['triggered']) === true
  const detail = asRecord(document['detail'])
  const gaps = list(document['gaps']).filter((item): item is string => typeof item === 'string')
  return (
    <Card title={t('card.ice')}>
      <WarningList warnings={parsed.warnings} t={t} />
      <KpiRow>
        <Kpi label={t('ice.state')} value={triggered ? t('ice.triggered') : t('ice.notTriggered')} />
        <Kpi label={t('ice.close')} value={fixed(asNumber(document['etf_close']), 3)} />
        <Kpi label={t('ice.ma10')} value={fixed(asNumber(document['ma10']), 3)} />
        <Kpi label={t('ice.distance')} value={pct(asNumber(document['distance_to_ma10']))} />
        <Kpi label={t('ice.channel')} value={text(document['channel']) ?? '—'} />
        <Kpi label={t('ice.position')} value={pct(asNumber(document['position_pct']))} />
      </KpiRow>
      <KpiRow>
        <Kpi label={t('ice.score')} value={fixed(asNumber(document['score']), 1)} />
        <Kpi label={t('ice.scorePct')} value={pct(asNumber(document['score_pct']))} />
        <Kpi label={t('ice.r20')} value={pct(asNumber(document['r20_pct']))} />
        <Kpi label={t('ice.dd250')} value={pct(asNumber(document['dd250']))} />
      </KpiRow>
      <Section title={t('ice.gaps')}>
        <p className={css.notice}>{gaps.length === 0 ? '—' : gaps.join(' / ')}</p>
      </Section>
      <Section title={t('ice.detail')}>
        <table className={css.table}>
          <tbody>
            {Object.entries(detail ?? {}).map(([key, value]) => (
              <Row key={key} label={key} value={typeof value === 'string' ? value : JSON.stringify(value)} />
            ))}
          </tbody>
        </table>
      </Section>
    </Card>
  )
}

/** Render the satellite opportunity radar. */
export function RadarView({ block, t }: FinanceViewProps) {
  const parsed = useMemo(() => parseFinanceResult(block), [block])
  const document = parsed?.document
  if (parsed === null || document === undefined) {
    return <PlainResult block={block} title={t('card.radar')} t={t} />
  }
  const opportunities = list(document['opportunities'])
  return (
    <Card title={t('card.radar')}>
      <WarningList warnings={parsed.warnings} t={t} />
      <Section title={t('radar.open')}>
        {opportunities.length === 0 ? <p className={css.notice}>{t('dashboard.watching')}</p> : (
          <table className={css.table}>
            <thead><tr><th>{t('dashboard.target')}</th><th>{t('dashboard.rr')}</th><th>{t('dashboard.win')}</th><th>{t('dashboard.ev')}</th><th>{t('dashboard.missing')}</th></tr></thead>
            <tbody>
              {opportunities.map((entry, index) => {
                const row = asRecord(entry)
                if (row === null) return null
                return (
                  <tr key={`${text(row['name']) ?? 'opp'}-${String(index)}`}>
                    <td>{text(row['name']) ?? '—'}</td>
                    <td>{fixed(asNumber(row['rr']), 2)}</td>
                    <td>{pct(asNumber(row['win']))}</td>
                    <td>{fixed(asNumber(row['ev']), 1)}</td>
                    <td>{list(row['missing']).filter((item): item is string => typeof item === 'string').join('；') || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>
      <Section title={t('radar.positions')}>
        <p className={css.notice}>{list(document['positions']).length === 0 ? '—' : list(document['positions']).map(item => text(asRecord(item)?.['name']) ?? '').filter(Boolean).join(' / ')}</p>
      </Section>
      <Section title={t('radar.watching')}>
        <p className={css.notice}>{list(document['watching']).length === 0 ? '—' : list(document['watching']).map(item => text(asRecord(item)?.['name']) ?? '').filter(Boolean).join(' / ')}</p>
      </Section>
    </Card>
  )
}

/** Render the latest dragon-head review. */
export function DragonView({ block, t }: FinanceViewProps) {
  const parsed = useMemo(() => parseFinanceResult(block), [block])
  const document = parsed?.document
  if (parsed === null || document === undefined) {
    return <PlainResult block={block} title={t('card.dragon')} t={t} />
  }
  const env = asRecord(document['env'])
  const sentiment = asRecord(document['sentiment'])
  const sectors = list(document['sectors'])
  return (
    <Card title={t('card.dragon')}>
      <WarningList warnings={parsed.warnings} t={t} />
      <KpiRow>
        <Kpi label={t('dashboard.date')} value={text(document['date']) ?? '—'} />
        <Kpi label={t('dashboard.env')} value={asBoolean(env?.['strong']) === true ? t('dashboard.strong') : t('dashboard.weak')} />
        <Kpi label={t('dragon.sentiment')} value={text(sentiment?.['state']) ?? '—'} />
        <Kpi label={t('dragon.final')} value={asBoolean(document['final']) === true ? '✓' : '—'} />
      </KpiRow>
      <Section title={t('dragon.sectors')}>
        <table className={css.table}>
          <thead><tr><th>{t('dashboard.target')}</th><th>{t('dashboard.score')}</th><th>{t('dashboard.action')}</th></tr></thead>
          <tbody>
            {sectors.slice(0, 8).map((entry, index) => {
              const row = asRecord(entry)
              if (row === null) return null
              return (
                <tr key={`${text(row['sector']) ?? 'sector'}-${String(index)}`}>
                  <td>{text(row['sector']) ?? '—'}</td>
                  <td>{fixed(asNumber(row['limitup_count']), 0)}</td>
                  <td>{`首板 ${fixed(asNumber(row['first_board']), 0)} / 连板 ${fixed(asNumber(row['streak2']), 0)} / 3+ ${fixed(asNumber(row['streak3plus']), 0)}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>
    </Card>
  )
}

/** Render the human-maintained positions and radar state. */
export function PositionsView({ block, t }: FinanceViewProps) {
  const parsed = useMemo(() => parseFinanceResult(block), [block])
  const document = parsed?.document
  if (parsed === null || document === undefined) {
    return <PlainResult block={block} title={t('card.positions')} t={t} />
  }
  const files = asRecord(document['files'])
  const positions = asRecord(files?.['positions.json'])
  const open = list(positions?.['positions'])
  const closed = list(positions?.['closed'])
  return (
    <Card title={t('card.positions')}>
      <KpiRow>
        <Kpi label={t('positions.asOf')} value={text(positions?.['as_of']) ?? '—'} />
        <Kpi label={t('positions.open')} value={String(open.length)} />
        <Kpi label={t('positions.closed')} value={String(closed.length)} />
      </KpiRow>
      <p className={css.notice}>{open.length === 0 ? t('positions.empty') : open.map(item => text(asRecord(item)?.['name']) ?? '').filter(Boolean).join(' / ')}</p>
    </Card>
  )
}
