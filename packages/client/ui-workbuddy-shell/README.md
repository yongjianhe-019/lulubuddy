---
description: "WorkBuddy shell surfaces for the dsh Web client: the left capability navigation and the right results-area tab, both read-only indexes pairing each WorkBuddy surface with the DSH capability behind it."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbuddy-shell

English | [中文](README.zh.md)

## Summary

Present the two WorkBuddy office-shell navigation surfaces as **read-only indexes**: a left sidebar row that opens a capability index in the main column, and a right Sidebar tab that indexes the WorkBuddy results area. Every row pairs a WorkBuddy surface with the DSH capability that backs it, or says plainly that DSH has no counterpart. Choose this package when a deployment wants WorkBuddy's capability map visible without inventing a capability or a write path DSH does not have.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside `ui-layout`, `ui-sidebar`, and `ui-sidebar-right`. The left column's global panel row gains **WorkBuddy capabilities**, which opens the capability index in the main column, and the right Sidebar's guide offers the **WorkBuddy results** page, whose body is the results index.

### The capability index

| WorkBuddy surface | DSH backing |
|---|---|
| 专家中心 (Expert center) | `packages/subagent` and agent presets |
| 技能市场 (Skill market) | `packages/skill` — filesystem discovery; DSH has no market surface |
| 自动化 (Automation) | `packages/schedule` — the capability exists; DSH has no write UI |
| 连接器 (Connectors) | `packages/mcp` |
| 记忆 (Memory) | none — DSH has no counterpart |

### The results index

| WorkBuddy surface | DSH backing |
|---|---|
| 变更记录 (Change history) | no dedicated panel; file mutations appear as conversation tool rows and the deliverables row |
| 浏览器预览 (Browser preview) | no built-in browser; the right Sidebar's document preview renders HTML files read-only |
| 分享 (Share) | none — DSH has no counterpart |

### Nothing here is a control

No row is a button, and the panel declares no write path. This is deliberate: DSH has no market surface, no automation editor, no browser, and no share service for this package to route a click to, so a row states a fact instead of offering a dead action. The one interactive element the package contributes is the sidebar row itself, which selects the panel and therefore does something.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

[`index-data.ts`](src/client/index-data.ts) holds the two row sets — the left capabilities and the right results — as plain data: a stable row id, a locale key for the WorkBuddy surface, a locale key for the DSH backing statement, and an `absent` marker for the surfaces DSH does not have. [`IndexPanel.tsx`](src/client/IndexPanel.tsx) renders any row set as the shared read-only panel, and both surfaces are thin wrappers over it: [`CapabilityIndex.tsx`](src/client/CapabilityIndex.tsx) for the left panel and [`ResultsBody.tsx`](src/client/ResultsBody.tsx) for the right tab.

The package uses one identity, `SHELL_ID`, for three registrations. The `sidebar.panellist` row carries it as its list `id`; the `main` body registers under the same key, so the row addresses the panel. The results tab type publishes it as the definition's `id`, and the keyed `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title` seats register under that same id, so the chip and its body dispatch together even if another type takes the kind over. [`CapabilityIcon.tsx`](src/client/CapabilityIcon.tsx) draws the sidebar row's glyph; [`ResultsTitle.tsx`](src/client/ResultsTitle.tsx) draws the chip's.

Both panel bodies take the locale seat (`workbuddy.shell`), and the sidebar row resolves its accessible name from a `label` thunk, so a language change re-reads the copy without re-registration.

-----

<a id="further-exploration"></a>
## Further Exploration

- [`ui-workbuddy-mode`](../ui-workbuddy-mode/README.md) — the Ask / Plan / Craft composer control, the other WorkBuddy presentation package.
- [`ui-sidebar`](../ui-sidebar/README.md) — the sidebar shell that declares `sidebar.panellist`.
- [`ui-sidebar-right`](../ui-sidebar-right/README.md) — the tab registry and the keyed body/title seats.
- `packages/subagent`, `packages/skill`, `packages/schedule`, `packages/mcp` — the DSH capabilities the index names.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package adds no tool, no prompt section, no session event, and no model-visible input; it renders static copy already shipped in its locale dictionaries and reads no session data.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The index is copy, not capability probing.** Each backing statement names the DSH package by hand. Mounting or unmounting one of those packages does not change the index, and a deployment that removes `packages/mcp` still reads the connectors row as backed by it.
- **No write surfaces, by scope.** The package is product surface only: it adds no skill market, automation editor, browser preview, or share service. The rows exist so the absence is legible, not so it can be filled from here.
- **The results tab is a page, not a viewer.** It claims no resource address and takes no navigation parameters, so it cannot be opened with a specific file or session as its subject.
- **No runtime invariant companion is published because this package owns no relationship that independent observations could diverge on.** Its only runtime behavior is registration and cleanup, which the disposal spec pins.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This package follows `ui-sidebar-files` for the two-stage tab registration (`ctx.sidebarRightTabs.register` for the type, then the keyed `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title` seats) and `ui-workbuddy-mode` for the locale and host-half shape. It registers into three other packages' seats — `sidebar.panellist` and `main` from `ui-sidebar`/`ui-layout`, and both tab seats from `ui-sidebar-right` — so every registration goes through `ctx.slots.inject` inside `ctx.effect`, which waits for the declaring entry and rolls back with this plugin's fiber.

The shared panel is a plain presentational component with no store, no inject face, and no subscription: the rows are module constants and the copy comes from the `t` seat, so there is no live data to thread.

</details>
