/**
 * The two facts a render's correctness rests on: how long a scene's narration
 * really is, and when each of its cues is spoken.
 *
 * The MPEG fixtures are synthesized from the format's own field layout, and the
 * narration fixture is real edge-tts output, so the parser is measured against
 * the file a deployment actually gets.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  clipCues,
  mp3DurationMs,
  narrationKey,
  parseSrt,
  parseVoiceList,
  sceneDurationMs,
} from '../src/narration.ts'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** Real edge-tts narration: 24 kHz mono Layer III, 48 kbit/s. */
const NARRATION = readFileSync(join(FIXTURES, 'narration.mp3'))

/** The subtitle document edge-tts wrote beside that narration. */
const SUBTITLES = readFileSync(join(FIXTURES, 'narration.srt'), 'utf8')

/** Samples per Layer III frame by MPEG version, as the format defines them. */
const FRAME_SAMPLES: Readonly<Record<number, number>> = { 0: 576, 2: 576, 3: 1152 }

/** Bitrate table by version, restated from the format so the fixture is not derived from the parser. */
const FRAME_BITRATES: Readonly<Record<number, readonly number[]>> = {
  0: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
}

/** Sample rates by version, restated from the format. */
const FRAME_RATES: Readonly<Record<number, readonly number[]>> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000],
}

/**
 * Build one Layer III frame of the length its own header declares.
 * @param versionBits - MPEG version bits.
 * @param bitrateCode - bitrate table index.
 * @param rateCode - sample-rate table index.
 * @param padding - the padding bit.
 * @returns the frame's bytes.
 */
function layer3Frame(versionBits: number, bitrateCode: number, rateCode: number, padding: 0 | 1 = 0): Uint8Array {
  const bitrate = (FRAME_BITRATES[versionBits] as readonly number[])[bitrateCode] as number
  const rate = (FRAME_RATES[versionBits] as readonly number[])[rateCode] as number
  const samples = FRAME_SAMPLES[versionBits] as number
  const length = Math.floor((samples / 8) * (bitrate * 1000) / rate) + padding
  const frame = new Uint8Array(length)
  frame[0] = 0xff
  frame[1] = 0xe0 | (versionBits << 3) | (0x01 << 1)
  frame[2] = (bitrateCode << 4) | (rateCode << 2) | (padding << 1)
  return frame
}

/**
 * Concatenate frames into one file.
 * @param frames - the frames, in file order.
 * @returns the whole file.
 */
function concat(frames: readonly Uint8Array[]): Uint8Array {
  const total = frames.reduce((sum, frame) => sum + frame.length, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const frame of frames) {
    bytes.set(frame, offset)
    offset += frame.length
  }
  return bytes
}

