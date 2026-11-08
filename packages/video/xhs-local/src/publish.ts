/**
 * Publication of one Xiaohongshu post: validate the copy, write the publish and
 * draft files, copy the finished video into the served asset directory, run the
 * two publication gates, and update the operating manual's index and daily
 * progress.
 *
 * The tool is the only caller. Its argument schema is the model-facing contract;
 * this module is where the operating brief's hard numbers are enforced, so a
 * card never presents copy that the brief would reject.
 *
 * @module @deepseek-ai/dsh-xhs-local/publish
 */

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import {
  INDEX_MARKER, LIBRARY_MARKER, LOG_MARKER, MAX_BODY_CHARS, MAX_CONTRAST_PATTERNS, MAX_TAGS,
  MAX_TITLE_CHARS, MIN_TAGS, RECENT_MARKER, XHS_PAYLOAD_VERSION,
} from './contract.ts'
import type { XhsChecks, XhsFiles, XhsGate, XhsPostResult, XhsPublishRequest, XhsVideo } from './types.ts'

/** Deployment paths and process bounds one publication uses. */
export interface PublishOptions {
  readonly contentRoot: string
  readonly assetRoot: string
  readonly routePrefix: string
  readonly detectScript: string
  readonly scanScript: string
  readonly checkTimeoutMs: number
  readonly maxOutputBytes: number
  readonly maxStderrBytes: number
  readonly graceMs: number
  readonly playbackPath: () => string | null
}

/** One processed gate plus its parsed counts. */
interface GateResult extends XhsGate {
  readonly verdict: string
  readonly hits: number
  readonly hard: number
  readonly soft: number
}

/**
 * One run of a publication gate.
 * @param ctx - context carrying the subprocess capability.
 * @param options - deployment paths and process bounds.
 * @param script - the gate script to run.
 * @param file - the publish copy to scan.
 * @param signal - cancels the process.
 * @returns the exit facts and captured output.
 */
async function runGate(
  ctx: Context,
  options: PublishOptions,
  script: string,
  file: string,
  signal: AbortSignal,
): Promise<{ exitCode: number | null; output: string }> {
  const executable = await ctx.subprocess.resolveExecutable('python3')
  const timeout = AbortSignal.timeout(options.checkTimeoutMs)
  const handle = ctx.subprocess.spawn({
    argv: [executable, script, file],
    cwd: options.contentRoot,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: options.maxOutputBytes },
      stderr: { maxBytes: options.maxStderrBytes },
    },
    graceMs: options.graceMs,
    signal: AbortSignal.any([signal, timeout]),
  })
  const outcome = await handle.done
  const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
  const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
  return {
    exitCode: outcome.exitCode,
    output: `${stdout}${stderr === '' ? '' : `\n${stderr}`}`.trim(),
  }
}

/**
 * Parse the de-AI scan's model-facing report.
 * @param run - the gate's exit facts and text.
 * @returns the parsed gate.
 */
export function parseDetect(run: { exitCode: number | null; output: string }): GateResult {
  const hits = Number(/Total AI pattern hits:\s*(\d+)/.exec(run.output)?.[1] ?? '1')
  const verdict = /Verdict:\s*([A-Z]+)/.exec(run.output)?.[1] ?? 'UNKNOWN'
  const passed = run.exitCode === 0 && verdict === 'PASS' && hits === 0
  return { passed, exitCode: run.exitCode, output: run.output, verdict, hits, hard: 0, soft: 0 }
}

/**
 * Parse the outbound-contact scan's model-facing report.
 * @param run - the gate's exit facts and text.
 * @returns the parsed gate.
 */
export function parseScan(run: { exitCode: number | null; output: string }): GateResult {
  const match = /判定：🔴\s*(\d+)\s*处\s*·\s*🟡\s*(\d+)\s*处/.exec(run.output)
  const hard = Number(match?.[1] ?? '1')
  const soft = Number(match?.[2] ?? '0')
  const passed = run.exitCode === 0 && hard === 0
  return { passed, exitCode: run.exitCode, output: run.output, verdict: '', hits: 0, hard, soft }
}

/**
 * Count title characters the way the brief counts them: one Unicode code point
 * per visible character, so an emoji or a Chinese character is one.
 * @param text - the title.
 * @returns its code-point length.
 */
