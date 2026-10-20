/**
 * The playback route: the one HTTP surface that lets a browser watch a rendered
 * video in place.
 *
 * The route serves exactly one directory — the render project's own — and only
 * files that resolve inside it after both textual normalization and a real-path
 * check, so a traversal or a symlink leaving the project is refused rather than
 * followed. Responses carry byte ranges, because a `<video>` element seeks with
 * them, and are marked `no-store`, because re-rendering a storyboard overwrites
 * the file its own URL points at.
 *
 * @module @deepseek-ai/dsh-video-local/route
 */

import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, normalize, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { VIDEO_ROUTE_PREFIX } from './contract.ts'

/** Content types by file extension; anything else is served as a byte stream. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.srt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webm': 'video/webm',
}

/**
 * Content type for one served file.
 * @param path - the file's absolute path.
 * @returns the media type, or a byte stream for an extension this route does not know.
 */
export function contentType(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/** One inclusive byte range of a file. */
export interface ByteRange {
  /** First byte served. */
  readonly start: number
  /** Last byte served, inclusive. */
  readonly end: number
}

/**
 * Read one `Range` request header against a file's size.
 * @param header - the header value.
 * @param size - the file's size in bytes.
 * @returns the range to serve, or null when the request asks for none or asks for one the file cannot satisfy.
 */
export function parseRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null || size === 0) return null
  const rawStart = match[1] as string
  const rawEnd = match[2] as string
  if (rawStart === '' && rawEnd === '') return null
  if (rawStart === '') {
    // A suffix range asks for the last N bytes, which is how a player reads a
    // file's tail to find its index.
    const length = Number(rawEnd)
    if (!Number.isInteger(length) || length <= 0) return null
    return { start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(rawStart)
  if (!Number.isInteger(start) || start >= size) return null
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (!Number.isInteger(end) || end < start) return null
  return { start, end }
}

/**
 * Resolve one request path to a file inside the served directory.
 *
 * The check is textual: the resolved path must be the directory itself or sit
 * beneath it. {@link serve} repeats it against the real path, because a symlink
 * inside the directory can still point outside it.
 * @param root - the directory the route serves.
 * @param pathname - the request path, relative to that directory.
 * @returns the absolute path, or null when it escapes the directory or cannot be decoded.
 */
export function resolveWithin(root: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // A malformed percent escape is the only way decoding fails, and a path this
    // route cannot read is one it must not serve.
    return null
  }
  if (decoded.includes('\0')) return null
  const relative = decoded.replace(/^\/+/, '')
  if (relative.length === 0) return null
  const target = resolve(root, normalize(relative))
  if (target === root || !target.startsWith(root + sep)) return null
  return target
}

/**
 * Serve one request from the rendered-video directory.
 *
 * The registration's own prefix is what the path is read against, so no second
 * check repeats it here.
 * @param req - the request; only GET and HEAD are served.
 * @param res - the response, whose lifecycle this function owns.
 * @param root - the render project directory.
 */
async function serve(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  const claimed = resolveWithin(root, pathname.slice(VIDEO_ROUTE_PREFIX.length))
  if (claimed === null) {
    res.writeHead(404)
    res.end()
    return
  }
  const real = await realpath(claimed).catch(() => null)
  const realRoot = await realpath(root).catch(() => root)
  if (real === null || !real.startsWith(realRoot + sep)) {
    res.writeHead(404)
    res.end()
    return
  }
  /* v8 ignore next -- the file can be removed between the real-path check above and this stat, which no test can time. */
  const info = await stat(real).catch(() => null)
  if (info?.isFile() !== true) {
    res.writeHead(404)
    res.end()
    return
  }
  const size = info.size
  const header = req.headers.range
  const range = typeof header === 'string' ? parseRange(header, size) : null
  const type = contentType(real)
  const body = range === null
    ? createReadStream(real)
    : createReadStream(real, { start: range.start, end: range.end })
  // A file removed between the stat above and this open is the one failure the
  // stream itself can report; the headers are already sent by then, so the
  // response is dropped rather than left open.
  /* v8 ignore next -- the window between the stat and the open is what makes this reachable, so no test can enter it deterministically. */
  body.on('error', () => { res.destroy() })
  if (range !== null) {
    res.writeHead(206, {
      'content-type': type,
      'content-length': range.end - range.start + 1,
      'content-range': `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    body.pipe(res)
    return
  }
  res.writeHead(200, {
    'content-type': type,
    'content-length': size,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  body.pipe(res)
}

/**
 * Mount the playback route.
 *
 * The handler returns the serving promise rather than dropping it, so the web
 * server observes the route's outcome instead of a response that reports
 * nothing about itself.
 * @param ctx - context whose web server receives the route.
 * @param projectRoot - the render project directory the route serves.
 * @returns the disposer removing the route.
 */
export function installVideoRoute(ctx: Context, projectRoot: string): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: VIDEO_ROUTE_PREFIX,
    handler: (req, res) => serve(req, res, projectRoot),
  })
}