describe('narrationKey', () => {
  it('names one request and separates every field', () => {
    const key = narrationKey({ text: '你好', voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%' })
    expect(key).toMatch(/^[0-9a-f]{16}$/)
    expect(narrationKey({ text: '你好', voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%' })).toBe(key)
    expect(narrationKey({ text: '你好', voice: 'zh-CN-XiaoxiaoNeural', rate: '+10%' })).not.toBe(key)
    expect(narrationKey({ text: '再见', voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%' })).not.toBe(key)
    expect(narrationKey({ text: '你好', voice: 'zh-CN-YunxiNeural', rate: '+0%' })).not.toBe(key)
    // Without a separator these two requests would concatenate alike.
    expect(narrationKey({ text: 'c', voice: 'ab', rate: '' }))
      .not.toBe(narrationKey({ text: 'bc', voice: 'a', rate: '' }))
  })
})

describe('parseSrt', () => {
  it('reads the cues edge-tts wrote beside the narration', () => {
    expect(parseSrt(SUBTITLES)).toEqual([
      { text: '第一句，市场估值处于历史中位。', startMs: 100, endMs: 3265 },
      { text: '第二句，耐心等待更好的价格。', startMs: 3215, endMs: 6136 },
    ])
  })

  it('joins a cue written across several lines and reads either decimal mark', () => {
    const cues = parseSrt([
      '1',
      '0:00:01.5 --> 00:00:03,050',
      'first line',
      'second line',
      '',
      '2',
      '00:00:03,050 --> 00:00:04,5',
      'tail',
    ].join('\r\n'))
    expect(cues).toEqual([
      { text: 'first line second line', startMs: 1500, endMs: 3050 },
      { text: 'tail', startMs: 3050, endMs: 4500 },
    ])
  })

  it('ignores text with no timing, and a cue that carries no words', () => {
    expect(parseSrt('stray text\n\n1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\nwords\n'))
      .toEqual([{ text: 'words', startMs: 3000, endMs: 4000 }])
    expect(parseSrt('')).toEqual([])
  })
})

describe('clipCues', () => {
  it('cuts a cue at the next cue instead of drawing both', () => {
    expect(clipCues(parseSrt(SUBTITLES))).toEqual([
      { text: '第一句，市场估值处于历史中位。', startMs: 100, endMs: 3215 },
      { text: '第二句，耐心等待更好的价格。', startMs: 3215, endMs: 6136 },
    ])
  })

  it('orders by start and drops a cue the cut empties', () => {
    expect(clipCues([
      { text: 'late', startMs: 500, endMs: 900 },
      { text: 'early', startMs: 100, endMs: 200 },
      // A cue that never had a window of its own is dropped rather than drawn
      // for no frames.
      { text: 'empty', startMs: 300, endMs: 300 },
    ])).toEqual([
      { text: 'early', startMs: 100, endMs: 200 },
      { text: 'late', startMs: 500, endMs: 900 },
    ])
  })

  it('cuts a cue that starts where the previous one does to nothing', () => {
    expect(clipCues([
      { text: 'first', startMs: 200, endMs: 900 },
      { text: 'second', startMs: 200, endMs: 1200 },
    ])).toEqual([{ text: 'second', startMs: 200, endMs: 1200 }])
  })
})

describe('mp3DurationMs', () => {
  it('measures the real narration from its frames', () => {
    // The fixture's last cue ends at 6.136 s and the file is 6.192 s: a scene
    // sized from the subtitles alone would clip the final syllable.
    const measured = mp3DurationMs(NARRATION)
    expect(measured).toBeGreaterThanOrEqual(6136)
    expect(measured).toBeLessThan(6600)
  })

  it('measures every MPEG version layer III names, padding included', () => {
    const lowRate = [layer3Frame(2, 6, 1), layer3Frame(2, 6, 1, 1), layer3Frame(2, 6, 1)]
    // 576 samples at 24 kHz is 24 ms a frame.
    expect(mp3DurationMs(concat(lowRate))).toBe(72)
    const v1 = Array.from({ length: 2 }, () => layer3Frame(3, 9, 0))
    // 1152 samples at 44.1 kHz is 26.123 ms a frame, rounded up in total.
    expect(mp3DurationMs(concat(v1))).toBe(53)
    const v25 = Array.from({ length: 3 }, () => layer3Frame(0, 1, 2))
    // 576 samples at 8 kHz is 72 ms a frame.
    expect(mp3DurationMs(concat(v25))).toBe(216)
  })

  it('skips an ID3v2 tag and any byte that starts no frame', () => {
    const tag = new Uint8Array(10)
    tag.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    const frames = Array.from({ length: 2 }, () => layer3Frame(2, 6, 1))
    expect(mp3DurationMs(concat([tag, ...frames]))).toBe(48)
    // Leading bytes that are not frames are stepped over until one is found.
    expect(mp3DurationMs(concat([new Uint8Array([0x00, 0x01, 0x02]), ...frames]))).toBe(48)
  })

  it('refuses a file with no measurable frame', () => {
    expect(() => mp3DurationMs(new Uint8Array([0x00, 0x01]))).toThrow(/no MPEG Layer III frame/)
    // A `free` bitrate code names no length, so the header is not a frame.
    expect(() => mp3DurationMs(new Uint8Array([0xff, 0xfa, 0x00, 0x00]))).toThrow(/no MPEG Layer III frame/)
    // Nor does the `bad` code.
    expect(() => mp3DurationMs(new Uint8Array([0xff, 0xfa, 0xf0, 0x00]))).toThrow(/no MPEG Layer III frame/)
    // Sample-rate code 3 is reserved.
    expect(() => mp3DurationMs(new Uint8Array([0xff, 0xfa, 0x9c, 0x00]))).toThrow(/no MPEG Layer III frame/)
    // Version bits `1` are reserved.
    expect(() => mp3DurationMs(new Uint8Array([0xff, 0xea, 0x60, 0x00]))).toThrow(/no MPEG Layer III frame/)
    // Layer bits other than III name a layer this parser does not measure.
    expect(() => mp3DurationMs(new Uint8Array([0xff, 0xf8, 0x60, 0x00]))).toThrow(/no MPEG Layer III frame/)
    expect(() => mp3DurationMs(new Uint8Array([0xff, 0xfc, 0x60, 0x00]))).toThrow(/no MPEG Layer III frame/)
    // Eleven sync bits are required before a version is even read.
    expect(() => mp3DurationMs(new Uint8Array([0xfe, 0xfa, 0x60, 0x00]))).toThrow(/no MPEG Layer III frame/)
  })
})

describe('parseVoiceList', () => {
  it('reads the rows edge-tts prints and skips its header and rule', () => {
    const table = [
      'Name                               Gender    ContentCategories      VoicePersonalities',
      '---------------------------------  --------  ---------------------  --------------------------------------',
      'zh-CN-XiaoxiaoNeural               Female    News, Novel            Warm',
      'zh-CN-YunxiNeural                  Male      Novel                  Lively, Sunshine',
    ].join('\n')
    expect(parseVoiceList(table)).toEqual([
      { id: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN', gender: 'Female', categories: 'News, Novel' },
      { id: 'zh-CN-YunxiNeural', locale: 'zh-CN', gender: 'Male', categories: 'Novel' },
    ])
  })

  it('keeps a row whose trailing columns are empty', () => {
    expect(parseVoiceList('en-US-AnaNeural\n')).toEqual([
      { id: 'en-US-AnaNeural', locale: 'en-US', gender: 'Unknown', categories: '' },
    ])
  })

  it('reads a locale whose voice name carries a region suffix', () => {
    expect(parseVoiceList('zh-CN-liaoning-XiaobeiNeural  Female  General')).toEqual([
      { id: 'zh-CN-liaoning-XiaobeiNeural', locale: 'zh-CN', gender: 'Female', categories: 'General' },
    ])
  })
})

describe('sceneDurationMs', () => {
  it('holds the scene open after the narration ends', () => {
    expect(sceneDurationMs(6136, 600)).toBe(6736)
  })
})
