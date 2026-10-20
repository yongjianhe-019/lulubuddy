/**
 * Real Loader composition: a test-only cordis.yml mounts both entries of the
 * finance package over the real tool registry and the real local subprocess
 * provider, and the only mocked boundary is the external Python process (a stub
 * interpreter that answers the documented bridge protocol). The test asserts the
 * model-visible tool result, which is what a deployment's 金融服务 agent
 * receives from a session composed on the finance preset.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FinanceLocal from '@deepseek-ai/dsh-finance-local'
import * as FinanceTools from '@deepseek-ai/dsh-finance-local/tools'

/** The stub bridge: one canned reply per operation, keyed off the request text. */
const STUB_BRIDGE = `#!/bin/sh
request=$(cat)
case "$request" in
  *csi300_analysis*)
    printf '%s' '{"ok":true,"operation":"csi300_analysis","document":{"index":"沪深300","total_score":61.5,"ice_point":true},"warnings":["stub valuation source unavailable"]}'
    ;;
  *)
    printf '%s' '{"ok":true,"operation":"refresh","document":{"force":false},"warnings":[]}'
    ;;
esac
`

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** Build the throwaway deployment, the test-only cordis.yml, and boot the Loader. */
async function boot(overrides: { readonly stockMarketRoot?: string } = {}): Promise<Context> {
  root = mkdtempSync(join(tmpdir(), 'dsh-finance-loader-'))
  const stockRoot = overrides.stockMarketRoot ?? join(root, 'stock')
  if (overrides.stockMarketRoot === undefined) {
    mkdirSync(join(stockRoot, 'data'), { recursive: true })
    writeFileSync(join(stockRoot, 'data', 'fetcher.py'), '')
  }
  const interpreter = join(root, 'stub-python')
  writeFileSync(interpreter, STUB_BRIDGE)
  chmodSync(interpreter, 0o755)

  const configPath = join(root, 'cordis.yml')
  writeFileSync(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-subprocess-local'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-finance-local'",
    '  config:',
    `    stockMarketPython: '${interpreter}'`,
    `    stockMarketRoot: '${stockRoot}'`,
    "- name: '@deepseek-ai/dsh-finance-local/tools'",
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-subprocess-local', LocalSubprocessRuntime],
    ['@deepseek-ai/dsh-session-projection', SessionProjection],
    ['@deepseek-ai/dsh-finance-local', FinanceLocal],
    ['@deepseek-ai/dsh-finance-local/tools', FinanceTools],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

describe('finance-local real Loader composition', () => {
  it.skipIf(process.platform === 'win32')('registers the tools and returns the bridge document to the model', async () => {
    const ctx = await boot()
    expect(ctx.get('finance')).toBeDefined()
    expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual([
      'csi2000_analysis',
      'csi300_analysis',
      'macro_snapshot',
      'market_data_refresh',
      'market_timing_signal',
    ])

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('loader-csi300'),
      name: 'csi300_analysis',
      arguments: {},
    })
    expect(result.isError).toBe(false)
    const text = result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
    expect(text).toContain('Data warnings:\n- stub valuation source unavailable')
    expect(text).toContain('"index": "沪深300"')
    expect(text).toContain('"total_score": 61.5')
  })

  it.skipIf(process.platform === 'win32')('fails the Loader when the configured project marker is missing', async () => {
    await expect(boot({ stockMarketRoot: join(tmpdir(), 'dsh-finance-absent') }))
      .rejects.toThrow(/stockMarketRoot is not a directory/)
  })
})
