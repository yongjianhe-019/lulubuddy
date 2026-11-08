/**
 * Test fixtures shared by the video card specs.
 *
 * The `.json` files are the two halves a live render produced on 2026-09-27
 * through the shipped driver, edge-tts, and Remotion 4.0.529: the document the
 * model read and the payload the card drew, from the same `video_create` call.
 * The tool text is recomposed from them the way the host renders it, so a spec
 * drives the components with measured values rather than invented ones.
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
 * Read one measured fixture.
 * @param name - file name inside `fixtures/`.
 * @returns the file's text.
 */
function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8')
}

/**
 * One measured operation's JSON document.
 * @param name - fixture stem, e.g. `create`.
 * @returns the document the model read.
 */
export function document(name: string): Record<string, unknown> {
  return JSON.parse(fixture(`${name}.document.json`)) as Record<string, unknown>
}

/**
 * One measured render's card payload.
 * @param name - fixture stem, e.g. `create`.
 * @returns the payload the card drew.
 */
export function meta(name: string): Record<string, unknown> {
  return JSON.parse(fixture(`${name}.meta.json`)) as Record<string, unknown>
}

/**
 * The host-rendered tool text of one measured document.
 * @param name - fixture stem, e.g. `create`.
 * @returns the text a settled tool result carries.
 */
export function rendered(name: string): string {
  return `\`\`\`json\n${JSON.stringify(document(name), null, 2)}\n\`\`\``
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
    callId: 'call-video',
    call: { name: 'video_create', argsRaw: '{}' },
    callTime: 2_000,
    content: [{ type: 'text', text }],
    isError: false,
    subCalls: [],
    ...over,
  } as unknown as SettledBlock
}

/**
 * A settled Tool result node carrying the measured render.
 * @returns the settled node with the measured payload as its metadata.
 */
export function renderedBlock(): SettledBlock {
  return settled(rendered('create'), { meta: meta('create') })
}

/**
 * A running Tool call node, which has no result and so carries no `kind`: the
 * absent discriminant is what {@link isSettled} reads.
 * @returns the running node.
 */
export function running(): RunningBlock {
  return {
    callId: 'call-video',
    name: 'video_create',
    args: {} as never,
    phase: 'start',
    argsRaw: '{}',
    turn: 1,
    step: 1,
    time: 2_000,
    subCalls: [],
  }
}