function titleLength(text: string): number {
  return [...text].length
}

/**
 * Reject copy the operating brief forbids before anything is written.
 * @param request - the post the tool was asked to publish.
 * @throws when a hard number or forbidden form is present.
 */
export function validatePost(request: XhsPublishRequest): void {
  if (!Number.isInteger(request.number) || request.number < 1) {
    throw new Error('xhs: number must be a positive integer')
  }
  if (request.topic.trim().length === 0) throw new Error('xhs: topic must not be empty')
  if (request.title.trim().length === 0) throw new Error('xhs: title must not be empty')
  if (titleLength(request.title) > MAX_TITLE_CHARS) {
    throw new Error(`xhs: title is ${String(titleLength(request.title))} characters; the limit is ${String(MAX_TITLE_CHARS)}`)
  }
  if (request.body.trim().length === 0) throw new Error('xhs: body must not be empty')
  if ([...request.body].length > MAX_BODY_CHARS) {
    throw new Error(`xhs: body is ${String([...request.body].length)} characters; the limit is ${String(MAX_BODY_CHARS)}`)
  }
  if (request.tags.length < MIN_TAGS || request.tags.length > MAX_TAGS) {
    throw new Error(`xhs: tags must carry ${String(MIN_TAGS)} to ${String(MAX_TAGS)} entries`)
  }
  if (request.tags.some(tag => tag.trim().length === 0)) throw new Error('xhs: tags must not be empty')
  if (request.pinnedComment.trim().length === 0) throw new Error('xhs: pinnedComment must not be empty')
  const text = `${request.title}\n${request.body}\n${request.pinnedComment}`
  if (text.includes('我')) throw new Error('xhs: copy must not use the first person 我')
  if (/[“”"‘’']/u.test(text)) throw new Error('xhs: copy must not use quotation marks')
  if (/[—–]/u.test(text)) throw new Error('xhs: copy must not use em or en dashes')
  if (text.split('\n').some(line => line.startsWith(' '))) {
    throw new Error('xhs: no line may start with a space')
  }
  let blankRun = 0
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) {
      blankRun += 1
      if (blankRun > 1) throw new Error('xhs: at most one consecutive blank line is allowed')
    } else {
      blankRun = 0
    }
  }
  const contrasts = (request.body.match(/不是/g) ?? []).length
  if (contrasts > MAX_CONTRAST_PATTERNS) {
    throw new Error(`xhs: body uses 不是 ${String(contrasts)} times; the limit is ${String(MAX_CONTRAST_PATTERNS)}`)
  }
  if (!isAbsolute(request.videoPath)) throw new Error('xhs: videoPath must be absolute')
}

/**
 * Measure one finished video with ffprobe.
 * @param ctx - context carrying the subprocess capability.
 * @param options - deployment paths and process bounds.
 * @param path - the video's absolute path.
 * @param signal - cancels the probe.
 * @returns the measured video.
 * @throws when ffprobe cannot read the file or reports no video stream.
 */
