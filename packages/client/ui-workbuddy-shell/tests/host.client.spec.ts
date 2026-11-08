/** The shell plugin's host half contributes no host behavior. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply } from '@deepseek-ai/dsh-client-ui-workbuddy-shell'

describe('ui-workbuddy-shell host', () => {
  it('mounts and disposes without touching any host service', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    await fiber.dispose()
    expect(ctx.get('settings')).toBeUndefined()
  })
})
