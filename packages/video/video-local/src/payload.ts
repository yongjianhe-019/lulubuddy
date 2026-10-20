/**
 * Narrowing for the render payload a card draws.
 *
 * The payload crosses the process boundary inside the tool result's
 * presentation metadata, so it is JSON a client cannot trust: this module is
 * the client-facing half that re-establishes the type member by member. A
 * payload that does not narrow is dropped whole rather than repaired, because a
 * partially read storyboard would show timings no render produced.
 *
 * @module @deepseek-ai/dsh-video-local/payload
 */

import { VIDEO_PAYLOAD_VERSION } from './contract.ts'
import type { VideoRender, VideoSceneResult } from './types.ts'

/** Most scenes one narrowed payload may carry. */
const MAX_PAYLOAD_SCENES = 64

/** Whether a value is a non-array JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one required string member.
 * @param value - the member.
 * @returns the string, or null when the member is not a non-empty string.
 */
function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Read one finite non-negative number member.
 * @param value - the member.
 * @returns the number, or null when the member is not one.
 */
function requiredCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Narrow one scene entry.
 * @param value - the entry.
 * @param index - the position it must claim.
 * @returns the scene, or null when any member fails to narrow.
 */
function readScene(value: unknown, index: number): VideoSceneResult | null {
  if (!isRecord(value)) return null
  if (value['index'] !== index) return null
  const narration = requiredText(value['narration'])
  const startMs = requiredCount(value['startMs'])
  const endMs = requiredCount(value['endMs'])
  if (narration === null || startMs === null || endMs === null || endMs < startMs) return null
  const heading = value['heading']
  if (heading !== undefined && typeof heading !== 'string') return null
  return {
    index,
    ...heading === undefined ? {} : { heading },
    narration,
    startMs,
    endMs,
    cached: value['cached'] === true,
  }
}

/**
 * Narrow one render payload.
 *
 * A payload whose revision this build does not know yields null, as does one
 * missing any member a card reads: the alternative is drawing a video whose
 * duration or scene list is a guess.
 * @param value - the value the tool published as presentation metadata.
 * @returns the payload, or null when it is not one this build can draw.
 */
export function readVideoRender(value: unknown): VideoRender | null {
  if (!isRecord(value)) return null
  if (value['version'] !== VIDEO_PAYLOAD_VERSION) return null
  const output = requiredText(value['output'])
  const title = requiredText(value['title'])
  const voice = requiredText(value['voice'])
  const bytes = requiredCount(value['bytes'])
  const width = requiredCount(value['width'])
  const height = requiredCount(value['height'])
  const fps = requiredCount(value['fps'])
  const durationMs = requiredCount(value['durationMs'])
  if (output === null || title === null || voice === null) return null
  if (bytes === null || width === null || height === null || fps === null || durationMs === null) return null
  if (width === 0 || height === 0 || fps === 0) return null
  const url = value['url']
  if (url !== null && requiredText(url) === null) return null
  const rawScenes = value['scenes']
  if (!Array.isArray(rawScenes) || rawScenes.length === 0 || rawScenes.length > MAX_PAYLOAD_SCENES) return null
  const scenes: VideoSceneResult[] = []
  for (let index = 0; index < rawScenes.length; index += 1) {
    const scene = readScene(rawScenes[index], index)
    if (scene === null) return null
    scenes.push(scene)
  }
  return {
    version: VIDEO_PAYLOAD_VERSION,
    output,
    url: url === null ? null : requiredText(url),
    bytes,
    width,
    height,
    fps,
    durationMs,
    title,
    voice,
    scenes,
  }
}
