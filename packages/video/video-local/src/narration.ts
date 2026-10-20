/**
 * What the host half derives from a storyboard's text and from the audio
 * edge-tts returns: the cache key that makes synthesis incremental, the cue
 * timings a scene's subtitles are drawn from, the spoken length of one audio
 * file, and the voice table a caller picks from.
 *
 * Every function here is pure over its arguments. The timings a render depends
 * on are therefore decided by this tested code rather than by the composition.
 *
 * @module @deepseek-ai/dsh-video-local/narration
 */

import { createHash } from 'node:crypto'
import type { VideoSubtitleCue, VideoVoice } from './types.ts'

/** Hex characters of the digest that names one narration request. */
const CACHE_KEY_CHARS = 16

/** One narration request as the cache and the synthesizer see it. */
export interface NarrationRequest {
  /** Text to speak. */
  readonly text: string
  /** edge-tts voice id. */
  readonly voice: string
  /** edge-tts rate adjustment. */
  readonly rate: string
}

/**
 * Name one narration request. Two requests share a key exactly when they would
 * ask edge-tts for the same audio, so the key is what makes synthesis
 * incremental: an unchanged line re-renders from the cache.
 * @param request - the text, voice, and rate that decide the audio.
 * @returns a filesystem-safe hex digest.
 */
export function narrationKey(request: NarrationRequest): string {
  const digest = createHash('sha256')
  // A separator makes the three fields unambiguous: without one, voice "ab"
  // with text "c" and voice "a" with text "bc" would hash alike.
  digest.update(request.voice, 'utf8')
  digest.update('\u0000')
  digest.update(request.rate, 'utf8')
  digest.update('\u0000')
  digest.update(request.text, 'utf8')
  return digest.digest('hex').slice(0, CACHE_KEY_CHARS)
}

/** One SRT timing line: `HH:MM:SS,mmm --> HH:MM:SS,mmm`. */
const SRT_TIMING = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/

/**
 * Convert one SRT timestamp's parts to milliseconds.
 * @param hours - hour field.
 * @param minutes - minute field.
 * @param seconds - second field.
 * @param fraction - the fraction field, read as milliseconds when short.
 * @returns the timestamp in milliseconds.
 */
function toMs(hours: string, minutes: string, seconds: string, fraction: string): number {
  return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000
    + Number(fraction.padEnd(3, '0'))
}

/**
 * Read the cues out of one SRT document.
 *
 * edge-tts emits one cue per spoken sentence, so the cues are the sentence
 * boundaries a karaoke subtitle follows. A cue's text may span several lines;
 * it is joined into one line because the composition wraps to its own width.
 * @param text - the SRT document.
 * @returns the cues in document order; a document with no readable cue yields none.
 */
export function parseSrt(text: string): VideoSubtitleCue[] {
  const cues: VideoSubtitleCue[] = []
  const lines = text.split(/\r?\n/)
  let current: { startMs: number; endMs: number; text: string[] } | undefined
  const flush = (): void => {
    /* v8 ignore next -- flush is only reachable after a timing line set current. */
    if (current === undefined) return
    const joined = current.text.join(' ').replace(/\s+/g, ' ').trim()
    if (joined.length > 0) cues.push({ text: joined, startMs: current.startMs, endMs: current.endMs })
    current = undefined
  }
  for (const line of lines) {
    const match = SRT_TIMING.exec(line)
    if (match !== null) {
      flush()
      current = {
        startMs: toMs(match[1] as string, match[2] as string, match[3] as string, match[4] as string),
        endMs: toMs(match[5] as string, match[6] as string, match[7] as string, match[8] as string),
        text: [],
      }
      continue
    }
    if (current === undefined) continue
    if (line.trim().length === 0) flush()
    else current.text.push(line.trim())
  }
  flush()
  return cues
}

