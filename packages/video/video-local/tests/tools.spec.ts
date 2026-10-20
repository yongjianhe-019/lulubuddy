/**
 * The model-facing video tools, driven through the real tool registry.
 *
 * The capability behind them is a stub, so what is asserted here is the tools'
 * own contract: the schemas a model reads, the arguments they forward, the text
 * they render, and the card payload they publish as presentation metadata.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { DEFAULT_VIDEO_TOOL_TIMEOUT_MS, Config, apply, inject, name, renderVideoDocument } from '../src/tools.ts'
import { VideoRuntime } from '../src/service.ts'
import { DEFAULT_VOICE, MAX_SCENES, MAX_NARRATION_CHARS } from '../src/contract.ts'
import type { VideoInvocation, VideoOutcome, VideoRender } from '../src/types.ts'

/** One render payload, as the provider builds it. */
const RENDER: VideoRender = {
  version: 1,
  output: '/tmp/project/out/标题.mp4',
  url: '/video/out/%E6%A0%87%E9%A2%98.mp4',
  bytes: 200373,
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 6792,
  title: '标题',
  voice: DEFAULT_VOICE,
  scenes: [{ index: 0, narration: '说话。', startMs: 0, endMs: 6792, cached: false }],
}

/** A capability that answers whatever the test tells it to, and records what it was asked. */
class StubVideo extends VideoRuntime {
  readonly seen: VideoInvocation[] = []
  constructor(ctx: Context, private readonly answer: (invocation: VideoInvocation) => VideoOutcome) {
    super(ctx)
  }

  override async invoke(invocation: VideoInvocation): Promise<VideoOutcome> {
    this.seen.push(invocation)
    return this.answer(invocation)
  }
}

/**
 * Boot the real tool registry over one stub capability.
 * @param answer - what the capability answers for one invocation.
 * @returns the context, the stub, and a caller that executes one tool.
 */
async function bench(answer: (invocation: VideoInvocation) => VideoOutcome = () => ({
  operation: 'create',
  document: { operation: 'create', output: RENDER.output },
  warnings: [],
  render: RENDER,
})): Promise<{
  ctx: Context
  stub: StubVideo
  call: (tool: string, args: Record<string, unknown>) => Promise<{ text: string; meta: unknown; isError: boolean }>
}> {
  const ctx = new Context()
  // The tool registry composes its schema list from the prompt sections, so it
  // waits for the system-prompt service rather than activating on its own.
  await ctx.plugin(SystemPrompt).await()
  await ctx.plugin(ToolRuntime).await()
  const stub = new StubVideo(ctx, answer)
  apply(ctx, {})
  return {
    ctx,
    stub,
    async call(tool, args) {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId(`spec-${tool}`),
        name: tool,
        arguments: args,
      })
      return {
        text: result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join(''),
        meta: result.meta,
        isError: result.isError,
      }
    },
  }
}

describe('the video tools registration', () => {
  it('names itself and the services it needs', () => {
    expect(name).toBe('video-tools')
    expect(inject).toEqual(['tools', 'video'])
    expect(Config({}).timeoutMs).toBe(DEFAULT_VIDEO_TOOL_TIMEOUT_MS)
  })

  it('publishes the three schemas a model reads', async () => {
    const { ctx } = await bench()
    const schemas = ctx.tools.schemas()
    expect(schemas.map(schema => schema.name).sort()).toEqual(['video_create', 'video_setup', 'video_voices'])
    const setup = schemas.find(schema => schema.name === 'video_setup')
    expect(setup?.description).toContain('idempotent')
    expect(setup?.description).toContain('browser')
    const voices = schemas.find(schema => schema.name === 'video_voices')
    expect(voices?.description).toContain('zh-CN')
    const create = schemas.find(schema => schema.name === 'video_create')
    // The limits a caller must respect are part of what a model reads, because
    // the failure a caller hits is a refusal that names them.
    const described = JSON.stringify(create)
    expect(described).toContain(String(MAX_SCENES))
    expect(described).toContain(String(MAX_NARRATION_CHARS))
    expect(described).toContain(DEFAULT_VOICE)
    expect(create?.description).toContain('video_setup')
  })
})

