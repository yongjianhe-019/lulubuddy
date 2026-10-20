/**
 * Body of the left navigation's capability panel, registered into the layout's
 * root-scoped keyed `main` slot under this package's id. The sidebar row whose
 * id matches this key selects it. The surface is a read-only index: it states
 * which DSH capability stands behind each WorkBuddy capability and where DSH has
 * none, and offers no control, because no WorkBuddy capability here has a DSH
 * write path.
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-layout SlotMap merge (the root-scoped keyed 'main' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { CAPABILITY_ROWS } from './index-data.ts'
import { IndexPanel } from './IndexPanel.tsx'

/** Full component props: the `main` runtime share plus the locale seat. */
export type CapabilityIndexProps = PropsRuntime<'main'> & PropsLocale<'workbuddy.shell'>

/**
 * Render the capability index.
 * @param props - composed slot props; only the locale seat carries data.
 * @returns the capability index element tree.
 */
export function CapabilityIndex({ t }: CapabilityIndexProps): ReactNode {
  return <IndexPanel t={t} titleKey="capability.title" leadKey="capability.lead" rows={CAPABILITY_ROWS} />
}
