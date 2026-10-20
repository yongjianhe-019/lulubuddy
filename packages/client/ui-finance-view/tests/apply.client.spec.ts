/**
 * Finance view browser half: five keyed `tool.call.toolview` registrations, the
 * locale dictionaries, and fiber-teardown removal (HMR safety).
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { FinanceTurnTail } from '../src/client/FinanceTurnTail.tsx'
import { Csi2000AnalysisView, Csi300AnalysisView } from '../src/client/IndexAnalysisView.tsx'
import { MacroSnapshotView } from '../src/client/MacroSnapshotView.tsx'
import { MarketDataRefreshView } from '../src/client/MarketDataRefreshView.tsx'
import { MarketTimingView } from '../src/client/MarketTimingView.tsx'
import { apply as applyHost } from '../src/index.ts'

/** The slot registry plus the captured locale registration. */
interface PresentationCapture {
  slots: SlotRegistry
  dictionaries: Array<{ namespace: string; dictionaries: unknown }>
  localeDisposed: boolean
}

/** Provide the presentation registries and capture the plugin's registrations. */
function providePresentation(ctx: Context): PresentationCapture {
  const slots = new SlotRegistry(ctx)
  slots.register({
    name: 'root',
    children: {
      'tool.call.toolview': { kind: 'keyed', scope: 'session' },
      'conversation.chat.turnTail': { kind: 'chain', scope: 'session' },
    },
  } as never, () => null)
  const capture: PresentationCapture = {
    slots,
    dictionaries: [],
    localeDisposed: false,
  }
  ctx.provide('locale', {
    register(namespace: string, dictionaries: unknown) {
      capture.dictionaries.push({ namespace, dictionaries })
      return () => { capture.localeDisposed = true }
    },
  })
  return capture
}

/** Boot the plugin over the captured presentation registries. */
async function bench() {
  const ctx = new Context()
  const presentation = providePresentation(ctx)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  onTestFinished(async () => { await fiber.dispose() })
  await fiber.await()
  return { ctx, presentation, fiber }
}

describe('finance view registration', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers one keyed card per finance tool plus both dictionaries', async () => {
    const { presentation } = await bench()
    const entries = presentation.slots.entries('tool.call.toolview')
    expect(entries.map(entry => entry.options.key)).toEqual([
      'csi300_analysis',
      'csi2000_analysis',
      'market_timing_signal',
      'macro_snapshot',
      'market_data_refresh',
    ])
    expect(entries.map(entry => entry.component)).toEqual([
      Csi300AnalysisView, Csi2000AnalysisView, MarketTimingView, MacroSnapshotView, MarketDataRefreshView,
    ])
    for (const entry of entries) expect(entry.locale).toBe('finance')
    expect(presentation.dictionaries).toHaveLength(1)
    expect(presentation.dictionaries[0]?.namespace).toBe('finance')
    expect(Object.keys(presentation.dictionaries[0]?.dictionaries as object)).toEqual(['zh', 'en'])
  })

  it('registers the turn footer, which sits outside the process fold', async () => {
    const { presentation } = await bench()
    const entries = presentation.slots.entries('conversation.chat.turnTail')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.component).toBe(FinanceTurnTail)
    expect(entries[0]?.locale).toBe('finance')
    // A chain entry claims the owners it renders for; this one claims each
    // closing turn and decides in the body whether it has charts to draw.
    const owner = { turn: { turn: 4 }, seq: 12, openFile: () => {} }
    expect(entries[0]?.select?.(owner as never)).toBe(owner)
  })

  it('removes every registration on disposal (HMR safety)', async () => {
    const { presentation, fiber } = await bench()
    expect(presentation.slots.entries('tool.call.toolview')).toHaveLength(5)
    expect(presentation.slots.entries('conversation.chat.turnTail')).toHaveLength(1)
    await fiber.dispose()
    expect(presentation.slots.entries('tool.call.toolview')).toHaveLength(0)
    expect(presentation.slots.entries('conversation.chat.turnTail')).toHaveLength(0)
    expect(presentation.localeDisposed).toBe(true)
  })
})

describe('node half', () => {
  it('is an empty host plugin body', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(applyHost).not.toThrow()
  })
})
