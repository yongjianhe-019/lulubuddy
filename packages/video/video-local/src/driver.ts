/**
 * Reading the render driver's answer.
 *
 * The driver writes one JSON object to stdout, but it runs Remotion's bundler
 * and encoder in the same process, so lines those print can precede it. The
 * answer is therefore the last line that parses as the driver's own object
 * rather than simply the last line.
 *
 * @module @deepseek-ai/dsh-video-local/driver
 */

/** The render driver's success object. */
export interface DriverSuccess {
  readonly ok: true
  /** Absolute path of the video the driver wrote. */
  readonly output: string
  /** Frame size the composition reported, which is the bundle's real geometry. */
  readonly width: number
  readonly height: number
  /** Frame rate the composition reported. */
  readonly fps: number
  /** Composition length in frames. */
  readonly durationInFrames: number
  /** Size of the written file, in bytes. */
  readonly bytes: number
}

/** The render driver's failure object. */
export interface DriverFailure {
  readonly ok: false
  /** The driver's own message. */
  readonly error: string
}

/** One render driver's answer. */
export type DriverResult = DriverSuccess | DriverFailure

/**
 * Whether a parsed line is a driver answer.
 * @param value - the parsed value.
 * @returns whether it carries the driver's discriminant.
 */
function isDriverResult(value: unknown): value is DriverResult {
  return typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean'
}

/**
 * Whether the driver reported success, whatever it was asked to do.
 *
 * The setup step asks the driver to install a browser rather than to render, so
 * it reads only the driver's own verdict and not a render's fields.
 * @param stdout - everything the driver wrote to stdout.
 * @returns whether its answer says the command succeeded.
 */
export function driverSucceeded(stdout: string): boolean {
  return findAnswer(stdout)?.ok === true
}

/**
 * Read the driver's answer out of its captured stdout.
 * @param stdout - everything the driver wrote to stdout.
 * @returns the answer.
 * @throws when no line carries one, which means the driver died before reporting.
 */
export function readDriverResult(stdout: string): DriverResult {
  const answer = findAnswer(stdout)
  if (answer === undefined) throw new Error('render driver produced no result; it exited before reporting')
  if (!answer.ok) {
    const detail = (answer as { error?: unknown }).error
    return { ok: false, error: typeof detail === 'string' ? detail : 'render driver reported no error detail' }
  }
  const candidate = answer as Partial<DriverSuccess>
  const complete = typeof candidate.output === 'string'
    && typeof candidate.width === 'number'
    && typeof candidate.height === 'number'
    && typeof candidate.fps === 'number'
    && typeof candidate.durationInFrames === 'number'
    && typeof candidate.bytes === 'number'
  // A success line without a render's fields means the driver was asked for
  // something other than a render; this reader only answers for renders.
  if (!complete) return { ok: false, error: 'render driver reported no error detail' }
  return candidate as DriverSuccess
}

/**
 * Find the driver's own answer among the lines the same process printed.
 * @param stdout - everything the driver wrote to stdout.
 * @returns the driver's answer, or undefined when it wrote none.
 */
function findAnswer(stdout: string): DriverResult | undefined {
  const lines = stdout.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = (lines[index] as string).trim()
    if (line.length === 0 || !line.startsWith('{')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      // A bundler progress line can start with a brace; only a line that parses
      // as an object can be the driver's own answer, so skipping is the complete
      // response to unparseable output here.
      continue
    }
    if (isDriverResult(parsed)) return parsed
  }
  return undefined
}
