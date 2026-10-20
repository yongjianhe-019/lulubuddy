/**
 * Test fixtures shared by the finance card specs. The `.rendered.txt` files are
 * the exact text `renderFinanceDocument` produced from live `finance_bridge.py`
 * runs on 2026-09-19 (see the package README's Dev Note), so each spec drives
 * the components with real measured documents rather than hand-written ones.
 * The `.bridge.json` files keep the raw bridge response for provenance.
 *
 * `fixtures/charts/` holds a second generation: one `.rendered.txt` and one
 * `.meta.json` per operation, both written from the same live run, so a chart
 * window and a scored document are always read together as one run produced
 * them. They are kept apart from the 2026-09-19 documents because those are
 * what the score-card assertions pin, and each spec names the window its own
 * fixture carries.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

/** Settled Tool result node as ui-tool supplies it. */
export type SettledBlock = Extract<ToolCallViewProps['block'], { kind: 'tool-result' }>

/** Running Tool call node as ui-tool supplies it. */
export type RunningBlock = Exclude<ToolCallViewProps['block'], { kind: 'tool-result' }>

const FIXTURES = resolve(import.meta.dirname, 'fixtures')

/**
 * The exact host-rendered tool-output text of one measured bridge document.
 * @param name - fixture stem, e.g. `csi300`.
 * @returns the text a settled tool result carries.
 */
export function fixtureText(name: string): string {
  return readFileSync(resolve(FIXTURES, `${name}.rendered.txt`), 'utf8')
}

/**
 * The raw measured bridge document, for provenance assertions.
 * @param name - fixture stem, e.g. `csi300`.
 * @returns the bridge response's `document` object.
 */
export function bridgeDocument(name: string): Record<string, unknown> {
  const response = JSON.parse(readFileSync(resolve(FIXTURES, `${name}.bridge.json`), 'utf8')) as {
    document: Record<string, unknown>
  }
  return response.document
}

/**
 * A settled Tool result node carrying one text block.
 * @param text - the tool result's text.
 * @param over - field overrides for the node.
 * @returns the settled node.
 */
export function settled(text: string, over: Partial<SettledBlock> = {}): SettledBlock {
  return {
    kind: 'tool-result',
    seq: 3,
    time: 3_000,
    callId: 'call-finance',
    name: 'csi300_analysis',
    args: {} as never,
    call: { name: 'csi300_analysis', argsRaw: '{}' },
    callTime: 2_000,
    content: [{ type: 'text', text }],
    isError: false,
    subCalls: [],
    ...over,
  }
}

/**
 * A running Tool call node.
 * @param name - the wire tool name.
 * @returns the running node.
 */
export function running(name = 'csi300_analysis'): RunningBlock {
  return { callId: 'call-finance', name, args: {} as never, phase: 'start', argsRaw: '{}', turn: 1, step: 1, time: 2_000, subCalls: [] }
}

/**
 * The raw chart payload one measured run published, for specs that drive a
 * surface reading the session projection rather than a Tool result node.
 * @param name - chart fixture stem, e.g. `csi300`.
 * @returns the run's `charts` member.
 */
export function chartFixtureMeta(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, 'charts', `${name}.meta.json`), 'utf8')) as unknown
}

/**
 * A settled Tool result node carrying one measured run's text and chart payload.
 * @param name - chart fixture stem, e.g. `csi300`.
 * @param over - field overrides for the node.
 * @returns the settled node with its presentation metadata attached.
 */
export function settledCharts(name: string, over: Partial<SettledBlock> = {}): SettledBlock {
  const directory = resolve(FIXTURES, 'charts')
  return settled(readFileSync(resolve(directory, `${name}.rendered.txt`), 'utf8'), {
    meta: JSON.parse(readFileSync(resolve(directory, `${name}.meta.json`), 'utf8')) as never,
    ...over,
  })
}
