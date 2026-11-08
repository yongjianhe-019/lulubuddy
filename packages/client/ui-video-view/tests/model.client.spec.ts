/**
 * Narrowing a video tool result: the model-facing document, the production
 * notes, and the render payload a card draws.
 *
 * The payload crosses the tool-result boundary as unknown JSON, so every member
 * is re-established here and anything that does not narrow is dropped whole.
 */

import { describe, expect, it } from 'vitest'
import {
  asRecord, extractDocument, extractWarnings, fileSize, isSettled, readRenderPayload,
  readSetupDocument, renderFromBlock, resultText, seconds,
} from '../src/client/model.ts'
import { document, meta, rendered, renderedBlock, running, settled } from './fixtures.client.ts'

describe('reading a tool result', () => {
  it('reports a running call as unsettled and a settled one as its result', () => {
    expect(isSettled(running())).toBe(false)
    expect(isSettled(renderedBlock())).toBe(true)
    expect(resultText(running())).toBeNull()
  })

  it('joins the text blocks a settled result carries', () => {
    expect(resultText(settled('first'))).toBe('first')
    const mixed = settled('', {
      content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'x' }],
    } as never)
    expect(resultText(mixed)).toBe('a\n{\n  "type": "image",\n  "data": "x"\n}')
  })

  it('reads an empty settled result as no text', () => {
    expect(resultText(settled('', { content: [] }))).toBeNull()
  })
})

describe('extractDocument', () => {
  it('reads the fenced body of a rendered document', () => {
    expect(extractDocument(rendered('create'))).toEqual(document('create'))
  })

  it('reads a bare object and refuses everything else', () => {
    expect(extractDocument('{"a":1}')).toEqual({ a: 1 })
    expect(extractDocument('not json')).toBeNull()
    expect(extractDocument('[1,2]')).toBeNull()
    // Truncated JSON is ordinary input at this boundary.
    expect(extractDocument('{"a":')).toBeNull()
    expect(asRecord(null)).toBeNull()
    expect(asRecord([])).toBeNull()
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
  })
})

describe('extractWarnings', () => {
  it('reads the preamble and the embedded array, deduplicated', () => {
    const text = [
      'Production warnings:',
      '- no playback route is mounted',
      '- scene 2 produced no subtitle cue',
      '',
      '```json',
      '{"operation":"create","warnings":["no playback route is mounted"]}',
      '```',
    ].join('\n')
    expect(extractWarnings(text, { warnings: ['no playback route is mounted'] })).toEqual([
      'no playback route is mounted',
      'scene 2 produced no subtitle cue',
    ])
  })

  it('ignores a preamble with no notes and a document with no array', () => {
    expect(extractWarnings('no fence at all', {})).toEqual([])
    expect(extractWarnings('```json\n{}\n```', { warnings: 'nope' })).toEqual([])
    expect(extractWarnings('```json\n{}\n```', { warnings: [1, 'kept', null] })).toEqual(['kept'])
  })
})

