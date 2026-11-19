/**
 * Douyin explainer tools: vertical 1080x1920 knowledge shorts over the local
 * `vibe-knowledge` + `cine` pipeline.
 *
 * The capability lives in Python (edge-tts voice, cine frame capture, ffmpeg
 * mix, QA). This module owns only the model-facing contracts: two tools, their
 * schemas, and the JSON the driver returns.
 *
 * @module @deepseek-ai/dsh-douyin-local/tools
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'douyin-tools'

/** The capability registry this entry registers into. */
export const inject = ['tools']

/** Default cooperative budget: a two-minute vertical render takes minutes. */
export const DEFAULT_TIMEOUT_MS = 3_600_000

/** Plugin config: where the local pipeline lives. */
export interface Config {
  /** Series directory holding `cine/`, used as the scaffold template. */
  templateDir: string
  /** Python that has the cine dependencies (numpy, scipy, playwright). */
  python: string
  /** `tts.py` from the installed ai-teardown skill. */
  ttsScript: string
  /** `qa.py` from the installed vibe-knowledge skill. */
  qaScript: string
  /** Default material index the agent picks topics from. */
  materialIndex: string
  /** Per-call budget. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  templateDir: z.string().default(`${process.env.HOME ?? ''}/PycharmProjects/teaching-video/works/ctx-forget`),
  python: z.string().default(`${process.env.HOME ?? ''}/.venvs/cine/bin/python`),
  ttsScript: z.string().default(`${process.env.HOME ?? ''}/.agents/skills/ai-teardown/engine/scripts/tts.py`),
  qaScript: z.string().default(`${process.env.HOME ?? ''}/.agents/skills/vibe-knowledge/tools/qa.py`),
  materialIndex: z.string().default('https://www.jxxy.net/ai/categories/ai-tools-models/'),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
})

/** Where the bundled Python driver sits, next to the compiled module. */
function driverPath(): string {
  return fileURLToPath(new URL('../../python/driver.py', import.meta.url))
}

/** One driver run's machine-readable result. */
interface DriverResult {
  ok?: boolean
  error?: string
  [key: string]: unknown
}

/** Run the driver and resolve its final JSON line. */
function runDriver(args: string[], signal?: AbortSignal): Promise<DriverResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.DOUYIN_PYTHON ?? 'python3', [driverPath(), ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString() })
    const abort = () => { child.kill('SIGTERM') }
    signal?.addEventListener('abort', abort, { once: true })
    child.on('error', reject)
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort)
      const line = out.trim().split('\n').filter(l => l.startsWith('{')).pop()
      if (line === undefined) {
        reject(new Error(`driver produced no result (exit ${String(code)}): ${err.slice(-800) || out.slice(-800)}`))
        return
      }
      try {
        resolve(JSON.parse(line) as DriverResult)
      } catch (error) {
        reject(new Error(`driver returned malformed JSON: ${String(error)}`))
      }
    })
  })
}

/** Render a driver result as the text the model reads. */
function summarise(value: DriverResult): string {
  if (value.error !== undefined) return `失败：${value.error}`
  const lines = Object.entries(value)
    .filter(([key]) => key !== 'ok')
    .map(([key, v]) => `${key}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  return lines.join('\n')
}

/** The driver's JSON is open-ended: paths and QA numbers ride along per call. */
const RESULT_SCHEMA = { type: 'object', additionalProperties: true } as const

/**
 * Register the two Douyin tools.
 * @param ctx - the agent's context.
 * @param config - deployment paths.
 */
export function apply(ctx: Context, config: Config): void {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  ctx.tools.register(defineTool({
    name: 'douyin_scaffold',
    description: [
      'Create a Douyin explainer project: copies the cine template (vertical film skeleton, render tools, fonts) into the workspace.',
      'Call it once per video, before writing narration.json and film-v.js.',
      'It returns the project directory and the paths you must fill: lessons/<id>/narration.json and lessons/<id>/film-v.js.',
    ].join(' '),
    parameters: {
      project: { type: 'string', required: true, description: 'Folder name under the workspace, such as ctx-forget-02.' },
      title: { type: 'string', description: 'Working title, written into series.json.' },
      lesson: { type: 'string', description: 'Lesson id to create. Defaults to "01".' },
    },
    output: { schema: RESULT_SCHEMA, render: (_a, v) => [{ type: 'text', text: summarise(v) }] },
    timeoutMs,
    async execute(args, exec) {
      return await runDriver([
        'scaffold',
        '--project', args.project,
        '--lesson', args.lesson ?? '01',
        '--title', args.title ?? '',
        '--template', config.templateDir,
        '--python', config.python,
      ], exec.signal) as never
    },
  }))

  ctx.tools.register(defineTool({
    name: 'douyin_render',
    description: [
      'Render one vertical 1080x1920 Douyin explainer: synthesise the narration, align it, capture every frame, mix narration plus the chosen BGM, and run QA.',
      'Reads lessons/<id>/narration.json and lessons/<id>/film-v.js. No sound effects are added: narration and BGM only.',
      'It returns the mp4 path, duration, loudness, true peak, and whether any frame held longer than three seconds.',
      'A two-minute video takes roughly half an hour; call douyin_scaffold first.',
    ].join(' '),
    parameters: {
      project: { type: 'string', required: true, description: 'Project folder created by douyin_scaffold.' },
      lesson: { type: 'string', required: true, description: 'Lesson id holding narration.json and film-v.js.' },
      bgm: { type: 'string', description: 'BGM file path. Defaults to the lesson\'s assets/audio/bgm.mp3.' },
      every: { type: 'number', description: 'QA contact-sheet sampling interval in seconds. Defaults to 4.' },
    },
    output: { schema: RESULT_SCHEMA, render: (_a, v) => [{ type: 'text', text: summarise(v) }] },
    timeoutMs,
    async execute(args, exec) {
      return await runDriver([
        'render',
        '--project', args.project,
        '--lesson', args.lesson,
        '--python', config.python,
        '--tts', config.ttsScript,
        '--qa', config.qaScript,
        ...(args.bgm === undefined ? [] : ['--bgm', args.bgm]),
        ...(args.every === undefined ? [] : ['--every', String(args.every)]),
      ], exec.signal) as never
    },
  }))

  ctx.systemPrompt.section({
    name: 'douyin-local',
    order: 90,
    text: [
      '抖音竖屏科普默认按这条产线走：douyin_scaffold 建工程 → 写 narration.json 与 film-v.js → douyin_render 出片。',
      `没有指定素材时，从 ${config.materialIndex} 里挑一个当天可讲的 AI 工具或模型条目，并在片中标注来源。`,
      '成片是 1080x1920、无音效、只有旁白与 BGM；BGM 按内容情绪选，不用默认曲。',
    ].join('\n'),
  })
}
