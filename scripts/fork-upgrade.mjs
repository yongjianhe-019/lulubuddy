#!/usr/bin/env node
/**
 * fork-upgrade — keep the WorkBuddy fork a thin layer on top of upstream dsh.
 *
 * `node scripts/fork-upgrade.mjs`            report only: gap, guides, hotspots
 * `node scripts/fork-upgrade.mjs --start`    cut upgrade/<version> and merge main
 * `node scripts/fork-upgrade.mjs --finish`   fast-forward main, tag, drop the branch
 * `node scripts/fork-upgrade.mjs --to <ref>` compare against another ref
 *
 * The script never resolves conflicts. It tells you exactly which files need a
 * decision and what the standing rule is for each, so the merge stays a
 * reviewable step rather than a guess.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const git = (args, { allowFail = false } = {}) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch (error) {
    if (allowFail) return ''
    throw error
  }
}

/**
 * Standing resolution rule per shared file. Every entry is a file the fork has
 * edited that upstream also edits, so a merge always collides here. Keep this
 * list current: an upgrade that adds a new hotspot should add it here too.
 */
const HOTSPOTS = {
  'pnpm-lock.yaml': 'take upstream (`git checkout --ours`), then `pnpm install` regenerates it',
  'packages/bundle/web-app/package.json':
    'union the dependency lists, dedupe duplicate keys, keep the fork preset entries',
  'packages/bundle/web-app/cordis.patch.yml':
    'union the plugin rows; never drop an upstream row, never duplicate a fork row id',
  'tsconfig.host.json': 'union the project references',
  'tsconfig.client.json': 'union the project references',
  '.gitignore': 'union the rules',
  'packages/api/session-controller/src/media-references.ts':
    'keep upstream behavior, re-apply the fork-only addition on top',
  'packages/client/ui-sidebar/src/client/SidebarRoot.tsx':
    'keep upstream structure; restore fork-only helpers the merge drops',
  'apps/web/vite.config.ts': 'take upstream, re-apply the fork brand title',
  'packages/client/locale/src/locales/en.ts': 'take upstream, re-apply the fork brand string',
  'packages/client/locale/src/locales/zh.ts': 'take upstream, re-apply the fork brand string',
  'packages/client/ui-conversation/src/client/locales.ts':
    'take upstream, re-apply the fork brand string in the zh and en dictionaries'
}

/** Paths the fork owns outright; a conflict here means someone edited upstream code by hand. */
const FORK_OWNED = [
  'packages/client/ui-workbuddy-mode',
  'packages/client/ui-workbuddy-scenarios',
  'packages/client/ui-workbuddy-shell',
  'packages/client/ui-market-view',
  'packages/client/ui-video-view',
  'packages/client/ui-xhs-view',
  'packages/client/ui-ppt-view',
  'packages/client/ui-motion-view',
  'packages/client/ui-image-view',
  'packages/video/video-local',
  'packages/video/xhs-local',
  'packages/design/ppt-local',
  'packages/design/motion-local',
  'packages/design/image-local',
  'packages/market/market-local'
]


// ── Release-family consistency (desktop packaging enforces both) ─────────────
/**
 * The desktop packager refuses to build unless every workspace package carries
 * the root version and every intra-family dependency is an exact `workspace:*`.
 * Both break silently during a version bump, so report them up front.
 */
function checkFamily() {
  const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const mismatched = []
  const caret = []
  for (const entry of readdirSync(new URL('../packages/', import.meta.url), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let inner
    try {
      inner = readdirSync(new URL(`../packages/${entry.name}/`, import.meta.url), { withFileTypes: true })
    } catch {
      continue
    }
    for (const pkg of inner) {
      if (!pkg.isDirectory()) continue
      const path = `packages/${entry.name}/${pkg.name}/package.json`
      let manifest
      try {
        manifest = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
      } catch {
        continue
      }
      if (manifest.version !== root) mismatched.push(`${path} (${manifest.version})`)
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, range] of Object.entries(manifest[section] ?? {})) {
          if (name.startsWith('@deepseek-ai/dsh-') && range !== 'workspace:*') {
            caret.push(`${path}: ${section}.${name} = ${range}`)
          }
        }
      }
    }
  }
  if (!mismatched.length && !caret.length) return
  console.log(`\n── release family (root ${root}) ─────────────────────────────────────`)
  if (mismatched.length) {
    console.log(`  ${mismatched.length} package(s) are not on the root version:`)
    for (const m of mismatched.slice(0, 20)) console.log(`    ${m}`)
  }
  if (caret.length) {
    console.log(`  ${caret.length} intra-family dependenc(ies) must be workspace:* (exact):`)
    for (const c of caret.slice(0, 20)) console.log(`    ${c}`)
  }
  console.log('  The desktop packager rejects both. Fix before `pnpm run package:desktop:*`.')
}

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
const FORK_BRANCH = value('--branch-base', 'main')
const target = value('--to', 'origin/master')

console.log(`fork branch : ${branch}`)
console.log(`upstream ref: ${target}\n`)

git(['fetch', 'origin', '--tags', '--prune'], { allowFail: true })
checkFamily()

const counts = git(['rev-list', '--left-right', '--count', `${branch}...${target}`]).split(/\s+/)
const [ahead, behind] = [Number(counts[0]), Number(counts[1])]
const base = git(['merge-base', branch, target], { allowFail: true })

const versionOf = (ref) => {
  try {
    return JSON.parse(git(['show', `${ref}:package.json`])).version
  } catch {
    return '?'
  }
}

console.log(`local  version: ${versionOf(branch)}`)
console.log(`upstream       : ${versionOf(target)}`)
console.log(`commits        : fork ahead ${ahead}, upstream ahead ${behind}`)
if (base) console.log(`merge base     : ${git(['log', '-1', '--format=%h %ad %s', '--date=short', base])}`)

