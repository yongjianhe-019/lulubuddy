/**
 * Glyph of the left navigation's capability row, registered into
 * `sidebar.panellist`. The sidebar owns the button, its accessible name (the
 * list entry's `label`), and the active state; this component draws only the
 * glyph at the requested size.
 */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCordisPluginOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-sidebar SlotMap merge (the sidebar.panellist seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './CapabilityIcon.module.css'

/**
 * Render the capability row's glyph.
 * @param props - the owner's icon share: requested size and selection state.
 * @returns the glyph element.
 */
export function CapabilityIcon({ size, active }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <IconCordisPluginOutlineMedium size={size} className={clsx(css.glyph, active && css.active)} />
}
