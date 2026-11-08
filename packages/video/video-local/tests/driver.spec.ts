/**
 * Reading the render driver's answer out of a stdout the bundler and encoder
 * also write to.
 */

import { describe, expect, it } from 'vitest'
import { driverSucceeded, readDriverResult } from '../src/driver.ts'

/** One driver success line, as the shipped driver writes it. */
const SUCCESS = '{"ok":true,"output":"/tmp/out/x.mp4","width":1080,"height":1920,"fps":30,"durationInFrames":186,"bytes":200373}'

describe('readDriverResult', () => {
  it('reads the driver line', () => {
    expect(readDriverResult(`${SUCCESS}\n`)).toEqual({
      ok: true,
      output: '/tmp/out/x.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 186,
      bytes: 200373,
    })
  })

  it('reads it past whatever else the same process printed', () => {
    const stdout = [
      'Bundling...',
      '{"progress":0.5}',
      '',
      'Encoding 12/186',
      SUCCESS,
      '',
    ].join('\n')
    expect(readDriverResult(stdout).ok).toBe(true)
  })

  it('reports the driver\'s own failure', () => {
    expect(readDriverResult('{"ok":false,"error":"composition not found"}'))
      .toEqual({ ok: false, error: 'composition not found' })
  })

  it('reports a failure that carries no detail of its own', () => {
    expect(readDriverResult('{"ok":false}')).toEqual({ ok: false, error: 'render driver reported no error detail' })
    expect(readDriverResult('{"ok":false,"error":42}')).toEqual({ ok: false, error: 'render driver reported no error detail' })
  })

  it('refuses a success line missing any member, reporting the failure shape', () => {
    expect(readDriverResult('{"ok":true,"output":"/tmp/x.mp4"}'))
      .toEqual({ ok: false, error: 'render driver reported no error detail' })
  })

  it('throws when the driver exited before reporting', () => {
    expect(() => readDriverResult('')).toThrow(/produced no result/)
    expect(() => readDriverResult('Bundling...\nSomething failed\n')).toThrow(/produced no result/)
    // A brace that opens no JSON object is skipped rather than read.
    expect(() => readDriverResult('{not json}\n')).toThrow(/produced no result/)
    // Neither is JSON that carries no verdict of its own.
    expect(() => readDriverResult('{"progress":0.5}\n')).toThrow(/produced no result/)
  })

  it('reads the driver\'s verdict on a command that renders nothing', () => {
    expect(driverSucceeded('{"ok":true,"browser":"ready"}')).toBe(true)
    expect(driverSucceeded('{"ok":false,"error":"offline"}')).toBe(false)
    expect(driverSucceeded('no answer')).toBe(false)
  })
})
