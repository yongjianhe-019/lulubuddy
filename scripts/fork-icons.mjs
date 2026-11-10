#!/usr/bin/env node
/**
 * fork-icons — regenerate every dsh icon surface from one square-ish image.
 *
 *   node scripts/fork-icons.mjs <image> [--mark <cutout.png>] [--app] [--dry]
 *
 *   App icons use the whole square. The in-app mark and the favicon use
 *   `--mark` when given (a background-removed cutout, which reads as a
 *   character rather than a cropped photo), otherwise a top-centre head crop.
 *   --app    also patch the installed /Applications app and refresh its icon cache
 *   --dry    print the plan and write nothing
 *
 * Writes:
 *   apps/desktop/resources/icon-macos.png      1024  (electron-builder mac icon)
 *   apps/desktop/resources/icon.png            1024  (generic)
 *   apps/desktop/resources/icon-windows.png     256  (electron-builder win icon)
 *   apps/web/public/icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
 *   apps/web/public/favicon.svg + favicon-dark.svg  (the bitmap wrapped in an SVG,
 *     so the upstream index.html keeps its <link rel="icon"> untouched)
 *
 * The SVG vector sources under resources/ are left alone: they are the shipped
 * brand mark, and this is a local re-skin.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP = '/Applications/DeepSeek Harness.app'

const argv = process.argv.slice(2)
const source = argv.find((a) => !a.startsWith('--'))
const patchApp = argv.includes('--app')
const markSource = (() => { const i = argv.indexOf('--mark'); return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined })()
const dry = argv.includes('--dry')

if (!source) {
  console.error('usage: node scripts/fork-icons.mjs <image> [--mark <cutout.png>] [--app] [--dry]')
  process.exit(1)
}
if (!existsSync(source)) {
  console.error(`no such file: ${source}`)
  process.exit(1)
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' })
const probe = (file, key) =>
  Number(run('sips', ['-g', key, file]).toString().match(new RegExp(`${key}:\\s*(\\d+)`))[1])

if (!statSync(source).isFile()) {
  console.error(`not a file: ${source}`)
  process.exit(1)
}

const width = probe(source, 'pixelWidth')
const height = probe(source, 'pixelHeight')
const side = Math.min(width, height)
const work = mkdtempSync(join(tmpdir(), 'dsh-icons-'))

/** Center-crop to a square. */
function cropSquare(file, out) {
  run('sips', ['-c', String(side), String(side), file, '--out', out])
  return out
}

/** Top-centre square: the head and shoulders, for marks that render small. */
function cropFace(file, out) {
  const cropH = Math.round(height * 0.62)
  const cropW = Math.min(width, cropH)
  const x = Math.round((width - cropW) / 2)
  run('sips', ['-c', String(cropH), String(cropW), '--cropOffset', '0', String(x), file, '--out', out])
  return out
}

function png(src, size, dest) {
  run('sips', ['-z', String(size), String(size), src, '--out', dest])
  console.log(`  ${dest.replace(`${ROOT}/`, '')}  ${size}×${size}`)
}

function svgWrap(pngPath, dest) {
  const b64 = readFileSync(pngPath).toString('base64')
  writeFileSync(
    dest,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${b64}"/></svg>\n`,
  )
  console.log(`  ${dest.replace(`${ROOT}/`, '')}  (bitmap in svg)`)
}

const sq = cropSquare(source, join(work, 'full.png'))
const faceSq = cropFace(source, join(work, 'face.png'))
const plan = [
  ['apps/desktop/resources/icon-macos.png', 1024],
  ['apps/desktop/resources/icon.png', 1024],
  ['apps/desktop/resources/icon-windows.png', 256],
  ['apps/web/public/icon-192.png', 192],
  ['apps/web/public/icon-512.png', 512],
  ['apps/web/public/icon-maskable-512.png', 512],
  ['apps/web/public/apple-touch-icon.png', 180],
]

if (dry) {
  console.log(`source ${width}×${height}`)
  console.log('would write:')
  for (const [p, s] of plan) console.log(`  ${p}  ${s}×${s}`)
  console.log('  apps/web/public/favicon.svg + favicon-dark.svg')
  if (patchApp) console.log(`  ${APP}/Contents/Resources/icon.icns + icon.png`)
  rmSync(work, { recursive: true, force: true })
  process.exit(0)
}

console.log('writing:')
const written = new Map()
for (const [rel, size] of plan) {
  const dest = join(ROOT, rel)
  mkdirSync(dirname(dest), { recursive: true })
  png(sq, size, dest)
  written.set(rel, dest)
}
const faviconPng = join(work, 'favicon.png')
if (markSource === undefined) png(faceSq, 128, faviconPng)
else run('sips', ['-z', '128', '128', markSource, '--out', faviconPng])
svgWrap(faviconPng, join(ROOT, 'apps/web/public/favicon.svg'))
svgWrap(faviconPng, join(ROOT, 'apps/web/public/favicon-dark.svg'))

// The in-app mark: a 256 px head crop inlined into the client bundle, so the two
// brand seats need no asset server and the plugin stays a single JS module.
const markPng = join(work, 'mark.png')
if (markSource === undefined) {
  png(faceSq, 256, markPng)
} else {
  run('sips', ['-z', '256', '256', markSource, '--out', markPng])
  console.log(`  (mark from ${markSource})`)
}
const markB64 = readFileSync(markPng).toString('base64')
const markModule = join(ROOT, 'packages/client/ui-workbuddy-shell/src/client/lulu-mark.generated.ts')
writeFileSync(markModule, `/**
 * Generated by \`scripts/fork-icons.mjs\` from the operator's mascot image.
 * Regenerate rather than hand-edit.
 */

/** Square PNG of the mascot's head, base64 (no data-URI prefix). */
export const LULU_MARK_PNG: string | undefined = '${markB64}'
`)
console.log(`  ${markModule.replace(`${ROOT}/`, '')}  (256×256 head crop, base64)`)

if (patchApp) {
  if (!existsSync(APP)) {
    console.error(`skip --app: ${APP} is not installed`)
  } else {
    const iconset = join(work, 'icon.iconset')
    mkdirSync(iconset)
    for (const size of [16, 32, 128, 256, 512]) {
      png(sq, size, join(iconset, `icon_${size}x${size}.png`))
      png(sq, size * 2, join(iconset, `icon_${size}x${size}@2x.png`))
    }
    const icns = join(work, 'icon.icns')
    run('iconutil', ['-c', 'icns', iconset, '-o', icns])
    const res = join(APP, 'Contents/Resources')
    run('cp', [icns, join(res, 'icon.icns')])
    run('cp', [written.get('apps/web/public/icon-512.png'), join(res, 'icon.png')])
    run('touch', [APP])
    console.log(`  ${APP} patched (restart the app; Dock may need a moment)`)
  }
}

rmSync(work, { recursive: true, force: true })
console.log('\ndone. Repackage to bake these in:')
console.log('  pnpm run package:desktop:mac:x64:unsigned')
