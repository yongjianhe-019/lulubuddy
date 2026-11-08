/**
 * Local motion provider: the motion-studio project's Node scripts behind one
 * bounded invocation. The picture is a frame-pure HTML composition; this
 * provider only scaffolds it, renders stills/MP4, synthesizes the WAV, muxes,
 * and runs QC. The composition itself is the model's work.
 *
 * @module @deepseek-ai/dsh-motion-local/provider
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { MotionRuntime } from './service.ts'
import type { MotionInvocation } from './service.ts'
import type { MotionOutcome, MotionRequestMap } from './types.ts'

/** One script's captured process result. */
interface ScriptResult {
  readonly stdout: string
  readonly stderr: string
  readonly json: Record<string, unknown>
}

/** Resolved movement paths and the local interpreter. */
export interface LocalMotionOptions {
  /** motion-studio project root, containing skill/motion-video. */
  readonly motionRoot: string
  /** Node executable; defaults to the host process executable. */
  readonly nodePath?: string
  /** Absolute path to playwright-core; defaults to this package's dependency. */
  readonly playwrightCore?: string
  /** Optional Chromium executable. */
  readonly chromeBin?: string
  /** Per-operation wall-clock bound. */
  readonly timeoutMs?: number
}

/** Read the last JSON object a script printed. */
function parseJson(stdout: string): Record<string, unknown> {
  const text = stdout.trim()
  if (text === '') throw new Error('motion script produced no output')
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // A script may print progress before its answer; try the last JSON line.
  }
  for (const line of text.split(/\r?\n/u).reverse()) {
    const candidate = line.trim()
    if (!candidate.startsWith('{')) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      // Keep scanning older lines.
    }
  }
  throw new Error(`motion script did not print a JSON result: ${text.slice(-500)}`)
}

/** Resolve playwright-core for the child process. */
function resolvePlaywrightCore(configured: string | undefined): string {
  if (configured !== undefined) return configured
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('playwright-core')
  } catch {
    throw new Error('motion-local: playwright-core is not installed; set playwrightCore in the provider config')
  }
}

/** Local provider over the motion-studio scripts. */
export class LocalMotionProvider extends MotionRuntime {
  private readonly root: string
  private readonly node: string
  private readonly playwrightCore: string
  private readonly chromeBin: string | undefined
  private readonly timeoutMs: number

  constructor(ctx: import('@deepseek-ai/cordis').Context, options: LocalMotionOptions) {
    super(ctx)
    this.root = resolve(options.motionRoot)
    this.node = options.nodePath ?? process.execPath
    this.playwrightCore = resolvePlaywrightCore(options.playwrightCore)
    const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    this.chromeBin = options.chromeBin ?? (existsSync(systemChrome) ? systemChrome : undefined)
    this.timeoutMs = options.timeoutMs ?? 900_000
    if (!existsSync(join(this.root, 'skill', 'motion-video', 'scripts', 'render.mjs'))) {
      throw new Error(`motion-local: motionRoot has no skill/motion-video/scripts/render.mjs: ${this.root}`)
    }
  }

  /** Run one script with the provider's environment and budget. */
  private async run(script: string, args: readonly string[], signal: AbortSignal): Promise<ScriptResult> {
    const scriptPath = join(this.root, 'skill', 'motion-video', 'scripts', script)
    if (!existsSync(scriptPath)) throw new Error(`motion-local: script missing: ${scriptPath}`)
    return await new Promise<ScriptResult>((resolveRun, rejectRun) => {
      const child = spawn(this.node, [scriptPath, ...args], {
        cwd: this.root,
        env: {
          ...process.env,
          PLAYWRIGHT_CORE: this.playwrightCore,
          ...this.chromeBin === undefined ? {} : { CHROME_BIN: this.chromeBin },
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (error?: Error): boolean => {
        if (settled) return false
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        if (error !== undefined) {
          rejectRun(error)
          return true
        }
        try {
          resolveRun({ stdout, stderr, json: parseJson(stdout) })
        } catch (parseError) {
          rejectRun(parseError instanceof Error ? parseError : new Error(String(parseError)))
        }
        return true
      }
      const abort = (): void => {
        child.kill('SIGTERM')
        finish(new Error('motion-local: operation cancelled'))
      }
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        finish(new Error(`motion-local: operation exceeded ${String(this.timeoutMs)} ms`))
      }, this.timeoutMs)
      signal.addEventListener('abort', abort, { once: true })
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
      child.once('error', (error) => {
        finish(new Error(`motion-local: could not start ${this.node}: ${error.message}`))
      })
      child.once('exit', (code) => {
        if (signal.aborted) { finish(new Error('motion-local: operation cancelled')); return }
        if (code !== 0) {
          const detail = stderr.trim() === '' ? '' : `: ${stderr.trim().slice(-1200)}`
          finish(new Error(`motion-local: ${script} exited ${String(code)}${detail}`))
          return
        }
        finish()
      })
    })
  }

  private projectDir(relative: string): string {
    const target = resolve(this.root, relative)
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error(`motion-local: project path escapes motionRoot: ${relative}`)
    }
    return target
  }

