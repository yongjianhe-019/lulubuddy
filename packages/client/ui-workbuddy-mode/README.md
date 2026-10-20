---
description: "WorkBuddy collaboration mode control for the dsh Web client: the Ask / Plan / Craft segmented control over the plan and permissions projections."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbuddy-mode

English | [中文](README.zh.md)

## Summary

Use the **Ask / Plan / Craft** segmented control in the composer's left input strip to pick the collaboration posture for the current session. The control reads the host-computed `plan` and `permissions` projections and writes only through the ordinary command channel, so it holds no session state of its own and adds no model-visible input. Choose this package when a deployment wants the WorkBuddy three-mode posture without changing plan mode or the permission presets.

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

Mount this plugin alongside `ui-conversation`, `ui-plan`, and `ui-permission-presets`. The control then occupies the composer's left input strip whenever both capabilities are composed.

### What the three modes mean

| Mode | Reads as | A selection submits |
|---|---|---|
| **Ask** | plan mode off, permission preset `read-only` | `/plan off` when needed, then `/permission read-only` |
| **Plan** | plan mode on (or a pending entry) | `/plan` |
| **Craft** | plan mode off, any other preset | `/plan off` when needed, then `/permission workspace-write` only if `read-only` was in force |

Plan mode wins the derivation over the permission preset: it is the stronger constraint, holding the model in review regardless of sandbox, so a session in plan mode reads as **Plan** even under a read-only preset.

### Craft lifts a restriction instead of forcing a preset

Selecting **Craft** clears a `read-only` restriction back to `workspace-write` and otherwise leaves the preset alone. A session deliberately set to `danger-full-access` therefore survives a round trip through **Ask** unchanged, instead of being silently narrowed.

### What appears when a capability is absent

The seat stays empty while either the `plan` or the `permissions` projection is absent from the composition — the same convention the plan chip and the permission picker follow. It never renders a control that could not write.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

[`mode.ts`](src/client/mode.ts) holds both pure functions. `deriveMode` folds the plan projection's pending selection the way the Host will (`pending ? !active : active`) and picks the mode; `modeCommands` returns the command lines a selection submits, or an empty list when the selection already holds.

The component renders from those functions and hands the resulting lines to the injected face, which executes them in order and stops at the first failure. Failure strings stay English, matching the error-surface policy the plan chip follows.

### No client optimism

The marked option follows the projections only. A click submits a command and disables the group until it settles; the highlight moves when the Host pushes the resulting projection frame, never on the click. A click on the already-active mode submits nothing.

-----

<a id="further-exploration"></a>
## Further Exploration

- [`ui-plan`](../ui-plan/README.md) — the plan-mode chip that owns the `conversation.input.plan` seat.
- [`ui-permission-presets`](../ui-permission-presets/README.md) — the `/permission` picker and the General-settings default row.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the capabilities it drives: selecting **Plan** enters plan mode, which adds the plan-mode policy section to the request, and selecting **Ask** narrows the sandbox and approval policy to `read-only`/`ask`; the control itself adds no tool, no prompt section, and no session event.

#### KV Cache effect

No direct invalidation; the packages that own plan mode and the sandbox/approval policy own any request-prefix change.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Two axes, one control.** Plan mode and the permission preset are independent host capabilities; the three modes are a presentation over their cross-product, not a stored mode. A session whose knobs match no mode still renders the nearest mode and clicking it re-asserts that mode's commands.
- **`Ask` cannot guarantee read-only inference.** It sets the sandbox preset. A model may still answer from the workspace it already read in an earlier turn; the mode constrains writes, not knowledge.
- **No custom presets in the mapping.** `read-only` and `workspace-write` are the shipped table keys. A deployment that renames them changes what `Ask` and `Craft` submit, and the control has no way to discover the rename.
- **No runtime invariant companion is published because this package owns no relationship that independent observations could diverge on.** Its runtime behavior is command registration over the two host knobs, which the disposal spec pins.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This package mirrors `ui-plan`'s registration shape (declaration-aware `slots.inject`, an inject face closing over `sessionId`, locale dictionaries registered as an effect) because both occupy a composer input seat over the same command channel. It registers into `conversation.input.left`, a `list` seat with no owner props, so its props are the runtime share plus the injected face plus the locale seat — no `locked` share to honor.

</details>