if (behind === 0) {
  console.log('\nAlready up to date with upstream. Nothing to do.')
  process.exit(0)
}

// ── Official upgrade guides that landed after the fork point ────────────────
if (base) {
  const guides = git(['ls-tree', '-r', '--name-only', target, '--', 'docs/upgrade-guide'])
    .split('\n')
    .filter((p) => p.endsWith('/guide.md'))
  const added = guides.filter((p) => {
    try {
      execFileSync('git', ['cat-file', '-e', `${base}:${p}`], { stdio: 'ignore' })
      return false
    } catch {
      return true
    }
  })
  const touched = guides.filter((p) => {
    if (added.includes(p)) return false
    const at = git(['rev-parse', `${base}:${p}`], { allowFail: true })
    const now = git(['rev-parse', `${target}:${p}`], { allowFail: true })
    return at !== now
  })
  const relevant = [...added, ...touched]
  console.log(`\n── upgrade guides to read (${relevant.length}) ──────────────────────────`)
  if (relevant.length === 0) {
    console.log('  (none)')
  } else {
    const byVersion = new Map()
    for (const p of relevant) {
      const [, , version, slug] = p.split('/')
      if (!byVersion.has(version)) byVersion.set(version, [])
      byVersion.get(version).push(slug)
    }
    for (const [version, slugs] of [...byVersion].sort()) {
      console.log(`  ${version} (${slugs.length})`)
      console.log(`    ${slugs.join(', ')}`)
    }
  }
  console.log('\n  Read each guide.md before resolving conflicts: they name the exact API\n  changes and the migration steps.')
}

// ── Conflict surface ────────────────────────────────────────────────────────
const changed = (ref) => git(['diff', '--name-only', base, ref]).split('\n').filter(Boolean)
const ours = new Set(changed(branch))
const theirs = changed(target)
const both = theirs.filter((p) => ours.has(p))

console.log(`\n── conflict surface ───────────────────────────────────────────────────`)
console.log(`  fork changed ${ours.size} files, upstream changed ${theirs.length}, overlap ${both.length}`)
for (const p of both) {
  const rule = HOTSPOTS[p] ?? 'no standing rule — decide, then add it to HOTSPOTS in this script'
  console.log(`\n  ${p}`)
  console.log(`    ${rule}`)
}

// ── Fork-owned packages that upstream touched ──────────────────────────────
const collisions = both.filter((p) => FORK_OWNED.some((d) => p.startsWith(d)))
if (collisions.length) {
  console.log(`\n⚠ upstream edited fork-owned paths (unexpected):`)
  for (const p of collisions) console.log(`    ${p}`)
}

// ── Files upstream deleted that the fork still references ──────────────────
const deleted = git(['diff', '--diff-filter=D', '--name-only', base, target]).split('\n').filter(Boolean)
if (deleted.length) {
  console.log(`\n── upstream deleted ${deleted.length} files ──────────────────────────────`)
  console.log('  Check that no fork package imports them, and that no bundle dependency')
  console.log('  names a workspace package that no longer exists (pnpm install will fail).')
}


// ── Fast-forward main, tag the release, drop the upgrade branch ─────────────
if (flag('--finish')) {
  if (!branch.startsWith('upgrade/')) {
    console.error(`\n--finish expects an upgrade/<version> branch, found ${branch}.`)
    process.exit(1)
  }
  if (git(['status', '--porcelain'])) {
    console.error('\nWorking tree is dirty. Commit first.')
    process.exit(1)
  }
  const version = versionOf(target)
  const tag = `fork/${version}`
  console.log(`\n── finishing ${branch} ────────────────────────────────────────────`)
  git(['checkout', FORK_BRANCH])
  try {
    git(['merge', '--ff-only', branch])
  } catch {
    console.error(`\n${FORK_BRANCH} is not a fast-forward of ${branch}. Merge it by hand.`)
    process.exit(1)
  }
  git(['tag', '-f', tag, 'HEAD'])
  git(['branch', '-D', branch])
  console.log(`  ${FORK_BRANCH} -> ${git(['rev-parse', '--short', 'HEAD'])}`)
  console.log(`  tagged ${tag}`)
  console.log(`  deleted ${branch}`)
  console.log(`\nPush when the smoke test is clean:\n  git push lulubuddy ${FORK_BRANCH}`)
  process.exit(0)
}

if (!flag('--start')) {
  console.log(`\nReport only. To cut the upgrade branch and merge:\n  node scripts/fork-upgrade.mjs --start`)
  process.exit(0)
}

// ── Cut the branch and merge ────────────────────────────────────────────────
const next = value('--branch', `upgrade/${versionOf(target)}`)
if (git(['status', '--porcelain'])) {
  console.error('\nWorking tree is dirty. Commit or stash first so the merge is reviewable.')
  process.exit(1)
}
console.log(`\n── cutting ${next} from ${target} and merging ${FORK_BRANCH} ─────────────────`)
git(['checkout', '-b', next, target])
try {
  git(['merge', FORK_BRANCH, '--no-commit', '--no-ff'])
  console.log('\nMerged with no conflicts.')
} catch {
  const conflicted = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)
  console.log(`\n${conflicted.length} conflicted file(s):`)
  for (const p of conflicted) console.log(`  ${p}`)
}
console.log(`
Next:
  1. resolve each conflict with the rule above
  2. read the upgrade guides listed earlier
  3. git add -A && git commit
  4. pnpm install
  5. pnpm run typecheck
  6. pnpm run build:artifacts
  7. pnpm dsh web --no-open --port 3080   (smoke test the UI)
  8. node scripts/fork-upgrade.mjs --finish
`)
