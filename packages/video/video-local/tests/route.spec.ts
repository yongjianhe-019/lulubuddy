/**
 * The playback route: what it serves, what it refuses, and the byte ranges a
 * `<video>` element seeks with.
 *
 * Every case that reaches the filesystem runs against a real directory, because
 * the traversal defense is a property of resolved paths and not of the strings
 * the route starts from.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contentType, installVideoRoute, parseRange, resolveWithin } from '../src/route.ts'

/** A response that records what a handler wrote and resolves when it settles. */
class FakeResponse extends Writable {
  status = 0
  headers: Record<string, string | number> = {}
  readonly chunks: Buffer[] = []
  /** Resolves when the response finishes writing. */
  readonly finished: Promise<void>
  /** Resolves when the response closes, which a dropped response does instead of finishing. */
  readonly closeFinished: Promise<void>
  private settleFinish: () => void = () => {}
  private settleClose: () => void = () => {}

  constructor() {
    super()
    this.finished = new Promise((resolve) => { this.settleFinish = resolve })
    this.closeFinished = new Promise((resolve) => { this.settleClose = resolve })
    this.on('finish', () => { this.settleFinish() })
    this.on('close', () => { this.settleClose() })
  }

  /**
   * Record the status line and headers.
   * @param status - the status code.
   * @param headers - the response headers.
   * @returns this response, as node's own does.
   */
  writeHead(status: number, headers: Record<string, string | number> = {}): this {
    this.status = status
    this.headers = headers
    return this
  }

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk))
    done()
  }

  override end(chunk?: unknown, encoding?: unknown, done?: unknown): this {
    super.end(chunk as never, encoding as never, done as never)
    this.settleFinish()
    return this
  }
}

let root: string
let routes: { handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-video-route-'))
  routes = []
})

afterEach(() => { rmSync(root, { recursive: true, force: true }) })

/**
 * Mount the route over a capturing registry and return its handler.
 * @returns the registered handler.
 */
function mount(): (req: IncomingMessage, res: ServerResponse) => void | Promise<void> {
  const ctx = {
    webServer: {
      register: (route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) => {
        expect(route.kind).toBe('prefix')
        expect(route.path).toBe('/video')
        routes.push(route)
        return () => { routes.length = 0 }
      },
    },
  }
  const dispose = installVideoRoute(ctx as never, root)
  expect(dispose).toBeTypeOf('function')
  dispose()
  expect(routes).toHaveLength(0)
  installVideoRoute(ctx as never, root)
  return (routes[0] as { handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }).handler
}

/**
 * Send one request at the mounted route.
 * @param handler - the mounted handler.
 * @param url - the request path.
 * @param init - method and headers.
 * @returns the response that recorded what happened.
 */
async function send(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  url: string,
  init: { method?: string; range?: string } = {},
): Promise<FakeResponse> {
  const res = new FakeResponse()
  const req = { method: init.method ?? 'GET', url, headers: init.range === undefined ? {} : { range: init.range } }
  await handler(req as IncomingMessage, res as unknown as ServerResponse)
  // A body is piped after the handler returns; `end` already ran for every case
  // that has no body, so this resolves immediately for those.
  await res.finished
  return res
}

/**
 * Write one file inside the served directory.
 * @param name - path relative to the served directory.
 * @param content - the bytes to write.
 * @returns the file's absolute path.
 */
function serve(name: string, content: string): string {
  const target = join(root, name)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content)
  return target
}

describe('contentType', () => {
  it('names the media types a card plays and streams anything else', () => {
    expect(contentType('/x/out/v.mp4')).toBe('video/mp4')
    expect(contentType('/x/narration/a.MP3')).toBe('audio/mpeg')
    expect(contentType('/x/a.srt')).toBe('text/plain; charset=utf-8')
    expect(contentType('/x/props.json')).toBe('application/json; charset=utf-8')
    expect(contentType('/x/a.webm')).toBe('video/webm')
    expect(contentType('/x/a.png')).toBe('image/png')
    expect(contentType('/x/a.jpeg')).toBe('image/jpeg')
    expect(contentType('/x/a.bin')).toBe('application/octet-stream')
  })
})

describe('parseRange', () => {
  it('reads the ranges a player asks for', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=100-', 1000)).toEqual({ start: 100, end: 999 })
    // A suffix range is how a player reads a container's index at the tail.
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    // An end past the file is clamped to the file.
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange(' bytes=0-99 ', 1000)).toEqual({ start: 0, end: 99 })
  })

  it('refuses a range the file cannot satisfy', () => {
    expect(parseRange('items=0-99', 1000)).toBeNull()
    expect(parseRange('bytes=', 1000)).toBeNull()
    expect(parseRange('bytes=-', 1000)).toBeNull()
    expect(parseRange('bytes=-0', 1000)).toBeNull()
    expect(parseRange('bytes=-x', 1000)).toBeNull()
    expect(parseRange('bytes=1000-', 1000)).toBeNull()
    expect(parseRange('bytes=x-', 1000)).toBeNull()
    expect(parseRange('bytes=5-1', 1000)).toBeNull()
    expect(parseRange('bytes=0-1.5', 1000)).toBeNull()
    // An empty file has no byte any range could name.
    expect(parseRange('bytes=0-0', 0)).toBeNull()
  })
})

