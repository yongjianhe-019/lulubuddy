/**
 * ui-workbuddy-mode browser half on a real SlotRegistry: the plugin occupies
 * the conversation-declared `conversation.input.left` list seat, its injected
 * face runs the derived command lines in order and stops at the first failure,
 * and teardown empties the seat (HMR safety).
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { ModeControl } from '../src/client/ModeControl.tsx'
import type { ModeControlInjected } from '../src/client/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

const SID = 's-mode' as SessionId

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'conversation.input.left': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  const execute = vi.fn((_sessionId: SessionId, _line: string) =>
    Promise.resolve({ ok: true, value: { commandId: 'c1', result: { kind: 'success' as const } } }))
  const commandsRemote = { execute }
  ctx.provide('remote', { commands: commandsRemote })
  ctx.provide('remote.commands', commandsRemote)
  ctx.provide('locale', new LocaleRuntime(ctx))
  return { ctx, slots, execute }
}

const faceOf = (slots: SlotRegistry): ModeControlInjected => {
  const entry = slots.entries('conversation.input.left')[0]!
  return (entry.inject as unknown as (id: SessionId) => ModeControlInjected)(SID)
}

describe('ui-workbuddy-mode browser apply', () => {
  it('declares every service it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.commands', 'locale'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('waits until conversation declares the left input seat', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('remote', { commands: {} })
    ctx.provide('remote.commands', {})
    ctx.provide('locale', new LocaleRuntime(ctx))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('conversation.input.left')).toHaveLength(0)
    ctx.slots.register({
      name: 'root', children: { 'conversation.input.left': { kind: 'list', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    expect(ctx.slots.entries('conversation.input.left')).toHaveLength(1)
  })

  it('registers the control with its identity and copy, and unregisters on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = b.slots.entries('conversation.input.left')[0]!
    expect(entry.component).toBe(ModeControl)
    expect(entry.options).toMatchObject({ id: 'workbuddy-mode', order: 9 })
    expect(entry.locale).toBe('workbuddy.mode')

    await fiber.dispose()
    expect(b.slots.entries('conversation.input.left')).toHaveLength(0)
  })

  it('runs the derived lines in order and reports the first failure', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const face = faceOf(b.slots)

    await expect(face.runMode(['/plan off', '/permission read-only'])).resolves.toBeNull()
    expect(b.execute.mock.calls.map(call => call[1])).toEqual(['/plan off', '/permission read-only'])

    // Business failure folds to the composer-visible line and stops the sequence.
    b.execute.mockClear()
    b.execute.mockResolvedValueOnce({
      ok: false,
      error: new RemoteError('session/not-found', 'gone', { sessionId: SID }),
    } as never)
    await expect(face.runMode(['/plan off', '/permission read-only'])).resolves.toBe('gone (session/not-found)')
    expect(b.execute.mock.calls.map(call => call[1])).toEqual(['/plan off'])

    // Unmatched admission (the command is not composed host-side) is also a failure line.
    b.execute.mockClear()
    b.execute.mockResolvedValueOnce({ ok: true, value: undefined } as never)
    await expect(face.runMode(['/plan'])).resolves.toBe('unknown command: /plan')

    // An inert selection runs nothing.
    b.execute.mockClear()
    await expect(face.runMode([])).resolves.toBeNull()
    expect(b.execute).not.toHaveBeenCalled()
  })
})