async function probeVideo(
  ctx: Context,
  options: PublishOptions,
  path: string,
  signal: AbortSignal,
): Promise<XhsVideo> {
  const executable = await ctx.subprocess.resolveExecutable('ffprobe')
  const timeout = AbortSignal.timeout(options.checkTimeoutMs)
  const handle = ctx.subprocess.spawn({
    argv: [
      executable, '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate',
      '-show_entries', 'format=duration,size',
      '-of', 'json', path,
    ],
    cwd: options.assetRoot,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: options.maxOutputBytes },
      stderr: { maxBytes: options.maxStderrBytes },
    },
    graceMs: options.graceMs,
    signal: AbortSignal.any([signal, timeout]),
  })
  const outcome = await handle.done
  const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
  const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
  if (outcome.exitCode !== 0 || outcome.signal !== null) {
    throw new Error(`xhs: ffprobe failed for ${path}${stderr === '' ? '' : `: ${stderr.trim()}`}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(`xhs: ffprobe returned unreadable JSON for ${path}`)
  }
  const record = parsed as {
    streams?: { width?: unknown; height?: unknown; r_frame_rate?: unknown }[]
    format?: { duration?: unknown; size?: unknown }
  }
  const stream = record.streams?.[0]
  const width = Number(stream?.width)
  const height = Number(stream?.height)
  const rate = typeof stream?.r_frame_rate === 'string' ? stream.r_frame_rate.split('/') : []
  const fps = Number(rate[0]) / Number(rate[1] ?? '1')
  const durationSec = Number(record.format?.duration)
  const bytes = Number(record.format?.size)
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`xhs: ffprobe reported no usable video stream for ${path}`)
  }
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(durationSec) || durationSec <= 0 || !Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`xhs: ffprobe reported incomplete measurements for ${path}`)
  }
  return { path, durationMs: Math.round(durationSec * 1000), width, height, fps: Math.round(fps), bytes }
}

/**
 * Normalize one hashtag to the form the post composer expects.
 * @param tag - the model-supplied tag.
 * @returns the tag with exactly one leading hash.
 */
export function normalizeTag(tag: string): string {
  return `#${tag.trim().replace(/^#+/, '')}`
}

/**
 * A filesystem- and URL-safe stem for one topic.
 * @param topic - the post topic.
 * @param number - the post number, used when the topic has no usable characters.
 * @returns the stem.
 */
export function topicStem(topic: string, number: number): string {
  const stem = topic
    .trim()
    .replace(/[\\/:*?"<>|#]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return stem.length === 0 ? `post-${String(number)}` : stem
}

/**
 * Format a duration in milliseconds as seconds with one decimal.
 * @param ms - the duration.
 * @returns the seconds.
 */
function seconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1)
}

/**
 * Format one local date as YYYY-MM-DD.
 * @param date - the date.
 * @returns the formatted date.
 */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}

/**
 * Format one local date as MM-DD.
 * @param date - the date.
 * @returns the formatted month and day.
 */