describe('video_setup', () => {
  it('runs the setup operation and renders its document', async () => {
    const { stub, call } = await bench(() => ({
      operation: 'setup',
      document: { operation: 'setup', project_root: '/tmp/project', ready: true },
      warnings: [],
      render: null,
    }))
    const result = await call('video_setup', {})
    expect(result.isError).toBe(false)
    expect(stub.seen).toEqual([{ operation: 'setup', arguments: {} }])
    expect(JSON.parse(/\{[\s\S]*\}/.exec(result.text)?.[0] ?? '{}')).toEqual({
      operation: 'setup',
      project_root: '/tmp/project',
      ready: true,
    })
  })
})

describe('video_voices', () => {
  it('forwards the locale and bounds what it reports', async () => {
    const { stub, call } = await bench(() => ({
      operation: 'voices',
      document: { operation: 'voices', locale: 'zh-CN', count: 1, voices: [{ id: DEFAULT_VOICE }] },
      warnings: ['no voice speaks fr-FR; edge-tts offers 2 voices in other locales'],
      render: null,
    }))
    const result = await call('video_voices', { locale: 'zh-CN' })
    expect(stub.seen).toEqual([{ operation: 'voices', arguments: { locale: 'zh-CN' } }])
    expect(result.text).toContain('Production warnings:\n- no voice speaks fr-FR')
    expect(result.text).toContain(`"id": "${DEFAULT_VOICE}"`)
  })
})

describe('video_create', () => {
  it('forwards a storyboard whole and reports the render', async () => {
    const { stub, call } = await bench()
    const result = await call('video_create', {
      title: '标题',
      subtitle: '副标题',
      voice: 'zh-CN-YunxiNeural',
      rate: '+10%',
      slug: 'my-video',
      scenes: [{ heading: '要点', narration: '说话。', bullets: ['一'], layout: 'stat' }],
    })
    expect(result.isError).toBe(false)
    expect(stub.seen).toEqual([{
      operation: 'create',
      arguments: {
        title: '标题',
        subtitle: '副标题',
        voice: 'zh-CN-YunxiNeural',
        rate: '+10%',
        slug: 'my-video',
        scenes: [{ heading: '要点', narration: '说话。', bullets: ['一'], layout: 'stat' }],
      },
    }])
    expect(result.text).toContain('"output": "/tmp/project/out/标题.mp4"')
    // The card payload keeps the playback URL, which a model has no use for.
    expect(result.text).not.toContain('/video/out/')
    expect(result.meta).toMatchObject({ version: 1, url: '/video/out/%E6%A0%87%E9%A2%98.mp4', bytes: 200373 })
  })

  it('omits the options a caller left out rather than sending them as null', async () => {
    const { stub, call } = await bench()
    await call('video_create', { title: '标题', scenes: [{ narration: '说话。' }] })
    expect(stub.seen[0]).toEqual({
      operation: 'create',
      arguments: { title: '标题', scenes: [{ narration: '说话。' }] },
    })
  })

  it('publishes nothing a card can draw when the render has no payload', async () => {
    const { call } = await bench(() => ({
      operation: 'create',
      document: { operation: 'create', output: '/tmp/x.mp4' },
      warnings: [],
      render: null,
    }))
    const result = await call('video_create', { title: '标题', scenes: [{ narration: '说话。' }] })
    expect(result.meta).toBeNull()
  })
})

describe('renderVideoDocument', () => {
  it('reads a warning that is not a string without losing it', () => {
    expect(renderVideoDocument({ operation: 'setup', warnings: [{ source: 'npm' }], video: null }))
      .toContain('- {"source":"npm"}')
  })

  it('renders a document with no warnings and no payload', () => {
    expect(renderVideoDocument({ operation: 'setup', warnings: [], video: null }))
      .toBe('```json\n{\n  "operation": "setup"\n}\n```')
  })
})