describe('resolveWithin', () => {
  it('resolves a path inside the served directory', () => {
    expect(resolveWithin('/srv', '/out/x.mp4')).toBe(join('/srv', 'out', 'x.mp4'))
    expect(resolveWithin('/srv', 'out/x.mp4')).toBe(join('/srv', 'out', 'x.mp4'))
    // A decoded escape is resolved like any other character, inside the root.
    expect(resolveWithin('/srv', '/out/%E8%A7%86%E9%A2%91.mp4')).toBe(join('/srv', 'out', '视频.mp4'))
  })

  it('refuses anything that leaves the root or names it', () => {
    expect(resolveWithin('/srv', '/')).toBeNull()
    expect(resolveWithin('/srv', '')).toBeNull()
    // An absolute-looking request is still rooted: `/video/etc/passwd` names a
    // file inside the served directory, not the host's.
    expect(resolveWithin('/srv', '/etc/passwd')).toBe(join('/srv', 'etc', 'passwd'))
    expect(resolveWithin('/srv', '//etc/passwd')).toBe(join('/srv', 'etc', 'passwd'))
    expect(resolveWithin('/srv', '/../etc/passwd')).toBeNull()
    expect(resolveWithin('/srv', '/out/../../etc/passwd')).toBeNull()
    expect(resolveWithin('/srv', '/out/%2e%2e/%2e%2e/etc/passwd')).toBeNull()
    // A malformed escape and an embedded NUL are both unreadable paths.
    expect(resolveWithin('/srv', '/out/%zz')).toBeNull()
    expect(resolveWithin('/srv', '/out/a%00b.mp4')).toBeNull()
    // A sibling directory whose name merely starts with the root's is outside it.
    expect(resolveWithin('/srv', '/../srv-other/x.mp4')).toBeNull()
  })
})

describe('the mounted playback route', () => {
  it('serves a whole file and advertises ranges', async () => {
    serve('out/x.mp4', 'VIDEOBYTES')
    const res = await send(mount(), '/video/out/x.mp4')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('video/mp4')
    expect(res.headers['content-length']).toBe(10)
    expect(res.headers['accept-ranges']).toBe('bytes')
    // A re-render writes the same URL, so a cached body would be the old video.
    expect(res.headers['cache-control']).toBe('no-store')
    expect(Buffer.concat(res.chunks).toString()).toBe('VIDEOBYTES')
  })

  it('serves a range so a player can seek', async () => {
    serve('out/x.mp4', 'VIDEOBYTES')
    const res = await send(mount(), '/video/out/x.mp4', { range: 'bytes=2-5' })
    expect(res.status).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 2-5/10')
    expect(res.headers['content-length']).toBe(4)
    expect(Buffer.concat(res.chunks).toString()).toBe('DEOB')
  })

  it('answers a head request without a body', async () => {
    serve('out/x.mp4', 'VIDEOBYTES')
    const whole = await send(mount(), '/video/out/x.mp4', { method: 'HEAD' })
    expect(whole.status).toBe(200)
    expect(whole.chunks).toHaveLength(0)
    const ranged = await send(mount(), '/video/out/x.mp4', { method: 'HEAD', range: 'bytes=0-1' })
    expect(ranged.status).toBe(206)
    expect(ranged.chunks).toHaveLength(0)
  })

  it('refuses a method it does not serve', async () => {
    serve('out/x.mp4', 'VIDEOBYTES')
    const res = await send(mount(), '/video/out/x.mp4', { method: 'POST' })
    expect(res.status).toBe(405)
    expect(res.headers['allow']).toBe('GET, HEAD')
  })

  it('reads a request that carries no URL at all', async () => {
    const handler = mount()
    const res = new FakeResponse()
    await handler({ method: 'GET', headers: {} } as IncomingMessage, res as unknown as ServerResponse)
    expect(res.status).toBe(404)
  })

  it('answers not found for everything outside the project', async () => {
    serve('out/x.mp4', 'VIDEOBYTES')
    expect((await send(mount(), '/video/../secret')).status).toBe(404)
    expect((await send(mount(), '/video/out/missing.mp4')).status).toBe(404)
    // A directory inside the root is not a file to serve.
    expect((await send(mount(), '/video/out')).status).toBe(404)
    expect((await send(mount(), '/video/out/')).status).toBe(404)
  })

  it('answers not found when the directory it serves is gone', async () => {
    serve('out/x.mp4', 'VIDEOBYTES')
    const handler = mount()
    rmSync(root, { recursive: true, force: true })
    const res = new FakeResponse()
    await handler({ method: 'GET', url: '/video/out/x.mp4', headers: {} } as IncomingMessage, res as unknown as ServerResponse)
    expect(res.status).toBe(404)
  })

  it('refuses a symlink that points out of the root', async () => {
    const outside = join(tmpdir(), `dsh-video-outside-${String(process.pid)}.mp4`)
    writeFileSync(outside, 'SECRET')
    try {
      serve('out/ok.mp4', 'VIDEOBYTES')
      symlinkSync(outside, join(root, 'out', 'link.mp4'))
      expect((await send(mount(), '/video/out/link.mp4')).status).toBe(404)
    } finally {
      rmSync(outside, { force: true })
    }
  })

  it('serves a file reached through a symlink that stays inside the root', async () => {
    serve('out/real.mp4', 'VIDEOBYTES')
    symlinkSync(join(root, 'out', 'real.mp4'), join(root, 'out', 'alias.mp4'))
    const res = await send(mount(), '/video/out/alias.mp4')
    expect(res.status).toBe(200)
  })

  it('drops the response when a file found by the stat cannot then be read', async () => {
    // A stat succeeds on a file the process may not open; the stream then fails
    // after the headers are already sent, which is the one case this route can
    // do nothing but drop.
    const target = serve('out/locked.mp4', 'VIDEOBYTES')
    chmodSync(target, 0o000)
    const handler = mount()
    const res = new FakeResponse()
    await handler({ method: 'GET', url: '/video/out/locked.mp4', headers: {} } as IncomingMessage, res as unknown as ServerResponse)
    expect(res.status).toBe(200)
    await res.closeFinished
    expect(res.destroyed).toBe(true)
  })
})