describe('readRenderPayload', () => {
  it('narrows the payload a live render published', () => {
    const render = readRenderPayload(meta('create'))
    expect(render).toMatchObject({
      url: '/video/out/real-render-check.mp4',
      output: '/Users/hyj/.dsh/video/out/real-render-check.mp4',
      bytes: 1277851,
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 8112,
      title: '真机渲染验证',
      voice: 'zh-CN-XiaoxiaoNeural',
    })
    // Scenes are numbered for a reader, from one, whatever the payload carries.
    expect(render?.scenes).toEqual([
      { index: 1, heading: null, narration: '第一句，市场估值处于历史中位。', startMs: 0, endMs: 4200, cached: true },
      { index: 2, heading: '两个要点', narration: '第二句，耐心等待更好的价格。', startMs: 4200, endMs: 8112, cached: true },
    ])
  })

  it('keeps a payload with no playback route', () => {
    expect(readRenderPayload({ ...meta('create'), url: null })?.url).toBeNull()
  })

  it('refuses a value that is not a payload of this revision', () => {
    expect(readRenderPayload(null)).toBeNull()
    expect(readRenderPayload([])).toBeNull()
    expect(readRenderPayload('payload')).toBeNull()
    expect(readRenderPayload({ ...meta('create'), version: 2 })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), version: undefined })).toBeNull()
  })

  it('refuses a payload missing any member a card reads', () => {
    for (const member of ['output', 'title', 'voice', 'bytes', 'width', 'height', 'fps', 'durationMs']) {
      expect(readRenderPayload({ ...meta('create'), [member]: undefined })).toBeNull()
    }
    expect(readRenderPayload({ ...meta('create'), output: '' })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), title: 12 })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), voice: null })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), bytes: -1 })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), fps: 0 })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), width: 0 })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), height: 0 })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), durationMs: Number.NaN })).toBeNull()
    expect(readRenderPayload({ ...meta('create'), url: 7 })).toBeNull()
  })

  it('refuses a scene list it cannot read whole', () => {
    const payload = meta('create')
    expect(readRenderPayload({ ...payload, scenes: [] })).toBeNull()
    expect(readRenderPayload({ ...payload, scenes: 'none' })).toBeNull()
    expect(readRenderPayload({ ...payload, scenes: Array.from({ length: 65 }, (_, index) => ({ index, narration: 'n', startMs: 0, endMs: 1 })) })).toBeNull()
    expect(readRenderPayload({ ...payload, scenes: [null] })).toBeNull()
    // The index a scene claims must be its own position.
    expect(readRenderPayload({ ...payload, scenes: [{ index: 3, narration: 'n', startMs: 0, endMs: 1 }] })).toBeNull()
    expect(readRenderPayload({ ...payload, scenes: [{ index: 0 }] })).toBeNull()
    expect(readRenderPayload({ ...payload, scenes: [{ index: 0, narration: 'n', startMs: 5, endMs: 1 }] })).toBeNull()
    expect(readRenderPayload({ ...payload, scenes: [{ index: 0, narration: 'n', startMs: -1, endMs: 1 }] })).toBeNull()
    expect(readRenderPayload({ ...payload, scenes: [{ index: 0, narration: 'n', startMs: 0, endMs: 1, heading: 5 }] })).toBeNull()
  })

  it('reads a cached flag as true only when it is exactly true', () => {
    const payload = meta('create')
    const scene = { index: 0, narration: 'n', startMs: 0, endMs: 1, cached: 'yes' }
    expect(readRenderPayload({ ...payload, scenes: [scene] })?.scenes[0]?.cached).toBe(false)
  })

  it('reads the payload off a settled node and nothing off a running one', () => {
    expect(renderFromBlock(renderedBlock())?.title).toBe('真机渲染验证')
    expect(renderFromBlock(running())).toBeNull()
    expect(renderFromBlock(settled(rendered('create')))).toBeNull()
  })
})

describe('readSetupDocument', () => {
  it('narrows the report a prepared environment produced', () => {
    expect(readSetupDocument(document('setup'))).toEqual({
      projectRoot: '/Users/hyj/.dsh/video',
      remotionVersion: '4.0.529',
      edgeTtsVersion: '7.2.8',
      laidTemplate: true,
      installedPackages: true,
      browserReady: true,
    })
  })

  it('reports an unknown version and an unprepared step as such', () => {
    expect(readSetupDocument({
      project_root: '/tmp/video',
      remotion_version: null,
      edge_tts_version: '',
      laid_template: false,
      installed_packages: 'yes',
      browser_ready: false,
    })).toEqual({
      projectRoot: '/tmp/video',
      remotionVersion: null,
      edgeTtsVersion: null,
      laidTemplate: false,
      installedPackages: false,
      browserReady: false,
    })
  })

  it('refuses a document with no project', () => {
    expect(readSetupDocument({ ready: true })).toBeNull()
    expect(readSetupDocument({ project_root: '' })).toBeNull()
  })
})

describe('unit formatters', () => {
  it('reads a duration to one decimal place of a second', () => {
    expect(seconds(8112)).toBe('8.1')
    expect(seconds(0)).toBe('0.0')
    expect(seconds(49)).toBe('0.0')
  })

  it('reads a size in the unit it belongs to', () => {
    expect(fileSize(1_277_851)).toEqual({ unit: 'megabytes', value: '1.3' })
    expect(fileSize(20_373)).toEqual({ unit: 'kilobytes', value: '20' })
  })
})