function shortDate(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * The long-form production record written beside the publish copy.
 * @param request - the post.
 * @param checks - both gate results.
 * @param videoPath - the served copy's path.
 * @param tags - normalized hashtags.
 * @param date - the publication date.
 * @returns the Markdown document.
 */
function renderDraft(
  request: XhsPublishRequest,
  video: XhsVideo,
  checks: XhsChecks,
  videoPath: string,
  tags: readonly string[],
  date: Date,
): string {
  return [
    `# 第${String(request.number)}篇成稿：${request.topic}`,
    '',
    `> 📅 ${isoDate(date)} | 核心主题：${request.topic}`,
    '> ⚠️ 正文硬指标：0 引号 / 0 破折号 / 0 第一人称 / 最大 1 空行 / 无行首空格 / 「不是 X 是 Y」≤ 2',
    `> ⚠️ 发布前检查：detect ${checks.detect.verdict} · 发布前扫描 🔴${String(checks.scan.hard)} 🟡${String(checks.scan.soft)}`,
    '',
    '## 一、标题',
    '',
    `**主推：${request.title}**（${String(titleLength(request.title))} 字）`,
    '',
    `## 二、正文（${String([...request.body].length)} 字）`,
    '',
    '```',
    request.body,
    '```',
    '',
    '## 三、标签',
    '',
    tags.join(' '),
    '',
    '## 四、置顶评论',
    '',
    `> ${request.pinnedComment}`,
    '',
    '## 五、视频物料',
    '',
    '| 项 | 内容 |',
    '|---|---|',
    `| 成品 | \`${videoPath}\` |`,
    `| 规格 | ${String(video.width)}×${String(video.height)} / ${String(video.fps)}fps / ${seconds(video.durationMs)} 秒 / ${String(video.bytes)} 字节 |`,
    '',
    '## 六、发布清单',
    '',
    '- [x] 标题 ≤20 字',
    '- [x] 正文 ≤1000 字，不重复视频内容',
    `- [x] 发布前扫描 🔴${String(checks.scan.hard)} 🟡${String(checks.scan.soft)}`,
    `- [x] detect ${checks.detect.verdict}`,
    '- [ ] 去AI味人工复核',
    '- [ ] 朗读一遍',
    '- [ ] 发布 + 置顶评论',
    '',
  ].join('\n')
}

/**
 * Insert the new index row, recent-progress bullet, log section, and library
 * row into the operating manual's four places.
 *
 * Markers make this structural rather than heuristic: a manual without them is
 * still a valid manual, so the publication reports a warning instead of guessing
 * where a row belongs.
 * @param contentRoot - the operating manual's directory.
 * @param request - the post.
 * @param video - the measured video.
 * @param checks - both gate results.
 * @param date - the publication date.
 * @returns warnings for markers this manual does not carry.
 */
export async function updateManual(
  contentRoot: string,
  request: XhsPublishRequest,
  video: XhsVideo,
  checks: XhsChecks,
  date: Date,
): Promise<string[]> {
  const warnings: string[] = []
  const stem = topicStem(request.topic, request.number)
  const day = isoDate(date)
  const manualPath = join(contentRoot, '小红书运营.md')
  const manual = await readFile(manualPath, 'utf8')
  const row = `| [[素材库/第${String(request.number)}篇-${stem}/第${String(request.number)}篇-${stem}-成稿]] | 第${String(request.number)}条视频：${request.topic}（${seconds(video.durationMs)}s）+ 标题/正文/置顶评论 | ✅ ${shortDate(date)} |`
  const recent = `- ${day}：第 ${String(request.number)} 篇 ${request.topic} 视频成稿（${seconds(video.durationMs)} 秒）`
  let next = manual
  if (manual.includes(INDEX_MARKER)) {
    next = next.replace(INDEX_MARKER, `${row}
${INDEX_MARKER}`)
  } else {
    warnings.push(`operating manual has no ${INDEX_MARKER}; the index row was not inserted`)
  }
  if (next.includes(RECENT_MARKER)) {
    next = next.replace(RECENT_MARKER, `${recent}
${RECENT_MARKER}`)
  } else {
    warnings.push(`operating manual has no ${RECENT_MARKER}; the recent-progress bullet was not inserted`)
  }
  next = next.replace(/\*最后更新：\d{4}-\d{2}-\d{2}\*/, `*最后更新：${day}*`)
  if (next !== manual) await writeFile(manualPath, next, 'utf8')

  const logPath = join(contentRoot, '运营日志.md')
  try {
    const log = await readFile(logPath, 'utf8')
    if (log.includes(LOG_MARKER)) {
      const section = [
        `## 今日进展（${day}，第${String(request.number)}篇·小红书 🎬）`,
        '',
        `1. ✅ **第${String(request.number)}篇视频产出**：${request.topic}——${seconds(video.durationMs)} 秒竖屏，成片 \`${video.path}\``,
        `2. ✅ **文案同步**：主推「${request.title}」+ 正文 ${String([...request.body].length)} 字 + 标签 + 置顶评论`,
        `3. ✅ **质检全过**：detect ${checks.detect.verdict}（${String(checks.detect.hits)} 命中）· 发布前扫描 🔴${String(checks.scan.hard)} 🟡${String(checks.scan.soft)}`,
        '4. ⏳ **待办**：去AI味人工复核 + 朗读 → 从视频帧挑封面 → 发布 + 置顶评论 → 48h 跑六层漏斗',
        '',
        '---',
        '',
        LOG_MARKER,
      ].join('\n')
      const updated = log.replace(LOG_MARKER, section).replace(/^updated: .*$/m, `updated: ${day}`)
      await writeFile(logPath, updated, 'utf8')
    } else {
      warnings.push(`operations log has no ${LOG_MARKER}; the log section was not inserted`)
    }
  } catch {
    warnings.push('operations log was not found; the log section was not inserted')
  }

  const libraryPath = join(contentRoot, '素材库', 'README.md')
  try {
    const library = await readFile(libraryPath, 'utf8')
    if (library.includes(LIBRARY_MARKER)) {
      const libraryRow = `| 第 ${String(request.number)} 篇 | ${request.topic}（第 ${String(request.number)} 条视频） | [[素材库/第${String(request.number)}篇-${stem}/第${String(request.number)}篇-${stem}-成稿\\|成稿]] |`
      await writeFile(libraryPath, library.replace(LIBRARY_MARKER, `${libraryRow}\n\n${LIBRARY_MARKER}`), 'utf8')
    } else {
      warnings.push(`post library has no ${LIBRARY_MARKER}; the library row was not inserted`)
    }
  } catch {
    warnings.push('post library README was not found; the library row was not inserted')
  }
  return warnings
}

/**
 * Publish one post.
 * @param ctx - context carrying the subprocess capability.
 * @param options - deployment paths and process bounds.
 * @param request - the post and its measured video.
 * @param signal - cancels the gates.
 * @returns the card payload.
 * @throws when validation or either publication gate fails.
 */
export async function publishPost(
  ctx: Context,
  options: PublishOptions,
  request: XhsPublishRequest,
  signal: AbortSignal,
): Promise<XhsPostResult> {
  validatePost(request)
  const detectInfo = await stat(options.detectScript).catch(() => null)
  if (detectInfo?.isFile() !== true) throw new Error(`xhs: detect script not found: ${options.detectScript}`)
  const scanInfo = await stat(options.scanScript).catch(() => null)
  if (scanInfo?.isFile() !== true) throw new Error(`xhs: publication scan not found: ${options.scanScript}`)
  const videoInfo = await stat(request.videoPath).catch(() => null)
  if (videoInfo?.isFile() !== true) throw new Error(`xhs: video not found: ${request.videoPath}`)
  await mkdir(options.assetRoot, { recursive: true })
  const video = await probeVideo(ctx, options, request.videoPath, signal)

  const stem = topicStem(request.topic, request.number)
  const tags = request.tags.map(normalizeTag)
  const postDir = join(options.contentRoot, '素材库', `第${String(request.number)}篇-${stem}`)
  await mkdir(postDir, { recursive: true })
  const publishPath = join(postDir, `第${String(request.number)}篇-发布版.txt`)
  const draftPath = join(postDir, `第${String(request.number)}篇-${stem}-成稿.md`)
  const tempPath = join(postDir, `.${String(request.number)}-publish.tmp`)
  await writeFile(tempPath, `${request.body}\n`, 'utf8')

  let detectRun: { exitCode: number | null; output: string }
  let scanRun: { exitCode: number | null; output: string }
  try {
    detectRun = await runGate(ctx, options, options.detectScript, tempPath, signal)
    scanRun = await runGate(ctx, options, options.scanScript, tempPath, signal)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
  const detect = parseDetect(detectRun)
  const scan = parseScan(scanRun)
  if (!detect.passed || !scan.passed) {
    await rm(tempPath, { force: true })
    throw new Error([
      'xhs: publication gates rejected this copy; nothing was published.',
      `detect: ${detect.verdict} (${String(detect.hits)} hits)`,
      detect.output,
      `scan: 🔴${String(scan.hard)} 🟡${String(scan.soft)}`,
      scan.output,
    ].join('\n'))
  }
  const checks: XhsChecks = { detect, scan }
  await writeFile(publishPath, `${request.body}\n`, 'utf8')
  await rm(tempPath, { force: true })

  const servedPath = join(options.assetRoot, `${stem}.mp4`)
  if (resolve(servedPath) !== resolve(video.path)) {
    await copyFile(video.path, servedPath)
  }
  const date = new Date()
  await writeFile(draftPath, renderDraft(request, video, checks, servedPath, tags, date), 'utf8')

  const warnings: string[] = []
  const prefix = options.playbackPath()
  const url = prefix === null ? null : `${prefix}/${encodeURIComponent(basename(servedPath))}`
  if (url === null) warnings.push('this deployment mounted no playback route; open the file path instead')
  try {
    warnings.push(...await updateManual(options.contentRoot, request, video, checks, date))
  } catch (error) {
    warnings.push(`operating manual was not updated: ${error instanceof Error ? error.message : String(error)}`)
  }

  const servedVideo: XhsPostResult['video'] = {
    ...video,
    path: servedPath,
    url,
    fileName: basename(servedPath),
  }
  const files: XhsFiles = { draft: draftPath, publish: publishPath, video: servedPath }
  return {
    version: XHS_PAYLOAD_VERSION,
    number: request.number,
    topic: request.topic,
    title: request.title,
    body: request.body,
    tags,
    pinnedComment: request.pinnedComment,
    video: servedVideo,
    checks,
    files,
    warnings,
    createdAt: date.toISOString(),
  }
}

/** Re-exported for tests that build a video fixture without a render. */
export type { XhsVideo }
