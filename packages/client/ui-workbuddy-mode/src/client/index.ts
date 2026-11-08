/**
 * WorkBuddy mode plugin, browser half: the Ask / Plan / Craft segmented control
 * in the composer's left input strip. Both axes it reads are host-computed
 * projections — plan mode and the permission select — and every write goes
 * through the ordinary command channel (`/plan`, `/permission`), so the control
 * adds no session state and no model-visible input of its own.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the session-scope standard kit (useProjection) into the seat props.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ModeControlInjected } from './ModeControl.tsx'
import { ModeControl } from './ModeControl.tsx'
import { en, zh, type ModeKey } from './locales.ts'

export type { ModeControlInjected, ModeControlProps } from './ModeControl.tsx'
export type { WorkBuddyMode } from './mode.ts'
export {
  deriveMode, modeCommands, READ_ONLY_PRESET, WORKBUDDY_MODES, WRITE_PRESET,
} from './mode.ts'
export type { ModeKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer mode control's copy. */
    'workbuddy.mode': ModeKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'workbuddy.mode'

/** Required services: the seat's slot registry, commands Remote, and locale registry. */
export const inject = ['slots', 'remote', 'remote.commands', 'locale']

/**
 * Client plugin body: register the mode control over the command channel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbuddy-mode: dictionaries')

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'workbuddy-mode',
    order: 9,
    locale: NS,
    inject: (sessionId: SessionId): ModeControlInjected => ({
      // Failure strings stay English (error-surface policy: not localized).
      runMode: async (lines) => {
        for (const line of lines) {
          const result = await ctx.remote.commands.execute(sessionId, line, [])
          if (!result.ok) return `${result.error.message} (${result.error.code})`
          if (result.value === undefined) return `unknown command: ${line}`
        }
        return null
      },
    }),
  }, ModeControl))
}