/**
 * Make one scene's cues non-overlapping and ordered.
 *
 * edge-tts reports consecutive sentences with a slight overlap, and a subtitle
 * that is still drawn when the next sentence begins reads as two captions at
 * once. Each cue is therefore cut at the next cue's start, and a cue the cut
 * empties is dropped.
 * @param cues - the cues as parsed.
 * @returns the cues, ordered by start, with no overlap.
 */
export function clipCues(cues: readonly VideoSubtitleCue[]): VideoSubtitleCue[] {
  const ordered = [...cues].sort((left, right) => left.startMs - right.startMs)
  const clipped: VideoSubtitleCue[] = []
  for (let index = 0; index < ordered.length; index += 1) {
    const cue = ordered[index] as VideoSubtitleCue
    const next = ordered[index + 1]
    const endMs = next === undefined ? cue.endMs : Math.min(cue.endMs, next.startMs)
    if (endMs <= cue.startMs) continue
    clipped.push({ text: cue.text, startMs: cue.startMs, endMs })
  }
  return clipped
}

/** The MPEG tables one version's frames are read with. */
interface VersionTables {
  /**
   * Layer III bitrates in kbit/s by the header's 4-bit bitrate code. The
   * format's `free` (0) and `bad` (15) codes name no bitrate, so they have no
   * entry and a header carrying one is refused.
   */
  readonly bitrates: Readonly<Record<number, number>>
  /** Sample rates in hertz by the header's 2-bit rate code; the reserved code 3 has no entry. */
  readonly sampleRates: Readonly<Record<number, number>>
  /** Samples one frame carries. */
  readonly samples: number
}

/** Bitrates Layer III names for the high-sample-rate MPEG version. */
const V1_BITRATES: Readonly<Record<number, number>> = {
  1: 32, 2: 40, 3: 48, 4: 56, 5: 64, 6: 80, 7: 96, 8: 112, 9: 128, 10: 160, 11: 192, 12: 224, 13: 256, 14: 320,
}

/** Bitrates Layer III names for the two low-sample-rate MPEG versions. */
const V2_BITRATES: Readonly<Record<number, number>> = {
  1: 8, 2: 16, 3: 24, 4: 32, 5: 40, 6: 48, 7: 56, 8: 64, 9: 80, 10: 96, 11: 112, 12: 128, 13: 144, 14: 160,
}

/**
 * MPEG versions by the header's version bits. Bits `1` are reserved, so the
 * lookup miss is how such a header is refused.
 */
const VERSIONS: Readonly<Record<number, VersionTables>> = {
  3: { bitrates: V1_BITRATES, sampleRates: { 0: 44100, 1: 48000, 2: 32000 }, samples: 1152 },
  2: { bitrates: V2_BITRATES, sampleRates: { 0: 22050, 1: 24000, 2: 16000 }, samples: 576 },
  0: { bitrates: V2_BITRATES, sampleRates: { 0: 11025, 1: 12000, 2: 8000 }, samples: 576 },
}

/** One decoded Layer III frame header. */
interface FrameHeader {
  /** Frame length in bytes, including the header. */
  readonly length: number
  /** Samples the frame carries. */
  readonly samples: number
  /** Sample rate in hertz. */
  readonly sampleRate: number
}

/**
 * Decode one Layer III frame header.
 *
 * Layer III is the only layer edge-tts emits, so a header naming another layer
 * is not a frame this parser can measure and is refused rather than measured
 * with the wrong window size. The caller guarantees four readable bytes: its own
 * scan bound is what provides them.
 * @param bytes - the buffer being read.
 * @param offset - the header's position.
 * @returns the header, or undefined when those bytes are not a Layer III header.
 */