  private async scaffold(args: MotionRequestMap['scaffold']): Promise<MotionOutcome> {
    const platform = args.platform ?? (args.width !== undefined || args.height !== undefined
      ? 'custom'
      : args.template === 'orbital' ? 'desktop' : 'mobile')
    const defaults = platform === 'desktop'
      ? { width: 1920, height: 1080 }
      : platform === 'square'
        ? { width: 1080, height: 1080 }
        : platform === 'portrait'
          ? { width: 1080, height: 1350 }
          : { width: 1080, height: 1920 }
    const width = args.width ?? defaults.width
    const height = args.height ?? defaults.height
    const fps = args.fps ?? 30
    const duration = args.duration ?? 8
    const bpm = args.bpm ?? 120
    const slug = (args.slug ?? args.title).replace(/[\\/:*?"<>|]/gu, '').trim().replace(/\s+/gu, '-').slice(0, 48) || 'motion'
    const projectDir = this.projectDir(args.outputDir ?? join('motion', slug))
    await mkdir(projectDir, { recursive: true })
    const htmlPath = join(projectDir, 'index.html')
    const bgmPath = join(projectDir, 'bgm.json')
    const template = args.templatePath !== undefined
      ? this.projectDir(args.templatePath)
      : args.template === 'orbital'
        ? join(this.root, 'examples', 'legacy', 'orbital-20s.html')
        : join(this.root, 'skill', 'motion-video', 'templates', 'motion.html')
    if (!existsSync(template)) throw new Error(`motion-local: template not found: ${template}`)
    let html = await readFile(template, 'utf8')
    html = html.replace(
      /const W = \d+, H = \d+, FPS = \d+, DUR = [\d.]+;/u,
      `const W = ${String(width)}, H = ${String(height)}, FPS = ${String(fps)}, DUR = ${String(duration)};`,
    )
    const safe = platform === 'mobile'
      ? { left: 60, top: 120, right: width - 150, bottom: height - 300 }
      : platform === 'desktop'
        ? { left: 96, top: 72, right: width - 96, bottom: height - 72 }
        : platform === 'square'
          ? { left: 60, top: 90, right: width - 60, bottom: height - 160 }
          : platform === 'portrait'
            ? { left: 60, top: 120, right: width - 120, bottom: height - 220 }
            : {
              left: Math.round(width * 0.06), top: Math.round(height * 0.06),
              right: Math.round(width * 0.94), bottom: Math.round(height * 0.94),
            }
    html = html.replace(/const PLATFORM = '[^']*';/u, `const PLATFORM = '${platform}';`)
    const safeText = [
      `const SAFE = { left: ${String(safe.left)}, top: ${String(safe.top)},`,
      ` right: ${String(safe.right)}, bottom: ${String(safe.bottom)} };`,
    ].join('')
    html = html.replace(/const SAFE = \{[^}]+\};/u, safeText)
    html = html.replace(/const BPM = \d+/u, `const BPM = ${String(bpm)}`)
    await writeFile(htmlPath, html, 'utf8')
    const rawBgm: unknown = JSON.parse(await readFile(join(this.root, 'skill', 'motion-video', 'templates', 'bgm.json'), 'utf8'))
    const bgm = typeof rawBgm === 'object' && rawBgm !== null ? rawBgm as Record<string, unknown> : {}
    await writeFile(bgmPath, JSON.stringify({
      ...bgm,
      bpm,
      duration,
      kickTo: duration,
      cues: [],
    }, null, 2), 'utf8')
    const notes = join(projectDir, 'notes.md')
    const noteBody = [
      `# ${args.title}`,
      '',
      args.brief ?? 'Motion video.',
      '',
      `- ${String(width)}x${String(height)} · ${String(fps)} fps · ${String(duration)} s · ${String(bpm)} BPM`,
      '',
    ].join('\n')
    await writeFile(notes, noteBody, 'utf8')
    return {
      document: {
        title: args.title, slug, projectDir, htmlPath, bgmPath, notesPath: notes,
        width, height, fps, duration, bpm, platform, safeArea: safe, template: args.template ?? 'starter',
      },
      warnings: [],
    }
  }

  private async render(args: MotionRequestMap['render'], signal: AbortSignal): Promise<MotionOutcome> {
    const htmlPath = this.projectDir(args.htmlPath)
    const projectDir = dirname(htmlPath)
    const html = await readFile(htmlPath, 'utf8')
    const match = /const W = (\d+), H = (\d+), FPS = (\d+), DUR = ([\d.]+);/u.exec(html)
    const width = args.width ?? (match === null ? 1080 : Number(match[1]))
    const height = args.height ?? (match === null ? 1920 : Number(match[2]))
    const fps = args.fps ?? (match === null ? 30 : Number(match[3]))
    const duration = args.duration ?? (match === null ? 8 : Number(match[4]))
    const slug = basename(projectDir)
    const outDir = join(this.root, 'out')
    await mkdir(outDir, { recursive: true })
    const wav = join(outDir, `${slug}.wav`)
    const silent = join(outDir, `${slug}-silent.mp4`)
    const final = join(outDir, `${slug}.mp4`)
    const poster = join(outDir, `${slug}-poster.jpg`)
    const sheet = join(outDir, `${slug}-sheet.jpg`)
    const warnings: string[] = []
    const bgm = join(projectDir, 'bgm.json')
    if (existsSync(bgm)) {
      await this.run('bgm.mjs', ['--config', bgm, '--out', wav], signal)
    } else {
      warnings.push('bgm.json is missing; rendering a silent video')
    }
    await this.run('render.mjs', [
      '--html', htmlPath, '--out', silent,
      '--width', String(width), '--height', String(height), '--fps', String(fps),
      '--duration', String(duration), '--poster', String(args.poster ?? Math.max(0, duration - 1.2)),
      '--crf', String(args.crf ?? 20),
    ], signal)
    let delivered = silent
    if (warnings.length === 0) {
      await this.run('mux.mjs', ['--video', silent, '--audio', wav, '--out', final], signal)
      delivered = final
    }
    const platformMatch = /const PLATFORM = '([^']*)'/u.exec(html)
    const safeMatch = /const SAFE = \{ left: (-?\d+), top: (-?\d+), right: (-?\d+), bottom: (-?\d+) \};/u.exec(html)
    const platform = platformMatch?.[1] ?? 'custom'
    const safeArea = safeMatch === null
      ? null
      : {
        left: Number(safeMatch[1]), top: Number(safeMatch[2]),
        right: Number(safeMatch[3]), bottom: Number(safeMatch[4]),
      }
    const qc = await this.run('qc.mjs', ['--video', delivered, '--sheet', String(args.sheet ?? 8), '--sheet-out', sheet], signal)
    const renderedPoster = silent.replace(/\.mp4$/iu, '-poster.jpg')
    if (existsSync(renderedPoster)) await copyFile(renderedPoster, poster)
    const info = await stat(delivered)
    return {
      document: {
        title: slug,
        projectDir,
        htmlPath,
        videoPath: delivered,
        silentPath: silent,
        posterPath: poster,
        sheetPath: sheet,
        wavPath: existsSync(wav) ? wav : null,
        width,
        height,
        fps,
        duration,
        durationMs: Math.round(duration * 1000),
        bytes: info.size,
        platform,
        safeArea,
        qc: qc.json,
      },
      warnings,
    }
  }

  private async still(args: MotionRequestMap['still'], signal: AbortSignal): Promise<MotionOutcome> {
    const htmlPath = this.projectDir(args.htmlPath)
    const slug = basename(dirname(htmlPath))
    const outputPath = args.outputPath === undefined
      ? join(this.root, 'out', `${slug}-still-${String(args.time).replace('.', '_')}.png`)
      : this.projectDir(args.outputPath)
    const result = await this.run('still.mjs', [
      '--html', htmlPath, '--out', outputPath, '--t', String(args.time),
      ...args.width === undefined ? [] : ['--width', String(args.width)],
      ...args.height === undefined ? [] : ['--height', String(args.height)],
      ...args.guides === true ? ['--guides'] : [],
    ], signal)
    return { document: { ...result.json, htmlPath }, warnings: [] }
  }

  private async qc(args: MotionRequestMap['qc'], signal: AbortSignal): Promise<MotionOutcome> {
    const videoPath = this.projectDir(args.videoPath)
    const result = await this.run('qc.mjs', [
      '--video', videoPath,
      ...args.sheet === undefined ? [] : ['--sheet', String(args.sheet)],
    ], signal)
    return { document: { ...result.json, videoPath }, warnings: [] }
  }

  async invoke(invocation: MotionInvocation, signal: AbortSignal): Promise<MotionOutcome> {
    if (signal.aborted) throw new Error('motion-local: operation cancelled')
    switch (invocation.operation) {
      case 'scaffold': return await this.scaffold(invocation.arguments)
      case 'render': return await this.render(invocation.arguments, signal)
      case 'still': return await this.still(invocation.arguments, signal)
      case 'qc': return await this.qc(invocation.arguments, signal)
    }
  }
}
