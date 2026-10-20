/**
 * Storyboard planning: the bounds a caller is held to, and the timeline every
 * scene is placed on.
 */

import { describe, expect, it } from 'vitest'
import { MAX_BULLETS, MAX_LINE_CHARS, MAX_NARRATION_CHARS, MAX_SCENES, SCENE_TAIL_MS } from '../src/contract.ts'
import { normalizeSpec, planVideo, slugify } from '../src/storyboard.ts'
import type { NarrationAudio } from '../src/storyboard.ts'
import type { VideoSpec } from '../src/types.ts'

/** The voice and rate a create call falls back to. */
const DEFAULTS = { voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%' }

/**
 * One scene's finished narration.
 * @param durationMs - the measured audio length.
 * @returns a narration with one cue covering it.
 */
function audio(durationMs: number): NarrationAudio {
  return {
    audioSrc: `narration/${String(durationMs)}.mp3`,
    durationMs,
    cues: [{ text: 'spoken', startMs: 100, endMs: durationMs - 100 }],
    cached: false,
  }
}

describe('slugify', () => {
  it('keeps letters, digits, and CJK while folding everything else', () => {
    expect(slugify('沪深300 估值：一次讲清')).toBe('沪深300-估值-一次讲清')
    expect(slugify('  spaced   out  ')).toBe('spaced-out')
    expect(slugify('!!!')).toBe('video')
    expect(slugify('')).toBe('video')
  })

  it('caps the stem it hands to a filename', () => {
    expect(slugify('甲'.repeat(80))).toHaveLength(48)
    // The cap must not leave a trailing hyphen behind.
    expect(slugify(`${'a'.repeat(47)}-tail`)).toBe('a'.repeat(47))
  })
})

describe('normalizeSpec', () => {
  it('applies the documented defaults', () => {
    const normalized = normalizeSpec({ title: '一次讲清', scenes: [{ narration: '开场。' }] }, DEFAULTS)
    expect(normalized).toEqual({
      title: '一次讲清',
      subtitle: null,
      voice: DEFAULTS.voice,
      rate: DEFAULTS.rate,
      slug: '一次讲清',
      scenes: [{ heading: null, narration: '开场。', bullets: [], layout: 'points' }],
    })
  })

  it('keeps every field a caller states', () => {
    const spec: VideoSpec = {
      title: '标题',
      subtitle: '副标题',
      voice: 'zh-CN-YunxiNeural',
      rate: '+10%',
      slug: 'my-video',
      scenes: [{ heading: '要点', narration: '说点什么。', bullets: ['一', '二'], layout: 'stat' }],
    }
    expect(normalizeSpec(spec, DEFAULTS)).toEqual({
      title: '标题',
      subtitle: '副标题',
      voice: 'zh-CN-YunxiNeural',
      rate: '+10%',
      slug: 'my-video',
      scenes: [{ heading: '要点', narration: '说点什么。', bullets: ['一', '二'], layout: 'stat' }],
    })
  })

  it('trims the text it is given', () => {
    const normalized = normalizeSpec({
      title: '  标题  ',
      scenes: [{ heading: '  要点  ', narration: '  说话。  ', bullets: ['  一  '] }],
    }, DEFAULTS)
    expect(normalized.title).toBe('标题')
    expect(normalized.scenes[0]).toMatchObject({ heading: '要点', narration: '说话。', bullets: ['一'] })
    expect(normalized.subtitle).toBeNull()
  })

  it('refuses a storyboard with no scene or too many', () => {
    expect(() => normalizeSpec({ title: 't', scenes: [] }, DEFAULTS)).toThrow(/scenes is empty/)
    const many = Array.from({ length: MAX_SCENES + 1 }, () => ({ narration: 'n' }))
    expect(() => normalizeSpec({ title: 't', scenes: many }, DEFAULTS)).toThrow(new RegExp(`limit is ${String(MAX_SCENES)}`))
  })

  it('refuses text past its published limit, naming the field', () => {
    expect(() => normalizeSpec({ title: ' ', scenes: [{ narration: 'n' }] }, DEFAULTS)).toThrow(/title is empty/)
    expect(() => normalizeSpec({ title: 'x'.repeat(MAX_LINE_CHARS + 1), scenes: [{ narration: 'n' }] }, DEFAULTS))
      .toThrow(/title is 41 characters/)
    expect(() => normalizeSpec({ title: 't', subtitle: 'x'.repeat(MAX_LINE_CHARS + 1), scenes: [{ narration: 'n' }] }, DEFAULTS))
      .toThrow(/subtitle is 41 characters/)
    expect(() => normalizeSpec({ title: 't', scenes: [{ narration: ' ' }] }, DEFAULTS)).toThrow(/scenes\[0\].narration is empty/)
    expect(() => normalizeSpec({ title: 't', scenes: [{ narration: 'x'.repeat(MAX_NARRATION_CHARS + 1) }] }, DEFAULTS))
      .toThrow(new RegExp(`limit is ${String(MAX_NARRATION_CHARS)}`))
    expect(() => normalizeSpec({ title: 't', scenes: [{ narration: 'n', heading: ' ' }] }, DEFAULTS))
      .toThrow(/scenes\[0\].heading is empty/)
    expect(() => normalizeSpec({ title: 't', scenes: [{ narration: 'n', bullets: [' '] }] }, DEFAULTS))
      .toThrow(/scenes\[0\].bullets\[0\] is empty/)
    expect(() => normalizeSpec({ title: 't', scenes: [{ narration: 'n', bullets: ['x'.repeat(MAX_LINE_CHARS + 1)] }] }, DEFAULTS))
      .toThrow(/bullets\[0\] is 41 characters/)
    expect(() => normalizeSpec({ title: 't', voice: ' ', scenes: [{ narration: 'n' }] }, DEFAULTS)).toThrow(/voice is empty/)
    expect(() => normalizeSpec({ title: 't', slug: ' ', scenes: [{ narration: 'n' }] }, DEFAULTS)).toThrow(/slug is empty/)
  })

  it('refuses a layout it cannot draw and too many bullets', () => {
    expect(() => normalizeSpec({
      title: 't',
      scenes: [{ narration: 'n', layout: 'timeline' as 'points' }],
    }, DEFAULTS)).toThrow(/layout is timeline/)
    const bullets = Array.from({ length: MAX_BULLETS + 1 }, (_, index) => `b${String(index)}`)
    expect(() => normalizeSpec({ title: 't', scenes: [{ narration: 'n', bullets }] }, DEFAULTS))
      .toThrow(new RegExp(`bullets carries ${String(MAX_BULLETS + 1)} entries`))
  })
})

describe('planVideo', () => {
  it('places every scene after the one before it, in milliseconds', () => {
    const spec = normalizeSpec({
      title: '标题',
      subtitle: '副标题',
      scenes: [
        { narration: '第一句。' },
        { heading: '要点', narration: '第二句。', bullets: ['一'] },
      ],
    }, DEFAULTS)
    const plan = planVideo(spec, [audio(2000), audio(3000)])
    expect(plan.durationMs).toBe(2000 + SCENE_TAIL_MS + 3000 + SCENE_TAIL_MS)
    expect(plan.scenes).toEqual([
      { index: 0, narration: '第一句。', startMs: 0, endMs: 2600, cached: false },
      { index: 1, heading: '要点', narration: '第二句。', startMs: 2600, endMs: 6200, cached: false },
    ])
    // The document the render project receives carries the same numbers the
    // model and the card read, so neither can disagree with the other.
    expect(plan.props).toEqual({
      version: 1,
      title: '标题',
      subtitle: '副标题',
      totalMs: 6200,
      scenes: [
        {
          heading: null,
          narration: '第一句。',
          bullets: [],
          layout: 'points',
          audio: 'narration/2000.mp3',
          durationMs: 2600,
          subtitles: [{ text: 'spoken', startMs: 100, endMs: 1900 }],
        },
        {
          heading: '要点',
          narration: '第二句。',
          bullets: ['一'],
          layout: 'points',
          audio: 'narration/3000.mp3',
          durationMs: 3600,
          subtitles: [{ text: 'spoken', startMs: 100, endMs: 2900 }],
        },
      ],
    })
  })

  it('reports a cached scene so a caller can tell reuse from synthesis', () => {
    const spec = normalizeSpec({ title: 't', scenes: [{ narration: 'n' }] }, DEFAULTS)
    const plan = planVideo(spec, [{ ...audio(1000), cached: true }])
    expect(plan.scenes[0]?.cached).toBe(true)
  })

  it('refuses a narration list that does not match the storyboard', () => {
    const spec = normalizeSpec({ title: 't', scenes: [{ narration: 'n' }] }, DEFAULTS)
    expect(() => planVideo(spec, [])).toThrow(/planned 0 narrations for 1 scenes/)
  })
})
