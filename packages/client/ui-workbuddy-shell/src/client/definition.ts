/**
 * Stage one of this package's registration: what the results tab type IS.
 *
 * The type is a page, not a viewer: it claims no address. The guide page offers
 * it as an entry box, and its body draws the read-only index of the WorkBuddy
 * results surfaces. The type's `id` is also the key its body and title register
 * under, and the id of the sidebar capability row that selects the left panel.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** This package's identity in the tab system, the key its seats register under, and its main-panel id. */
export const SHELL_ID = '@deepseek-ai/dsh-client-ui-workbuddy-shell'

/** The tab kind this package owns. */
export const SHELL_KIND = 'workbuddy-results'

/**
 * The results type's registry definition.
 *
 * The band is left at the registry default: `builtin` belongs to the surfaces
 * the shipped composition seeds, and claiming it would let this tab outrank the
 * Files type when a session seeds a tab. No guide entry is advertised either —
 * this surface is a passive index, so it has nothing to offer the Start page
 * that a user would pick to open it.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function shellDefinition(t: TranslateNS<'workbuddy.shell'>): SidebarRightTabDefinition {
  return {
    id: SHELL_ID,
    kind: SHELL_KIND,
    title: () => t('results.tab'),
  }
}
