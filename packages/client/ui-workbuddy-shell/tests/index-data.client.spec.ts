/** The two read-only index row sets: WorkBuddy's surfaces in WorkBuddy's order, each naming its DSH backing or absence. */
import { describe, expect, it } from 'vitest'
import { CAPABILITY_ROWS, RESULT_ROWS } from '../src/client/index-data.ts'

describe('index rows', () => {
  it('names every WorkBuddy capability in order, marking the one DSH lacks', () => {
    expect(CAPABILITY_ROWS.map(row => [row.id, row.nameKey, row.backingKey, row.absent === true])).toEqual([
      ['experts', 'cap.experts.name', 'cap.experts.backing', false],
      ['skills', 'cap.skills.name', 'cap.skills.backing', false],
      ['automation', 'cap.automation.name', 'cap.automation.backing', false],
      ['connectors', 'cap.connectors.name', 'cap.connectors.backing', false],
      ['memory', 'cap.memory.name', 'cap.memory.backing', true],
    ])
  })

  it('names every WorkBuddy results surface in order, marking the one DSH lacks', () => {
    expect(RESULT_ROWS.map(row => [row.id, row.nameKey, row.backingKey, row.absent === true])).toEqual([
      ['changes', 'res.changes.name', 'res.changes.backing', false],
      ['preview', 'res.preview.name', 'res.preview.backing', false],
      ['share', 'res.share.name', 'res.share.backing', true],
    ])
  })
})
