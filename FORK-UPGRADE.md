# Upgrading the fork

The fork tracks upstream `master`. An upgrade is one merge, a handful of
conflicts, and a build. Read [`FORK.md`](FORK.md) first: the number of upstream
files the fork edits is the number of conflicts you will resolve.

## 1. Check what is waiting

```sh
node scripts/fork-upgrade.mjs
```

Prints the version gap, the **official upgrade guides** that landed after the
fork point, and the exact conflict surface with the standing rule for each file.

Exit code is 0 either way; read the output.

## 2. Read the upgrade guides

Upstream ships a migration note per breaking change in `docs/upgrade-guide/`.
The script lists the ones newer than the fork. Read each `guide.md` **before**
resolving anything — they name the exact API change and the migration step.

Do not skip this. The 0.2.2 upgrade retired a package
(`ui-deepseek-model-label-1017`) and changed the tool-execution API; both were
documented and both would have been guessed wrong.

## 3. Cut the branch and merge

```sh
node scripts/fork-upgrade.mjs --start
```

Creates `upgrade/<upstream-version>` from `origin/master` and merges `main` into
it. `main` is untouched, so a bad merge costs nothing.

Refuses to run on a dirty tree: commit or stash first.

## 4. Resolve the conflicts

The standing rules (also encoded in the script's `HOTSPOTS`):

| File | Rule |
|---|---|
| `pnpm-lock.yaml` | `git checkout --ours`, then `pnpm install` regenerates it |
| `packages/bundle/web-app/package.json` | union the dependencies, **dedupe duplicate keys**, keep fork presets |
| `packages/bundle/web-app/cordis.patch.yml` | union the plugin rows; no upstream row lost, no fork row id duplicated |
| `tsconfig.host.json` / `tsconfig.client.json` | union the project references |
| `.gitignore` | union the rules |
| `packages/api/session-controller/src/media-references.ts` | keep upstream behavior, re-apply the fork addition on top |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | keep upstream structure, restore fork-only helpers the merge drops |
| `apps/web/vite.config.ts` | take upstream, re-apply the fork brand title |
| `packages/client/locale/src/locales/{en,zh}.ts` | take upstream, re-apply the fork brand string |
| `packages/client/ui-conversation/src/client/locales.ts` | take upstream, re-apply the fork brand string in the zh and en dictionaries |

Two failure modes to watch for, both seen in the 0.2.2 upgrade:

- **A union merge leaves a JSON syntax error** when the two sides each end
  without a trailing comma. Validate after every `package.json` resolution.
- **A merge silently drops a function body** when one side rewrote the
  surrounding block. If `tsc` reports `Cannot find name 'x'` right after an
  upgrade, the definition was probably a casualty — restore it from upstream.

## 5. Commit the merge

```sh
git add -A && git commit
```

Write the resolution down in the message: which file, which side, why. The next
upgrade reads it.

## 6. Align the release family, install, typecheck, build

The fork's own packages must carry the root version, and their intra-family
dependencies must be `workspace:*` (exact). The desktop packager rejects both,
and a version bump breaks them silently. `scripts/fork-upgrade.mjs` reports any
mismatch under "release family".

```sh
# every packages/*/* version must equal the root version
# every "@deepseek-ai/dsh-*" dependency must be workspace:* (not workspace:^)

pnpm install
pnpm run typecheck        # 5 gates: typert, host/client compilers, aggregates
pnpm run build:artifacts  # 8 gates: native, bundles, client artifacts, web build
```

To package the desktop app:

```sh
pnpm run package:desktop:mac:x64:unsigned   # Intel Mac; arm64 on Apple silicon
```

`typecheck` alone is not enough: `pnpm dsh web` serves prebuilt client bundles
from `lib/`, and a new upstream client package has no `lib/` until
`build:artifacts` runs. Skipping it fails at startup with `ENOENT .../lib/client.js`.

## 7. Smoke test

```sh
pnpm dsh web --no-open --port 3080
```

Check, in order:

1. the startup log has no `missing` / `not found` / `Error` lines
2. the UI loads and the sidebar shows the WorkBuddy nav
3. each scenario chip opens its agent (market, video, xiaohongshu, ppt, motion, image, toutiao)
4. one tool call actually runs end to end
5. the brand reads LuluBuddy

## 8. Promote to `main`

```sh
node scripts/fork-upgrade.mjs --finish
```

Fast-forwards `main` to the upgrade branch, tags `fork/<upstream-version>`,
deletes the upgrade branch, and prints the push command.

```sh
git push lulubuddy main
```

## Branch model

One long-lived branch: `main`, tracking `lulubuddy/main`. Upgrade work happens
on a throwaway `upgrade/<version>` branch and lands on `main` by fast-forward.

No backup branches. The previous version is a commit in `main`'s history, so it
needs no branch to stay reachable. Each release is tagged `fork/<version>`.

## Rollback

```sh
git log --oneline --decorate main        # find the previous fork/<version> tag
git checkout fork/<previous-version>     # or: git reset --hard <commit>
pnpm install
pnpm run build:artifacts
```

Rebuild after checking out an older commit: `lib/` is generated and is not
tracked.

## What "smooth" means here

The cost of an upgrade is proportional to how many upstream files the fork
edits, not to how many commits upstream lands. Three weeks and 3453 upstream
commits produced 8 conflicted files, because the fork's work lives in 15 of its
own packages.

Keep it that way:

- add a package rather than editing one
- add a `presets/<name>.patch.yml` rather than a row in `cordis.patch.yml`
- never rename or delete an upstream file

`FORK.md` lists the remaining debt that still costs a conflict per upgrade.
