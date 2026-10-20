---
description: "Dedicated Web cards for the five finance analysis tools: a KPI row, per-dimension score bars, an ice-point threshold gauge, macro facts, timing signals, and a refresh timeline."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-finance-view

English | [中文](README.zh.md)

## Summary

Render the five finance analysis tool results as purpose-built cards instead of a raw JSON code block. Each card is registered into ui-tool's keyed `tool.call.toolview` seat under its own wire tool name, decodes the tool's own document shape, and falls back to the result text when the document is unrecognized. The cards use semantic `--dsw-alias-*` tokens and CSS Modules only, so the WorkBuddy skin recolors them without a component change.

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

Mount this plugin alongside `ui-tool`. The five finance tools then render as their own cards wherever the conversation shows a call:

| Tool | The card shows |
|---|---|
| `csi300_analysis` | KPI row, one bar per dimension against its parsed maximum, the ice-point gauge, and each dimension's remaining fields |
| `csi2000_analysis` | The same score layout plus its three-channel buy detail |
| `market_timing_signal` | Both index scores, one signal card per index, and the position advice |
| `macro_snapshot` | A KPI grid of the latest macro facts with their dates, plus valuation and bond-yield rows |
| `market_data_refresh` | The refresh mode, each dataset's rows and date range, and the cache files newest first |

A tool the composition does not register stays on the generic tool row, so an uncomposed row is the off switch.

### What a card does with a result

Every value comes from the tool result text, which carries the document as one fenced JSON object after any `Data warnings:` lines. A running call announces itself; a settled result whose text is not the tool's document renders the raw text; both keep the card titled. Warnings reach the card's warning list from either the preamble or the document's own `warnings` array.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

[`model.ts`](src/client/model.ts) owns the whole untrusted-input boundary: it narrows every JSON value, decodes the fenced document, parses each dimension's parenthesized maximum (`估值温度(30)`, `ERP极端信号(+15)`), and derives one view model per tool. The view returns `null` for anything it cannot recognize, and the card renders [`PlainResult`](src/client/parts.tsx) instead.

[`charts.tsx`](src/client/charts.tsx) holds the two hand-written shapes: a linear score bar exposing `role="progressbar"` with its real score and maximum, and a semicircular threshold gauge with its threshold tick. [`parts.tsx`](src/client/parts.tsx) holds the card shell, KPI capsules, warning list, field table, and fallback. The four view modules render the five cards: one shared index-score renderer under the two index keys, one timing card, one macro card, and one refresh card.

### The registration

`ctx.slots.inject('tool.call.toolview', …)` yields one keyed registration per tool name inside the plugin's fiber, and `ctx.effect` owns the `finance` dictionaries. The keys are wire tool names, not operation names: `market_timing_signal` renders the document whose wrapper key is `signal`.

### Where the scale comes from

A dimension name carries its own maximum in parentheses, so the bar's scale is parsed rather than hardcoded, and the score is the `得分` field with a fallback to the `总分` key one dimension publishes. The ice-point gauge spans the documented 0–100 score range because the document carries no total maximum; the threshold itself is the document's `ice_point_threshold`, present only on the index that publishes it.

-----

<a id="further-exploration"></a>
## Further Exploration

- [`ui-tool`](../ui-tool/README.md) — the tool-call presentation layer that declares the `tool.call.toolview` seat.
- [`ui-primitives`](../ui-primitives/README.md) — the `Tag` capsule the action and ice-point badges reuse.
- [`ui-theme`](../ui-theme/README.md) — the semantic `--dsw-alias-*` tokens these cards consume.
- [`dsh-finance-local`](../../finance/finance-local/README.md) — the capability and host renderer that produce the decoded document.

-----

<a id="model-experience"></a>
## Model Experience

None, as these cards are client-only presentation over already-persisted tool results; the tool results themselves, and the documents the model reads, are unchanged.

#### KV Cache effect

No invalidation. The package adds no request content and no session event.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The cards are fixed renderers, not a widget language.** Each of the five tools has one hand-written component; a new finance tool, or a combination of views no card predefines, needs a new component and a new registration rather than a composed descriptor.
- **An unrecognized document shows the raw text.** The fallback is the result text, not a partial card, because the package makes no claim about a shape it does not know; a document whose fields all disappear renders only what survived.
- **The macro fact labels cover the keys the analysis project publishes today.** An unfamiliar macro key renders verbatim, so a new macro series reads as its snake_case name until a dictionary key is added.
- **Cursor pagination that leaves the call outside the runtime window has no tool identity**, so a result-only history page falls to ui-tool's generic row.
- **No runtime invariant companion is published because this package owns no relationship that independent observations could diverge on.** Its runtime behavior is registration, dictionary ownership, and cleanup, which the disposal spec pins.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The specs drive the components with the exact text `renderFinanceDocument` produced from live `finance_bridge.py` runs on 2026-09-19, checked in under `tests/fixtures/` as `<tool>.rendered.txt` (the tool output) beside `<tool>.bridge.json` (the raw bridge response). Regenerate both by re-running the bridge and piping its `document` plus `warnings` through the host renderer; do not hand-write a fixture, because the cards exist to read the real documents.

`src/index.ts` is deliberately an empty host body: the package registers nothing host-side, and the row exists so the Loader sees the plugin while the browser half ships through `exports["./client"]`.

</details>
