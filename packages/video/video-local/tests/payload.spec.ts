/**
 * Narrowing the render payload a card draws: the payload crosses the tool-result
 * boundary, so every member is re-established here and anything that does not
 * narrow is dropped whole.
 */

import { describe, expect, it } from 'vitest'
import { readVideoRender } from '../src/payload.ts'

/** One valid payload, as the provider builds it. */
function payload(): Record<string, unknown> {
  return {
    version: 1,
    output: '/tmp/video/out/x.mp4',
    url: '/video/out/x.mp4',
    bytes: 1024,
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 6200,
    title: '标题',
    voice: 'zh-CN-XiaoxiaoNeural',
    scenes: [
      { index: 0, narration: '第一句。', startMs: 0, endMs: 2600, cached: false },
      { index: 1, heading: '要点', narration: '第二句。', startMs: 2600, endMs: 6200, cached: true },
    ],
  }
}

/**
 * Apply one change to a copy of the valid payload.
 * @param change - the members to overwrite; a member set to undefined is removed.
 * @returns the changed payload.
 */
function changed(change: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...payload(), ...change }).filter(([, value]) => value !== undefined),
  )
}

describe('readVideoRender', () => {
  it('narrows the payload the provider built', () => {
    expect(readVideoRender(payload())).toEqual({
      version: 1,
      output: '/tmp/video/out/x.mp4',
      url: '/video/out/x.mp4',
      bytes: 1024,
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 6200,
      title: '标题',
      voice: 'zh-CN-XiaoxiaoNeural',
      scenes: [
        { index: 0, narration: '第一句。', startMs: 0, endMs: 2600, cached: false },
        { index: 1, heading: '要点', narration: '第二句。', startMs: 2600, endMs: 6200, cached: true },
      ],
    })
  })

  it('keeps a payload with no playback route and no heading', () => {
    const value = readVideoRender(changed({
      url: null,
      scenes: [{ index: 0, narration: 'n', startMs: 0, endMs: 10, cached: false }],
    }))
    expect(value?.url).toBeNull()
    expect(value?.scenes[0]?.heading).toBeUndefined()
  })

  it('refuses a value that is not a payload of this revision', () => {
    expect(readVideoRender(null)).toBeNull()
    expect(readVideoRender([])).toBeNull()
    expect(readVideoRender('payload')).toBeNull()
    expect(readVideoRender(changed({ version: 2 }))).toBeNull()
    expect(readVideoRender(changed({ version: undefined }))).toBeNull()
  })

  it('refuses a payload missing any member a card reads', () => {
    for (const member of ['output', 'title', 'voice', 'bytes', 'width', 'height', 'fps', 'durationMs']) {
      expect(readVideoRender(changed({ [member]: undefined }))).toBeNull()
    }
    expect(readVideoRender(changed({ output: '' }))).toBeNull()
    expect(readVideoRender(changed({ title: 12 }))).toBeNull()
    expect(readVideoRender(changed({ voice: null }))).toBeNull()
    expect(readVideoRender(changed({ bytes: -1 }))).toBeNull()
    expect(readVideoRender(changed({ fps: 0 }))).toBeNull()
    expect(readVideoRender(changed({ width: 0 }))).toBeNull()
    expect(readVideoRender(changed({ height: 0 }))).toBeNull()
    expect(readVideoRender(changed({ durationMs: Number.NaN }))).toBeNull()
    expect(readVideoRender(changed({ url: 7 }))).toBeNull()
  })

  it('refuses a scene list it cannot read whole', () => {
    expect(readVideoRender(changed({ scenes: [] }))).toBeNull()
    expect(readVideoRender(changed({ scenes: 'none' }))).toBeNull()
    expect(readVideoRender(changed({
      scenes: Array.from({ length: 65 }, (_, index) => ({ index, narration: 'n', startMs: 0, endMs: 1, cached: false })),
    }))).toBeNull()
    expect(readVideoRender(changed({ scenes: [null] }))).toBeNull()
    // The index a scene claims must be its own position.
    expect(readVideoRender(changed({ scenes: [{ index: 3, narration: 'n', startMs: 0, endMs: 1, cached: false }] }))).toBeNull()
    expect(readVideoRender(changed({ scenes: [{ index: 0 }] }))).toBeNull()
    expect(readVideoRender(changed({ scenes: [{ index: 0, narration: 'n', startMs: 5, endMs: 1, cached: false }] }))).toBeNull()
    expect(readVideoRender(changed({ scenes: [{ index: 0, narration: 'n', startMs: -1, endMs: 1, cached: false }] }))).toBeNull()
    expect(readVideoRender(changed({ scenes: [{ index: 0, narration: 'n', startMs: 0, endMs: 1, cached: false, heading: 5 }] }))).toBeNull()
  })

  it('reads a cached flag as true only when it is exactly true', () => {
    const scene = { index: 0, narration: 'n', startMs: 0, endMs: 1, cached: 'yes' }
    expect(readVideoRender(changed({ scenes: [scene] }))?.scenes[0]?.cached).toBe(false)
  })
})
