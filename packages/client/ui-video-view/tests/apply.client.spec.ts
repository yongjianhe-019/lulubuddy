/**
 * The video view plugin's browser half: two keyed `tool.call.toolview`
 * registrations, the locale dictionaries, and fiber-teardown removal.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { VideoCreateView } from '../src/client/VideoCreateView.tsx'
import { VideoSetupView } from '../src/client/VideoSetupView.tsx'
import { apply as applyHost } from '../src/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** The slot registry plus the captured locale registration. */
interface PresentationCapture {
  slots: SlotRegistry
  dictionaries: Array<{ namespace: string; dictionaries: unknown }>
  localeDisposed: boolean
}

/**
 * Provide the presentation registries and capture the plugin's registrations.
 * @param ctx - the context to provide them on.
 * @returns what the registrations recorded.
 */
function providePresentation(ctx: Context): PresentationCapture {
  const slots = new SlotRegistry(ctx)
  slots.register({
    name: 'root',
    children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
  } as never, () => null)
  const capture: PresentationCapture = { slots, dictionaries: [], localeDisposed: false }
  ctx.provide('locale', {
    register(namespace: string, dictionaries: unknown) {
      capture.dictionaries.push({ namespace, dictionaries })
      return () => { capture.localeDisposed = true }
    },
  })
  return capture
}

/**
 * Boot the plugin over the captured presentation registries.
 * @returns the context, the capture, and the plugin's fiber.
 */
async function bench() {
  const ctx = new Context()
  const presentation = providePresentation(ctx)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  onTestFinished(async () => { await fiber.dispose() })
  await fiber.await()
  return { ctx, presentation, fiber }
}

describe('the video card dictionaries', () => {
  it('keeps both sides on the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('registers under the video namespace', () => {
    expect(NS).toBe('video')
  })
})

describe('video view registration', () => {
  it('keeps the host Loader entry inert', () => {
    expect(() => { applyHost() }).not.toThrow()
  })

  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers one keyed card per tool that publishes something to draw', async () => {
    const { presentation } = await bench()
    const entries = presentation.slots.entries('tool.call.toolview')
    expect(entries.map(entry => entry.options.key)).toEqual(['video_create', 'video_setup'])
    expect(entries.map(entry => entry.component)).toEqual([VideoCreateView, VideoSetupView])
    for (const entry of entries) expect(entry.locale).toBe(NS)
    expect(presentation.dictionaries).toHaveLength(1)
    expect(presentation.dictionaries[0]?.namespace).toBe(NS)
    expect(Object.keys(presentation.dictionaries[0]?.dictionaries as object)).toEqual(['zh', 'en'])
  })

  it('removes both cards and the dictionaries with its fiber', async () => {
    const { presentation, fiber } = await bench()
    expect(presentation.slots.entries('tool.call.toolview')).toHaveLength(2)
    await fiber.dispose()
    expect(presentation.slots.entries('tool.call.toolview')).toHaveLength(0)
    expect(presentation.localeDisposed).toBe(true)
  })
})
