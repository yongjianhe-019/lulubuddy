/**
 * The read-only index data every WorkBuddy shell surface renders.
 *
 * A row is a statement of fact, not a control: the WorkBuddy surface on the
 * left and, on the right, either the DSH capability that backs it or the plain
 * statement that DSH has no counterpart. Nothing here can be clicked, because
 * none of these surfaces has a DSH write path to route a click to.
 */
import type { WorkBuddyShellKey } from './locales.ts'

/** One informational row: a WorkBuddy surface and what DSH has for it. */
export interface IndexRow {
  /** Stable row identity, and the `data-workbuddy-row` value the specs key on. */
  readonly id: string
  /** Locale key naming the WorkBuddy surface. */
  readonly nameKey: WorkBuddyShellKey
  /** Locale key for the DSH backing statement, or the statement of absence. */
  readonly backingKey: WorkBuddyShellKey
  /** Marks a row whose WorkBuddy surface has no DSH counterpart. */
  readonly absent?: true
}

/** The left navigation's capability rows, in WorkBuddy's own order. */
export const CAPABILITY_ROWS: readonly IndexRow[] = [
  { id: 'experts', nameKey: 'cap.experts.name', backingKey: 'cap.experts.backing' },
  { id: 'skills', nameKey: 'cap.skills.name', backingKey: 'cap.skills.backing' },
  { id: 'automation', nameKey: 'cap.automation.name', backingKey: 'cap.automation.backing' },
  { id: 'connectors', nameKey: 'cap.connectors.name', backingKey: 'cap.connectors.backing' },
  { id: 'memory', nameKey: 'cap.memory.name', backingKey: 'cap.memory.backing', absent: true },
]

/** The right results area's rows, in the order WorkBuddy presents them. */
export const RESULT_ROWS: readonly IndexRow[] = [
  { id: 'changes', nameKey: 'res.changes.name', backingKey: 'res.changes.backing' },
  { id: 'preview', nameKey: 'res.preview.name', backingKey: 'res.preview.backing' },
  { id: 'share', nameKey: 'res.share.name', backingKey: 'res.share.backing', absent: true },
]
