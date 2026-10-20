/**
 * The macro-snapshot card: a KPI grid of the latest macro facts, the valuation
 * and bond-yield rows with their dates, and the warning list. Known macro keys
 * carry localized labels; an unknown key renders verbatim.
 *
 * @module @deepseek-ai/dsh-client-ui-finance-view/MacroSnapshotView
 */

import { useMemo } from 'react'
import { deriveMacroSnapshot, formatDate, parseFinanceResult, type MacroRowModel } from './model.ts'
import {
  Card, fieldLabel, Kpi, KpiRow, PlainResult, SectionTitle, WarningList,
  type FinanceTranslate, type FinanceViewProps,
} from './parts.tsx'
import css from './FinanceView.module.css'

/** One dated macro row rendered as capsules. */
function MacroRow({ row, t }: { row: MacroRowModel; t: FinanceTranslate }) {
  return (
    <div className={css.macroRow}>
      {row.date !== null ? <Kpi label={t('kpi.asOf')} value={formatDate(row.date)} /> : null}
      {row.fields.map(fieldValue => (
        <Kpi key={fieldValue.label} label={fieldLabel(fieldValue, t)} value={fieldValue.value} />
      ))}
    </div>
  )
}

/**
 * Render one `macro_snapshot` result.
 * @param props - keyed toolview owner data plus the finance locale seat.
 * @returns the macro card, or the plain fallback.
 */
export function MacroSnapshotView({ block, t }: FinanceViewProps) {
  const model = useMemo(() => {
    const parsed = parseFinanceResult(block)
    if (parsed === null) return null
    const snapshot = deriveMacroSnapshot(parsed.document)
    return snapshot === null ? null : { parsed, snapshot }
  }, [block])
  if (model === null) return <PlainResult block={block} title={t('card.macro')} t={t} />

  const { parsed, snapshot } = model
  return (
    <Card title={t('card.macro')}>
      <WarningList warnings={parsed.warnings} t={t} />
      <KpiRow>
        {snapshot.asOf !== null ? <Kpi label={t('kpi.asOf')} value={formatDate(snapshot.asOf)} /> : null}
        {snapshot.historyRows !== null
          ? <Kpi label={t('macro.history')} value={t('unit.rows', { value: String(snapshot.historyRows) })} />
          : null}
      </KpiRow>
      <section>
        <SectionTitle>{t('macro.latest')}</SectionTitle>
        <div className={css.factGrid}>
          {snapshot.latest.map(fact => <Kpi key={fact.label} label={fieldLabel(fact, t)} value={fact.value} />)}
        </div>
      </section>
      {snapshot.valuation.length > 0 ? (
        <section>
          <SectionTitle>{t('macro.valuation')}</SectionTitle>
          {snapshot.valuation.map(row => <MacroRow key={row.date ?? 'valuation'} row={row} t={t} />)}
        </section>
      ) : null}
      {snapshot.bondYield.length > 0 ? (
        <section>
          <SectionTitle>{t('macro.bondYield')}</SectionTitle>
          {snapshot.bondYield.map(row => <MacroRow key={row.date ?? 'bond-yield'} row={row} t={t} />)}
        </section>
      ) : null}
    </Card>
  )
}
