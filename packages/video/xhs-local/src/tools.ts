/**
 * The model-facing Xiaohongshu publication tool: one call packages a finished
 * video and its copy into the files the operating brief requires, runs both
 * publication gates, updates the manual, and returns the payload the Web card
 * draws.
 *
 * The tool is mounted by the `xiaohongshu` agent preset. The provider row lives
 * on the host plane because only a deployment can name the manual and asset
 * directories.
 *
 * @module @deepseek-ai/dsh-xhs-local/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { XHS_PAYLOAD_VERSION } from './contract.ts'
import type { XhsPostResult, XhsPublishRequest } from './types.ts'

/** Stable Loader identity. */
export const name = 'xhs-tools'

/** Services used by the model-facing publication tool. */
export const inject = ['tools', 'xhs']

/** Per-call budget, longer than the longest gate. */
export interface Config {
  /** Wall-clock budget for one publication, in milliseconds. Defaults to 240000. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().step(1).min(1).default(240_000),
})

/** The open-object output schema every publication document satisfies. */
const DOCUMENT_SCHEMA = { type: 'object', additionalProperties: true } as const

/**
 * Format a duration in milliseconds as seconds with one decimal.
 * @param ms - the duration.
 * @returns the seconds.
 */
function seconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1)
}

/**
 * The card payload: the publication result without the full gate transcripts,
 * which the model already received in the result text.
 * @param result - the provider's result.
 * @returns the narrow card document.
 */
function cardMeta(result: XhsPostResult): JsonValue {
  return {
    version: XHS_PAYLOAD_VERSION,
    number: result.number,
    topic: result.topic,
    title: result.title,
    body: result.body,
    tags: result.tags,
    pinnedComment: result.pinnedComment,
    video: result.video,
    checks: {
      detect: {
        passed: result.checks.detect.passed,
        exitCode: result.checks.detect.exitCode,
        verdict: result.checks.detect.verdict,
        hits: result.checks.detect.hits,
      },
      scan: {
        passed: result.checks.scan.passed,
        exitCode: result.checks.scan.exitCode,
        hard: result.checks.scan.hard,
        soft: result.checks.scan.soft,
      },
    },
    files: result.files,
    warnings: result.warnings,
    createdAt: result.createdAt,
  } as unknown as JsonValue
}

/**
 * Render the model-facing summary of one publication.
 * @param result - the provider's result.
 * @returns the summary text.
 */
function renderResult(result: XhsPostResult): string {
  const lines = [
    `Xiaohongshu post #${String(result.number)} is packaged: ${result.topic}`,
    `Title: ${result.title}`,
    `Video: ${result.video.path} (${seconds(result.video.durationMs)}s, ${String(result.video.width)}x${String(result.video.height)}, ${String(result.video.fps)}fps)`,
    `Checks: detect ${result.checks.detect.verdict} (${String(result.checks.detect.hits)} hits); scan hard ${String(result.checks.scan.hard)}, soft ${String(result.checks.scan.soft)}`,
    `Draft: ${result.files.draft}`,
    `Publish copy: ${result.files.publish}`,
  ]
  for (const warning of result.warnings) lines.push(`Warning: ${warning}`)
  lines.push('Not published. The user copies the title, body, tags, and pinned comment into Xiaohongshu manually.')
  return lines.join('\n')
}

/**
 * Register the Xiaohongshu publication tool.
 * @param ctx - context carrying the tool registry and the `ctx.xhs` capability.
 * @param timeoutMs - per-call budget enforced by the tool-call timeout policy.
 */
export function registerXhsTools(ctx: Context, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'xhs_post',
    description: [
      'Package one finished Xiaohongshu post. Call this only after the video exists and the copy is written.',
      'It writes the production draft and the publish copy, copies the video into the served asset directory, runs the de-AI scan and the outbound-contact scan, updates the operating manual, and returns the payload the post card draws.',
      'It does not publish: the user copies the title, body, hashtags, and pinned comment into Xiaohongshu manually.',
      'If a gate rejects the copy, the call fails with the gate output and writes no post files; revise the copy and call it again.',
      'The number must be the next post number in the manual. Keep the title at 20 characters or fewer, the body at 1000 characters or fewer, and 3 to 8 hashtags.',
    ].join(' '),
    parameters: {
      number: { type: 'integer', required: true, description: 'Post number in the operating manual, such as 17.' },
      topic: { type: 'string', required: true, description: 'Short topic used for the post folder and the video file stem.' },
      title: { type: 'string', required: true, description: 'Main title, at most 20 characters.' },
      body: { type: 'string', required: true, description: 'Publish copy, at most 1000 characters; it must not repeat the video scene by scene.' },
      tags: { type: 'array', required: true, items: { type: 'string' }, description: 'Three to eight hashtags, with or without a leading #.' },
      pinnedComment: { type: 'string', required: true, description: 'Pinned comment shown under the post.' },
      videoPath: { type: 'string', required: true, description: 'Absolute path of the finished MP4. The tool measures it with ffprobe.' },
    },
    output: {
      schema: DOCUMENT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderResult(value as unknown as XhsPostResult) }],
      presentationMeta: (_args, value) => cardMeta(value as unknown as XhsPostResult),
    },
    timeoutMs,
    async execute(args, exec) {
      const request: XhsPublishRequest = {
        number: args.number,
        topic: args.topic,
        title: args.title,
        body: args.body,
        tags: args.tags,
        pinnedComment: args.pinnedComment,
        videoPath: args.videoPath,
      }
      return await ctx.xhs.publish(request, exec.signal) as unknown as Record<string, JsonValue>
    },
  }))
}

/**
 * Mount the Xiaohongshu tool over the deployment's `ctx.xhs` provider.
 * @param ctx - context carrying the tool registry and the capability.
 * @param config - the per-call timeout budget.
 */
export function apply(ctx: Context, config: Config): void {
  registerXhsTools(ctx, (config as Required<Config>).timeoutMs)
}
