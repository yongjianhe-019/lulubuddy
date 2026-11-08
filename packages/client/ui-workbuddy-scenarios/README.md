---
description: "WorkBuddy scenario tabs for the dsh Web client: the two-level scenario and sub-scenario selector in the composer dock, whose picks either seed a prompt starter into the draft or open a session on a named agent preset."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbuddy-scenarios

English | [中文](README.zh.md)

## Summary

Put WorkBuddy's two-level scenario selector in the composer's input dock: three scenario tabs, each with a horizontally scrolling row of sub-scenarios. A pick either writes its prompt starter into the composer draft or opens a session whose agent is composed from a named agent preset, for the sub-scenarios that stand for a whole capability. Nothing is ever sent. Choose this package when a deployment wants WorkBuddy's entry taxonomy to route users into the composer or into a preset-backed session.

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

Mount this plugin alongside `ui-conversation` and `ui-agent-preset`. The selector then occupies the composer's input dock: the upper row picks a scenario, and the lower row shows that scenario's sub-scenarios behind a strip that scrolls with a step arrow at each end. Both `ui-agent-preset` and the slot registry are required injections rather than optional seats, so a composition offers the whole selector or none of it.

### What a pick does

| Sub-scenario kind | A pick does |
|---|---|
| Starter only | Writes the prompt starter its locale key names into the composer draft; nothing is sent |
| Names an agent preset | Writes the starter only while the session is blank, then opens a session composed from that preset |

A preset-backed pick is how the package says a capability belongs to the agent rather than to the text: the sub-scenario's tools and instructions arrive with the session instead of as a prompt the user would have to be trusted to send. `office.finance` and `design.video` are the two such sub-scenarios today; the other sixteen write a starter and stop.

### The taxonomy

Three scenarios — 日常办公 (office), 代码开发 (code), and 设计创意 (design) — carry eighteen sub-scenarios between them. A capability has exactly one home chip: the deck maker is `office.slides` and no scenario repeats it under another name, so a user looking for it reads one label rather than choosing between two. Every id is stable and addressable: `data-workbuddy-scenario` on a scenario tab, `data-workbuddy-sub` on a chip, so a spec or a deployment can reach one without depending on its label.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

[`scenarios.ts`](src/client/scenarios.ts) holds the taxonomy as plain data: a stable scenario id, a locale key for each label and each prompt starter, and the optional `presetId` that turns a sub-scenario into a capability. [`locales.ts`](src/client/locales.ts) owns the `workbuddy.scenarios` dictionaries, whose Chinese side is the key-set source of truth. [`ScenarioTabs.tsx`](src/client/ScenarioTabs.tsx) renders both rows and holds the one piece of state the package has, the marked chip.

A pick reaches two faces, one per kind of sub-scenario: `inputActions.setDraft` from the session-scope runtime share the `conversation.input.dock` seat carries, and `startSession` from the inject face, which the registration binds to `ctx.agentPresetLaunch.startSession`. The registration is one dock seat at order 8 inside `ctx.slots.inject`, so it waits for the declaring entry and rolls back with this plugin's fiber; the dictionaries go through `ctx.effect`.

### The mark is local, the draft is not

The marked chip is component state, not durable state: the draft or the session behind it is the durable thing, and the user may replace either. So a pick marks the chip for feedback and writes nothing else — a preset-backed pick on a session that has already run a turn keeps that session's composition untouched, opens the New Session flow, and leaves the user to type their own question there.

-----

<a id="further-exploration"></a>
## Further Exploration

- [`ui-workbuddy-mode`](../ui-workbuddy-mode/README.md) — the Ask / Plan / Craft control that shares the composer's input strip.
- [`ui-conversation`](../ui-conversation/README.md) — the composer that declares the `conversation.input.dock` seat and its session-scope runtime share.
- [`ui-agent-preset`](../ui-agent-preset/README.md) — the roster and the `agentPresetLaunch` service a capability pick opens its session through.
- [`ui-slots`](../ui-slots/README.md) — the seat contract and the locale namespace map this plugin merges into.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the session `agentPresetLaunch` opens: a preset-backed pick composes the new session's agent from that preset, and the preset's own packages own the tools, instructions, and prompt sections the model then sees.

#### KV Cache effect

No direct invalidation; the packages behind the named preset own whatever enters the request, and the starter a pick writes into the draft reaches a model only once the user sends it.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The taxonomy is copy, not capability probing.** Every sub-scenario is declared by hand and only `office.finance` and `design.video` name a preset, so a deployment that drops one of those presets from its roster leaves that chip opening a session the roster cannot compose.
- **A preset-backed pick cannot retarget a session that has already run.** The flow opens a new session instead, because a session's agent composition is fixed once it has run a turn; the starter rides along only for a blank session.
- **Eighteen starters are user-facing questions, not prompts.** A starter is text the user is expected to edit or send, and a starter belonging to a preset-backed pick must not restate the protocol that preset's own prompt already carries.
- **No runtime invariant companion is published because this package owns no relationship that independent observations could diverge on.** Its runtime behavior is registration, dictionary ownership, and cleanup, which the disposal spec pins.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`src/index.ts` is deliberately an empty host body: the package registers nothing host-side, and the row exists so the Loader sees the plugin while the browser half ships through `exports["./client"]`.

`office.finance` is the shape every later agent-backed sub-scenario copies — add a `presetId` and the pick opens a session instead of only seeding the draft — so a new one is declared in `scenarios.ts` and given copy on both dictionary sides in the same pass. `design.video` is the second: moving a chip between scenarios is a move of its two locale keys and its taxonomy row, and nothing else, because neither the id nor the preset it opens belongs to a scenario. The Chinese dictionary is the key-set source of truth and the English side is checked against it.

</details>