function readFrameHeader(bytes: Uint8Array, offset: number): FrameHeader | undefined {
  const first = bytes[offset] as number
  const second = bytes[offset + 1] as number
  const third = bytes[offset + 2] as number
  // Eleven sync bits, then layer bits that must name Layer III.
  if (first !== 0xff || (second & 0xe0) !== 0xe0) return undefined
  if (((second >> 1) & 0x03) !== 0x01) return undefined
  const tables = VERSIONS[(second >> 3) & 0x03]
  if (tables === undefined) return undefined
  // A `free` or `bad` bitrate code and the reserved sample-rate code all name no
  // value, so a header carrying one declares no frame length.
  const bitrate = tables.bitrates[(third >> 4) & 0x0f]
  const sampleRate = tables.sampleRates[(third >> 2) & 0x03]
  if (bitrate === undefined || sampleRate === undefined) return undefined
  const padding = (third >> 1) & 0x01
  // Every accepted bitrate is at least 8 kbit/s against a rate of at least
  // 8 kHz, so a frame is always longer than its own header and the scan always
  // advances.
  const length = Math.floor((tables.samples / 8) * (bitrate * 1000) / sampleRate) + padding
  return { length, samples: tables.samples, sampleRate }
}

/**
 * Measure one MPEG Layer III file by walking its frames.
 *
 * The audio is the authority on how long a scene must run: a duration derived
 * from the subtitle text would cut the last word whenever edge-tts speaks slower
 * than its cues claim. Frames are counted rather than estimated, so the answer
 * holds for the constant and variable bitrate files edge-tts returns.
 * @param bytes - the complete file.
 * @returns the audio length in milliseconds, rounded up.
 * @throws when no frame is found, which means the file is not MPEG Layer III audio.
 */
export function mp3DurationMs(bytes: Uint8Array): number {
  let offset = 0
  // An ID3v2 tag opens with `ID3` and a ten-byte header holding a synchsafe size
  // that excludes the header itself; the audio starts after both.
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    offset = 10
      + (((bytes[6] as number) & 0x7f) << 21)
      + (((bytes[7] as number) & 0x7f) << 14)
      + (((bytes[8] as number) & 0x7f) << 7)
      + ((bytes[9] as number) & 0x7f)
  }
  let totalMs = 0
  let frames = 0
  // A byte that starts no frame is skipped: the only such bytes a real file
  // carries are a leading tag's tail and a trailing ID3v1 tag, both shorter than
  // the file itself and both ending at its end.
  while (offset + 4 <= bytes.length) {
    const header = readFrameHeader(bytes, offset)
    if (header === undefined) {
      offset += 1
      continue
    }
    totalMs += (header.samples / header.sampleRate) * 1000
    frames += 1
    offset += header.length
  }
  if (frames === 0) throw new Error('narration audio contains no MPEG Layer III frame')
  return Math.ceil(totalMs)
}

/**
 * One data row of edge-tts' voice table: a voice id, then whatever columns
 * follow it. A voice's own name may carry a hyphen, as in
 * `zh-CN-liaoning-XiaobeiNeural`, so the name part accepts one.
 */
const VOICE_ROW = /^([a-z]{2,3}-[A-Z]{2}-[A-Za-z-]+Neural)(?:\s+(.*))?$/

/**
 * Read the voices out of edge-tts' `--list-voices` table.
 *
 * The command prints fixed-width columns under a header, so a row is
 * recognized by its voice id rather than by column offsets: the header and the
 * rule beneath it carry no id and are skipped.
 * @param text - the command's stdout.
 * @returns one entry per voice, in the order edge-tts lists them.
 */
export function parseVoiceList(text: string): VideoVoice[] {
  const voices: VideoVoice[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = VOICE_ROW.exec(line.trim())
    if (match === null) continue
    const id = match[1] as string
    const columns = (match[2] ?? '').split(/\s{2,}/).map(column => column.trim()).filter(column => column.length > 0)
    voices.push({
      id,
      locale: id.split('-').slice(0, 2).join('-'),
      gender: columns[0] ?? 'Unknown',
      categories: columns[1] ?? '',
    })
  }
  return voices
}

/**
 * Longest a scene runs before the composition moves on, in milliseconds.
 * @param audioMs - the scene's measured narration length.
 * @param tailMs - the silence held after the narration.
 * @returns the scene's duration.
 */
export function sceneDurationMs(audioMs: number, tailMs: number): number {
  return audioMs + tailMs
}
