/**
 * Model-facing video tools over `ctx.video`, mounted as the package's `tools`
 * entry so a session's agent is what sees them. This module owns the tool
 * schemas, result presentation, and the per-call timeout budget; the capability
 * itself stays behind the seam, so a different provider changes none of these
 * contracts.
 *
 * @module @deepseek-ai/dsh-video-local/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  DEFAULT_VOICE,
  MAX_BULLETS,
  MAX_LINE_CHARS,
  MAX_NARRATION_CHARS,
  MAX_SCENES,
} from './contract.ts'
import { readVideoRender } from './payload.ts'
import type { VideoRuntime } from './service.ts'
import type { VideoOutcome, VideoSpec } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'video-tools'

/**
 * The capability this entry presents and the registry it registers into. Both
 * are host-plane services, so a preset mounts this row over the deployment's
 * own provider rather than starting one.
 */
export const inject = ['tools', 'video']

/** Default cooperative tool-call timeout budget, in milliseconds. */
export const DEFAULT_VIDEO_TOOL_TIMEOUT_MS = 2_400_000

/** Plugin config: the per-call budget the tool-call timeout policy enforces. */
export interface Config {
  /**
   * Cooperative timeout budget attached to every video tool. It must not be
   * shorter than the provider's own longest bound, or the tool-call policy would
   * cancel a process the provider still considers within budget. Defaults to
   * 2400000, which covers a first setup followed by a render.
   */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_VIDEO_TOOL_TIMEOUT_MS),
})

/**
 * Project one outcome into the canonical tool value: the operation's document,
 * the production facts the model must weigh, and the payload its card draws.
 * The facts and the payload are the two members a model must not read, so
 * {@link renderVideoDocument} is what decides the model-facing half.
 * @param outcome - the seam's outcome for one invocation.
 * @returns the canonical value the output schema validates.
 */
function toolValue(outcome: VideoOutcome): Record<string, JsonValue> {
  return {
    ...outcome.document,
    warnings: [...outcome.warnings],
    // The payload is JSON by construction (`create` built it from narrowed
    // input) and the output schema is an open object.
    video: outcome.render as unknown as JsonValue,
  }
}

/**
 * Render one canonical video value as model-facing text: the production
 * warnings first, then the document as JSON.
 *
 * The document is emitted whole because the model's next decision — which scene
 * to rewrite, whether the length is right, where the file is — turns on the
 * per-scene timings it carries; a hand-written summary would drop them. The card
 * payload is the one member left out: it exists so a browser can play the file,
 * and the model needs the file's own path instead.
 * @param value - the canonical tool output value.
 * @returns one text block.
 */
export function renderVideoDocument(value: Record<string, JsonValue>): string {
  const { warnings, video: _card, ...document } = value
  const parts: string[] = []
  if (Array.isArray(warnings) && warnings.length > 0) {
    parts.push(`Production warnings:\n${warnings.map(warning => `- ${renderWarning(warning)}`).join('\n')}`)
  }
  parts.push(`\`\`\`json\n${JSON.stringify(document, null, 2)}\n\`\`\``)
  return parts.join('\n\n')
}

/**
 * Render one warning for the model. The provider produces strings, so the
 * non-string arm exists only because the canonical value's element type is
 * `JsonValue`; JSON keeps such a value readable rather than rendering it as
 * `[object Object]`.
 * @param warning - one entry of the outcome's warnings array.
 * @returns the warning text.
 */
function renderWarning(warning: JsonValue): string {
  return typeof warning === 'string' ? warning : JSON.stringify(warning)
}

/**
 * Publish one tool value's render as the call's presentation metadata, so the
 * card can play it on the live path and on a session-log replay alike.
 * @param value - the canonical tool value.
 * @returns the narrowed render payload.
 */
function videoMeta(value: JsonValue): JsonValue {
  // The output schema is an object and the value is validated against it before
  // this projector runs, so what arrives here is what `toolValue` built.
  return readVideoRender((value as Record<string, JsonValue>)['video']) as unknown as JsonValue
}

/** The shared open-object output spec: every video document is one JSON object. */
const DOCUMENT_SCHEMA = { type: 'object', additionalProperties: true } as const

