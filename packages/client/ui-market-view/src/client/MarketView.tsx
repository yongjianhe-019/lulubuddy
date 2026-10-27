import { useMemo } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { modelFromBlock, pct, resultText } from './model.ts'
import css from './MarketView.module.css'

export type MarketViewProps = ToolCallViewProps & PropsLocale<'market'>

export function MarketView({ block, t }: MarketViewProps) {
  const model = useMemo(() => modelFromBlock(block), [block])
  if (model === null) {
    return (
      <section className={css.card} data-market-view>
        <header className={css.header}><span className={css.title}>{t('card.title')}</span></header>
        <pre className={css.raw}>{resultText(block) ?? t('state.empty')}</pre>
      </section>
    )
  }
  const above20 = model.indices.filter(index => index.aboveMa20).length
  const above60 = model.indices.filter(index => index.aboveMa60).length
  return (
    <section className={css.card} data-market-view>
      <header className={css.header}>
        <span className={css.title}>{t('card.title')}</span>
        <span className={css.asOf}>{t('kpi.asOf')} {model.asOf || '—'}</span>
      </header>
      <p className={css.summary}>{model.summary}</p>
      <div className={css.kpis}>
        <span className={css.kpi}>
          <span className={css.kpiLabel}>{t('kpi.above20')}</span>
          <span className={css.kpiValue}>{above20} / {model.indices.length}</span>
        </span>
        <span className={css.kpi}>
          <span className={css.kpiLabel}>{t('kpi.above60')}</span>
          <span className={css.kpiValue}>{above60} / {model.indices.length}</span>
        </span>
        <span className={css.kpi}>
          <span className={css.kpiLabel}>{t('kpi.total')}</span>
          <span className={css.kpiValue}>{model.indices.length}</span>
        </span>
      </div>
      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>{t('table.index')}</th><th>{t('table.close')}</th><th>{t('table.change')}</th>
              <th>{t('table.ret20')}</th><th>{t('table.retYtd')}</th><th>{t('table.ma20')}</th>
              <th>{t('table.ma60')}</th><th>{t('table.volume')}</th>
            </tr>
          </thead>
          <tbody>
            {model.indices.map(index => (
              <tr key={index.name}>
                <td>{index.name}</td>
                <td>{index.close.toFixed(2)}</td>
                <td className={index.changePct >= 0 ? css.up : css.down}>{index.changePct.toFixed(2)}%</td>
                <td className={index.ret20 >= 0 ? css.up : css.down}>{pct(index.ret20)}</td>
                <td className={index.retYtd >= 0 ? css.up : css.down}>{pct(index.retYtd)}</td>
                <td>
                  {index.ma20.toFixed(2)} <span className={index.aboveMa20 ? css.ok : css.bad}>{index.aboveMa20 ? '↑' : '↓'}</span>
                </td>
                <td>
                  {index.ma60.toFixed(2)} <span className={index.aboveMa60 ? css.ok : css.bad}>{index.aboveMa60 ? '↑' : '↓'}</span>
                </td>
                <td>{index.volumeRatio.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {model.warnings.length === 0 ? null : (
        <ul className={css.warnings}>
          {model.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      <div className={css.footer}><span>{t('source', { value: model.source })}</span><span>{t('note')}</span></div>
    </section>
  )
}
