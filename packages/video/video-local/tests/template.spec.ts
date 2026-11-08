/**
 * The shipped render project and the host half that drives it live in one
 * package but compile separately: the template's TSX is built by the render
 * project's own toolchain, after setup, against packages the repository does not
 * install. Nothing type-checks across that boundary, so these checks are what
 * catches the two drifting apart.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROJECT_DRIVER, PROJECT_MARKER, VIDEO_COMPOSITION_ID, VIDEO_PAYLOAD_VERSION } from '../src/contract.ts'

/** The shipped template directory. */
const TEMPLATE = fileURLToPath(new URL('../remotion/', import.meta.url))

/**
 * Read one template file.
 * @param relative - path inside the template.
 * @returns the file's text.
 */
function read(relative: string): string {
  return readFileSync(join(TEMPLATE, relative), 'utf8')
}

describe('the shipped render project', () => {
  it('carries the driver the provider spawns', () => {
    expect(read(PROJECT_MARKER)).toContain('renderMedia')
    expect(read(PROJECT_DRIVER)).toContain('ensureBrowser')
  })

  it('registers the composition the host selects and the revision it sends', () => {
    expect(read('src/contract.ts')).toContain(`COMPOSITION_ID = '${VIDEO_COMPOSITION_ID}'`)
    expect(read('src/contract.ts')).toContain(`PROPS_VERSION = ${String(VIDEO_PAYLOAD_VERSION)}`)
    expect(read('src/Root.tsx')).toContain('COMPOSITION_ID')
  })

  it('declares every member the host puts in a props document', () => {
    const props = read('src/contract.ts')
    for (const member of [
      'version', 'title', 'subtitle', 'totalMs', 'scenes',
      'heading', 'narration', 'bullets', 'layout', 'audio', 'durationMs', 'subtitles',
      'text', 'startMs', 'endMs',
    ]) {
      expect(props).toContain(member)
    }
  })

  it('derives the composition length from the storyboard it renders', () => {
    expect(read('src/Root.tsx')).toContain('calculateMetadata')
    expect(read('src/timeline.ts')).toContain('calculateShortVideoMetadata')
    // The frame arithmetic must live in one place, so the progress bar and the
    // last scene cannot disagree about where the video ends.
    expect(read('src/ShortVideo.tsx')).toContain('sceneFrames')
    expect(read('src/timeline.ts')).toContain('sceneFrames')
  })

  it('renders every layout the host may send', () => {
    const component = read('src/ShortVideo.tsx')
    for (const layout of ['title', 'points', 'quote', 'stat']) {
      expect(component).toContain(`case '${layout}'`)
    }
  })

  it('carries a manifest a package manager can install', () => {
    const manifest = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies)).toEqual(expect.arrayContaining(['react', 'react-dom', 'remotion']))
    expect(Object.keys(manifest.devDependencies)).toEqual(expect.arrayContaining(['@remotion/bundler', '@remotion/renderer']))
    // Every Remotion package has to be one version; its own runtime enforces it.
    const versions = new Set(
      Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
        .filter(([name]) => name.includes('remotion'))
        .map(([, version]) => version),
    )
    expect(versions.size).toBe(1)
  })

  it('is published with the package', () => {
    const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect((manifest as { files: string[] }).files).toContain('remotion/**')
  })
})
