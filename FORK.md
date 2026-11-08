# This fork

A thin product layer on top of [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
Everything upstream is kept as-is; the fork adds WorkBuddy's surfaces on top and
edits as few upstream files as it can get away with. Every upstream file the fork
touches is a conflict in the next upgrade, so the count is the budget.

- Current branch: `workbuddy/0.2.2`
- Based on: upstream `0.2.2-rc.1`
- Upgrade procedure: [`FORK-UPGRADE.md`](FORK-UPGRADE.md), tool: `scripts/fork-upgrade.mjs`

## What the fork owns

These packages are fork-only. Upstream never touches them, so they never conflict.

| Path | What it is |
|---|---|
| `packages/client/ui-workbuddy-mode` | capability navigation, scenario tabs, Ask/Plan/Craft posture |
| `packages/client/ui-workbuddy-scenarios` | the scenario taxonomy and its chips |
| `packages/client/ui-workbuddy-shell` | the WorkBuddy shell surfaces |
| `packages/client/ui-market-view` | A-share market card |
| `packages/client/ui-video-view` | short-video card |
| `packages/client/ui-xhs-view` | Xiaohongshu card |
| `packages/client/ui-ppt-view` | deck card |
| `packages/client/ui-motion-view` | motion-graphics card |
| `packages/client/ui-image-view` | image-styling card |
| `packages/video/video-local` | the video agent's tools |
| `packages/video/xhs-local` | the Xiaohongshu agent's tools |
| `packages/design/ppt-local` | the deck agent |
| `packages/design/motion-local` | the motion-graphics agent |
| `packages/design/image-local` | the photo-styling agent |
| `packages/market/market-local` | the market agent |

Agent presets live in `packages/bundle/web-app/presets/`: `video`, `xiaohongshu`,
`ppt`, `image`, `market`, `research`, `toutiao`.

## Upstream files the fork edits (the conflict budget)

Twelve files. `scripts/fork-upgrade.mjs` keeps the resolution rule for each one.

| File | Fork's reason to touch it |
|---|---|
| `packages/bundle/web-app/package.json` | list the fork presets and their workspace packages |
| `packages/bundle/web-app/cordis.patch.yml` | register the fork plugin rows |
| `tsconfig.host.json`, `tsconfig.client.json` | reference the fork packages |
| `.gitignore` | ignore fork-local paths |
| `packages/client/locale/src/locales/{en,zh}.ts` | `brand.localBuild` string |
| `packages/client/ui-conversation/src/client/locales.ts` | `hero.headline` string |
| `apps/web/vite.config.ts` | `DEFAULT_CLIENT_TITLE` |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | brand wordmark fallback |
| `packages/api/session-controller/src/media-references.ts` | `?download` content disposition |
| `pnpm-lock.yaml` | generated; always regenerated, never hand-merged |

## Rules

1. **Add a package, do not edit one.** A new capability is a new package plus a
   preset row. Editing an upstream package imports the conflict forever.
2. **Never inline fork plugin rows in `cordis.patch.yml`.** Add a
   `presets/<name>.patch.yml` and reference it from the bundle manifest. (The
   WorkBuddy rows are still inline — see "Known debt" below.)
3. **Never rename or delete an upstream file.**
4. **Never hand-merge `pnpm-lock.yaml`.** Take upstream's, then `pnpm install`.
5. **Never commit `lib/`.** It is generated; `pnpm run build:artifacts` rebuilds it.

## Known debt (each one costs a conflict every upgrade)

- **WorkBuddy plugin rows are inline in `cordis.patch.yml`.** Moving them to
  `presets/workbuddy.patch.yml` would shrink the largest conflict from a
  133-row YAML diff to one manifest line.
- **The brand string lives in four files.** A single brand preset would make it
  one.
- **`SidebarRoot.tsx` carries a fork edit.** The brand wordmark could move into
  the `sidebar.brand.name` slot instead, which the fork already owns.
- **`media-references.ts` carries a fork edit.** The `?download` behavior could
  become a wrapper plugin on `api/file` instead of a patch of the handler.
