---
description: "Dedicated Web cards for the video tools: an inline player with the scene timeline a render produced, and the render environment's readiness report."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-video-view

English | [中文](README.zh.md)

## Summary

Render a rendered short video as a card instead of a raw JSON code block, and report what preparing the render environment changed. Each card is registered into ui-tool's keyed `tool.call.toolview` seat under its own wire tool name: `video_create` plays the file and lists the scene timeline the render measured, and `video_setup` shows the project and its readiness. A result the card cannot recognize falls back to the result text. The cards use semantic `--dsw-alias-*` tokens and CSS Modules only.

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

Mount this plugin alongside `ui-tool`. Two of the three video tools then render as their own cards wherever the conversation shows a call:

| Tool | The card shows |
|---|---|
| `video_create` | The rendered file in a player, KPI capsules for duration, frame size and rate, scene count, file size, and voice, the file's own path, and one row per scene with its range, heading, narration, and whether its audio came from the cache |
| `video_setup` | The project root, the installed Remotion and edge-tts versions, and three readiness rows: template laid, packages installed, browser ready |

`video_voices` deliberately has no card: its document is a list a reader scans once, and the generic tool row already renders that. A tool the composition does not register stays on the generic tool row, so an uncomposed row is the off switch.

### What a card does with a result

`video_create` reads the render from the tool result's presentation metadata, which is where the host puts the file path, the playback URL, the byte count, and the measured per-scene timings; a result whose metadata is missing or malformed renders the raw text instead. `video_setup` reads the operation's own JSON document from the result text, because the readiness report is already the model-facing document. Both keep the card titled, and both surface the result's `Production warnings:` lines.

### The player

The player appears only when the payload carries a playback URL, which requires the deployment to have mounted the host's playback route. Without one, the card says the route is absent and shows the output path instead. A browser that cannot decode the returned file replaces the player with the same path note after the element reports its own error, so a dead control is never left on screen.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

[`model.ts`](src/client/model.ts) owns the whole untrusted-input boundary: it narrows the render payload, narrows the setup document, derives the view models, and formats a duration, a file size, and a frame description. The view returns `null` for anything it cannot recognize, and the card renders [`PlainResult`](src/client/parts.tsx) instead, which keeps the title and shows the result's own text.

[`parts.tsx`](src/client/parts.tsx) holds the card shell, KPI capsules, warning list, section title, and fallback. [`VideoCreateView.tsx`](src/client/VideoCreateView.tsx) renders the player, the capsules, and the scene timeline; [`VideoSetupView.tsx`](src/client/VideoSetupView.tsx) renders the readiness rows.

### The registration

`ctx.slots.inject('tool.call.toolview', …)` yields one keyed registration per tool name inside the plugin's fiber, and `ctx.effect` owns the `video` dictionaries. The keys are wire tool names, not operation names: `video_create` is the card for the `create` operation.

### Where the timeline comes from

Every timing the card draws is the host's measured value: a scene's range is the running sum of its audio's measured length plus the fixed tail of silence, and the cache badge is the flag the provider set when it reused a synthesized file. The card computes nothing and re-measures nothing, so the timeline it shows is the timeline the host rendered.

-----

<a id="further-exploration"></a>
## Further Exploration

- [`ui-tool`](../ui-tool/README.md) — the tool-call presentation layer that declares the `tool.call.toolview` seat.
- [`ui-theme`](../ui-theme/README.md) — the semantic `--dsw-alias-*` tokens these cards consume.
- [`dsh-video-local`](../../video/video-local/README.md) — the capability and host renderer that produce the payload and the document these cards decode.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package draws video cards in the browser and registers nothing model-facing.

#### KV Cache effect

No invalidation. The package adds no request content and no session event.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Two of the three tools have a card.** `video_voices` is a list a reader scans once and stays on the generic tool row; it gets a card only if a future voice surface needs one.
- **The player needs the host's playback route.** A deployment whose profile loads no web server renders no URL, so the card can only show the output path and say the route is absent.
- **The card draws what the payload carries.** A render whose presentation metadata is missing — a result produced before this package was mounted, for example — falls back to the result text rather than a partial card.
- **A scene's cached badge reflects the synthesis cache, not a re-render.** The badge reports whether the narration audio was reused; the video is always encoded again.
- **The setup card reports the versions the host read.** A package whose manifest is unreadable renders `—` for that version instead of guessing, because the report is a report.
- **No runtime invariant companion is published because this package owns no relationship that independent observations could diverge on.** Its runtime behavior is registration, dictionary ownership, and cleanup, which the disposal spec pins.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The specs drive the components with the exact strings the host produces: `tests/fixtures/` keeps a `<tool>.rendered.txt` (the model-facing tool output) beside a `<tool>.meta.json` (the presentation metadata a card draws). Regenerate both from a live run rather than hand-writing them, because the cards exist to read the real payloads.

`src/index.ts` is deliberately an empty host body: the package registers nothing host-side, and the row exists so the Loader sees the plugin while the browser half ships through `exports["./client"]`.

</details>