/** The scene fields every storyboard entry may carry, as the tool schema states them. */
const SCENE_PARAMETERS = {
  heading: { type: 'string', description: `Short heading drawn above the bullets, at most ${String(MAX_LINE_CHARS)} characters.` },
  narration: { type: 'string', required: true, description: `The words spoken in this scene, at most ${String(MAX_NARRATION_CHARS)} characters. They are also the scene's subtitles, so write what a listener should hear.` },
  bullets: { type: 'array', items: { type: 'string' }, description: `Supporting lines shown under the heading, at most ${String(MAX_BULLETS)} of them and ${String(MAX_LINE_CHARS)} characters each.` },
  layout: { type: 'string', enum: ['title', 'points', 'quote', 'stat'], description: 'How the scene arranges its text. Defaults to points.' },
} as const

/**
 * Register the video tools.
 *
 * Every tool is left at the registry's default exclusive scheduling: a render
 * writes the project's shared cache and bundle, so overlapping calls would race
 * on those files.
 * @param ctx - context whose `tools` registry receives the registrations.
 * @param video - the capability instance every tool invocation goes through.
 * @param timeoutMs - per-tool wall-clock budget enforced by the tool-call timeout policy.
 */
export function registerVideoTools(ctx: Context, video: VideoRuntime, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'video_setup',
    description: 'Prepare the machine that renders videos: lay down the configured Remotion render project, install the packages it needs, install the narration voice, and download the browser a render drives. It is idempotent but slow the first time. Call it once before the first video_create, and again only when a create call reports the project is not ready.',
    parameters: {},
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderVideoDocument(value) }],
    },
    timeoutMs,
    async execute(_args, exec) {
      return toolValue(await video.invoke({ operation: 'setup', arguments: {} }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'video_voices',
    description: 'List the narration voices available for one language. Pass the locale the video is spoken in, such as zh-CN or en-US, and use one of the returned ids as video_create\'s voice.',
    parameters: {
      locale: { type: 'string', required: true, description: 'BCP-47 locale to list voices for, such as zh-CN.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderVideoDocument(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      return toolValue(await video.invoke({ operation: 'voices', arguments: { locale: args.locale } }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'video_create',
    description: [
      'Render one vertical 1080x1920 narrated short video from a storyboard.',
      `Write the storyboard yourself: at most ${String(MAX_SCENES)} scenes, each with the words spoken (narration), an optional heading, and optional supporting bullets.`,
      'The narration is synthesized into speech and becomes the scene\'s subtitles, so it must read as something a presenter would say out loud; the heading and bullets are what the viewer reads.',
      'Use one layout per scene: title for the opening card, points for a heading with bullets, quote for one sentence given the whole card, stat for a scene built around a number that opens the heading.',
      'The call synthesizes every scene, measures the resulting audio, plans the timeline, and renders the file. It returns the video\'s path, its measured duration, and each scene\'s start, end, and length. Present the result with the present tool so the user receives the file.',
      'Call video_setup first: this tool refuses a machine that is not prepared.',
    ].join(' '),
    parameters: {
      title: { type: 'string', required: true, description: `Video title, drawn on the opening card and used as the file name, at most ${String(MAX_LINE_CHARS)} characters.` },
      subtitle: { type: 'string', description: `Line drawn under the title on the opening card, at most ${String(MAX_LINE_CHARS)} characters.` },
      scenes: { type: 'array', required: true, items: { type: 'object', properties: SCENE_PARAMETERS, additionalProperties: false }, description: `Scenes in play order, at most ${String(MAX_SCENES)}.` },
      voice: { type: 'string', description: `edge-tts voice id from video_voices. Defaults to ${DEFAULT_VOICE}.` },
      rate: { type: 'string', description: 'Speaking-rate adjustment, such as +10% or -5%. Defaults to the voice\'s own rate.' },
      slug: { type: 'string', description: 'File name stem for the rendered video. Defaults to a slug of the title.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderVideoDocument(value) }],
      presentationMeta: (_args, value) => videoMeta(value),
    },
    timeoutMs,
    async execute(args, exec) {
      // The storyboard is assembled under its own type so the optional members
      // are omitted rather than set to undefined, which a strict optional
      // contract distinguishes.
      const spec: VideoSpec = {
        title: args.title,
        scenes: args.scenes,
        ...args.subtitle === undefined ? {} : { subtitle: args.subtitle },
        ...args.voice === undefined ? {} : { voice: args.voice },
        ...args.rate === undefined ? {} : { rate: args.rate },
        ...args.slug === undefined ? {} : { slug: args.slug },
      }
      return toolValue(await video.invoke({ operation: 'create', arguments: spec }, exec.signal))
    },
  }))
}

/**
 * Mount the video tools over the deployment's `ctx.video` provider.
 * @param ctx - context carrying the tool registry and the capability.
 * @param config - the per-call timeout budget.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  registerVideoTools(ctx, ctx.video, (config as Required<Config>).timeoutMs)
}
