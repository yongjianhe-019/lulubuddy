---
description: "The short-video production capability (ctx.video): a local provider over a Remotion render project and edge-tts narration, plus the setup, voice, and creation tools an agent preset mounts."
kind: "package-reference"
---

# @deepseek-ai/dsh-video-local

English | [中文](README.zh.md)

## Summary

With `dsh-video-local`, the harness turns a storyboard into a finished vertical 1080x1920 narrated short video — the capability behind the Web GUI's 短视频 agent preset. Its root entry is the host half: the `ctx.video` Service Definition and a provider that drives a Remotion render project and edge-tts narration through `ctx.subprocess`. Its `tools` entry is the model-facing half, mounted by an agent preset. Three operations cover preparing the machine, listing voices, and rendering one storyboard. The deployment owns where the render project lives; the preset owns whether the model sees the tools.

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

Mount the root entry in a composition that already loads a subprocess provider: it provides `ctx.video` and, when the deployment has a web server, the playback route. Mount the `tools` entry where the agent that should produce videos is composed — inside an agent preset — because the tool schemas belong to that agent rather than to every session on the host.

### When to choose it

Choose it when a deployment needs a narration-driven vertical video from text rather than a model's description of one: the tools speak the narration, measure the audio that came back, plan the timeline from those measurements, and encode a file. Do not mount it expecting stock footage, music, an avatar, or image generation; those are not operations of this capability.

### Requirements

The deployment supplies the programs, not the project: the plugin creates the render project itself. A working setup needs a Node executable (the default is the running process's own), a package manager (default `npm`), and a `python3` that can create a virtual environment. edge-tts is installed into that environment by the setup operation, and a deployment that already has an interpreter providing edge-tts names it as `ttsPython` instead. The setup operation also downloads the Chrome Headless Shell a Remotion render drives, which is the largest single part of the wait.

### Minimal configuration

Every field has a working default, so a deployment that mounts the row with no config at all is valid; the first setup writes into `video` under the harness home. The three path fields are validated at load, so a typo fails the composition rather than a four-minute install.

```yaml
- name: '@deepseek-ai/dsh-video-local'
  config:
    projectRoot: /path/to/video
```

| Field | Default | Meaning |
|---|---|---|
| `projectRoot` | `<dsh home>/video` | Directory holding the render project, its caches, and its rendered videos; must be absolute |
| `nodePath` | the running process's `execPath` | Node executable that runs the render driver; must exist at load |
| `npmPath` | `npm` | Package manager the render project installs with |
| `ttsPython` | the project's own virtual environment | Interpreter that already provides edge-tts; when set, the project's virtual environment is unused and must exist at load |
| `pythonPath` | `python3` | Interpreter the project's own virtual environment is created from |
| `defaultVoice` | `zh-CN-XiaoxiaoNeural` | Voice `video_create` uses when a storyboard names none |
| `defaultRate` | `+0%` | Rate `video_create` uses when a storyboard names none |
| `ttsTimeoutMs` | `180000` | Wall-clock bound for one narration synthesis, one voice probe, or one voice listing |
| `renderTimeoutMs` | `1800000` | Wall-clock bound for one render |
| `setupTimeoutMs` | `1800000` | Wall-clock bound for one setup step |
| `maxOutputBytes` | `8388608` | In-memory cap on one command's captured stdout; a longer command fails |
| `maxStderrBytes` | `262144` | Captured-stderr cap, used only for failure detail |
| `graceMs` | `5000` | Termination and drain grace for a child process |

The `tools` entry takes one field. Its budget must not be shorter than the provider's longest bound, or the tool-call policy would cancel a process the provider still considers within budget:

| Field | Default | Meaning |
|---|---|---|
| `timeoutMs` | `2400000` | Cooperative tool-call budget attached to every video tool |

```yaml
- name: '@deepseek-ai/dsh-video-local/tools'
```

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-video-local) is the exhaustive source for every accepted field and its JSDoc. It covers a package's root entry, so the `tools` entry's own field is documented here.

### The tools

| Tool | Returns |
|---|---|
| `video_setup` | The project's root, whether this call laid the template, installed packages, and readied the browser, and the Remotion and edge-tts versions it found |
| `video_voices` | The voices edge-tts offers for one locale: each id, locale, gender, and category list, capped at 60 |
| `video_create` | The rendered file's path, its measured duration, its frame size and rate, its byte count, the voice, and each scene's start, end, and length |

The model writes the storyboard: `video_create` takes a title, scenes, and an optional voice, rate, and file-name stem, and nothing in the tool writes text on the caller's behalf. The narration is both the spoken audio and the scene's subtitles, so the tool description states that it must read as something a presenter would say.

### What setup does

`video_setup` performs four steps and reports which of them changed anything. It lays the shipped template into `projectRoot` when the directory has no project or the recorded template version predates this plugin's, it installs the project's packages with the configured package manager, it creates the project's virtual environment and pip-installs edge-tts (or probes the deployment's own interpreter), and it asks the render driver to ensure the browser is cached. The recorded version in `.dsh-video-template` is what makes the second call a no-op, so the operation is safe to repeat and a plugin upgrade is what refreshes a stale project. The template carries sources and manifests only, so a refresh overwrites the template's own files and never the accumulated packages, narration cache, or rendered output.

Every other operation refuses a project that is not ready, and the refusal names `video_setup`.

### Playing the result

When the composition provides a web server, the root entry mounts `GET /video/<path>` and each render reports a `url` under it. The route serves strictly inside `projectRoot`, refuses a path that leaves it after both textual normalization and a real-path check, answers byte ranges so a `<video>` element can seek, and marks every response `no-store` because re-rendering a storyboard overwrites the file its own URL points at. A deployment with no web server still gets the capability: the render then reports a warning instead of a URL, and the file is opened from its path.

### Failures and recovery

The provider validates every program's output at the process boundary. A setup step that fails reports the captured stderr; a storyboard that breaks a bound is refused with the field and the limit named; a render whose driver reports a failure raises that failure's own message; a command longer than `maxOutputBytes` fails rather than truncating; the configured per-operation timeout terminates a runaway child, and the caller's `exec.signal` terminates it on cancellation. The tool layer turns every rejection into the model-visible `Error: <message>`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the plugin; the observable behavior is fully covered in [Use this package](#use-this-package).

### Capability seam roles

The package holds all three roles: `src/service.ts` is the Service Definition (`ctx.video`, one bounded `invoke`), `src/index.ts` registers the local provider and the playback route, and `src/tools.ts` is the Consumer that owns the schemas and presentation. The consumer is a separate entry rather than a second row of the provider's because the two answer to different owners: the deployment names the render project, while the agent's preset chooses the tools.

### Process model

One production invocation spawns short-lived programs, never a service. Setup runs the configured package manager's `install`, then either `python3 -m venv` plus `pip install edge-tts` or nothing when the deployment brought its own interpreter, then the render driver with `--browser`. Create runs `edge-tts` once per scene that misses the narration cache, then the driver with the props document and the output path, which bundles the composition with `@remotion/bundler` and encodes it with `@remotion/renderer`. Every spawn carries a timeout, a stdout cap, a stderr cap, and a grace period from the configuration.

### Narration cache and timeline

Narration is cached per scene under a key derived from the spoken text, the voice, and the rate, so re-rendering a storyboard whose narration did not change synthesizes nothing. A scene's duration is its measured MP3 length plus a fixed tail of silence: the length comes from walking the file's own MPEG Layer III frames rather than from a container header the tool does not write. Scene starts are the running sum of those durations, so the timeline is in milliseconds and the measured audio is authoritative — the composition converts to frames, because it is what knows its own frame rate. The `srt` edge-tts writes beside each file supplies the cues; overlapping cues are clipped to the next cue's start and empty ones dropped, so a subtitle never outlives its own scene.

### The render project

One directory holds everything the capability writes: the template's sources and manifests at the root, `node_modules` from setup, `public/narration` for cached audio and subtitles, `.work/props.json` for the document one render writes, `out/` for rendered videos, `.venv` for the narration interpreter, and `.dsh-video-template` for the recorded template version. The directory is deliberately one per deployment rather than one per workspace or session: `node_modules` is a toolchain, not session data, and the composition id and props contract are the agreement between this host half and the shipped template.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Root entry: the capability's config schema, path validation, provider and route registration |
| [`src/service.ts`](src/service.ts) | The `VideoRuntime` Service Definition and the operation vocabulary |
| [`src/types.ts`](src/types.ts) | Operations, the storyboard vocabulary, the props document, and the render payload |
| [`src/provider.ts`](src/provider.ts) | The provider: setup, voices, narration, planning, render, and every bound |
| [`src/tools.ts`](src/tools.ts) | The `tools` entry: three model-facing tools, their JSON presentation, and the render as presentation metadata |
| [`src/storyboard.ts`](src/storyboard.ts) | Defaults and bounds for a storyboard, the timeline plan, and the file-name stem |
| [`src/narration.ts`](src/narration.ts) | Cache keys, SRT parsing and cue clipping, MP3 frame measurement, voice-list parsing |
| [`src/driver.ts`](src/driver.ts) | The render driver's JSON answer |
| [`src/payload.ts`](src/payload.ts) | Narrowing for the render payload a card draws |
| [`src/route.ts`](src/route.ts) | The playback route: containment, byte ranges, content types |
| [`src/contract.ts`](src/contract.ts) | Protocol constants shared by the provider, the tools, the route, and the shipped template |
| [`remotion/`](remotion/) | The shipped render project: the composition, its scenes, the driver, and the pinned toolchain |
| — | No runtime invariant companion is published; the package owns no independently observable relation beyond the seam contract, and its bounds are enforced in the provider. |

### Read path

One `create` invocation normalizes and bounds the storyboard, narrates every scene (cache first), measures each audio file, plans the timeline, writes the props document, and spawns the driver. Success decodes the driver's own JSON answer and requires it to name the output, its size, and the frame facts; a driver that died before answering is folded into a failure carrying its stderr. The model-facing document is that render without the playback URL, because the model needs the file's own path.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the seam vocabulary to the compositions that mount this plugin.

- [dsh-subprocess](../../subprocess/subprocess/README.md) — the subprocess seam this provider spawns through.
- [dsh-tools](../../core/tools/README.md) — the tool registry and execution pipeline the consumer registers into.
- [dsh-host-webserver](../../host/webserver/README.md) — the web server the playback route registers into, and the reason a profile without one still loads.
- [ui-video-view](../../client/ui-video-view/README.md) — the Web cards that play a render and report a prepared environment.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-video-local) — every accepted root-entry config field and its source declaration.
- [Short-video capability decision](../../../.agents/notes/implemented/feature/2026-09-27-short-video-agent.md) — why the capability drives an external render project instead of generating frames itself.

-----

<a id="model-experience"></a>
## Model Experience

### Model-facing tools

#### What the model sees

The model sees the three schemas above, and only in a session composed from a preset that mounts the `tools` entry: `video_setup` with no argument, `video_voices` with the required `locale`, and `video_create` with the required `title` and `scenes` plus an optional `subtitle`, `voice`, `rate`, and `slug`. The storyboard's own bounds are stated in the descriptions as exact numbers. Project paths, interpreters, the composition id, the props document, the playback route, and every timeout are not model-visible.

#### Token effect

Fixed schema cost per request while the tools entry is mounted on the agent; `video_create` is the largest of the three because it states the storyboard vocabulary and its limits. Unmounting the entry in the preset is the way to remove the schemas.

#### KV Cache effect

Prefix-stable for an agent that composes the entry once, which is what the preset does before its first request.

### Tool results

#### What the model sees

A successful call returns an optional `Production warnings:` bullet list followed by the operation's own JSON object in a ```json fence. `video_create` returns `title`, `output`, `duration_ms`, `duration_seconds`, `width`, `height`, `fps`, `bytes`, `voice`, and one entry per scene with its index, heading, narration, `start_ms`, `end_ms`, `duration_ms`, and `narration_cached`. A `video_setup` result reports `project_root`, `ready`, and which of the three steps it performed plus the installed versions.

#### Token effect

Data-dependent and resent until compaction. The create document grows with the scene count and with the length of each narration, and the storyboard's own limits bound both.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Tool failure

#### What the model sees

Every rejection becomes exactly `Error: <message>`: an unprepared or stale project naming `video_setup`, a storyboard that breaks a bound with the field and limit named, a synthesis or render failure with the driver's own message, the byte bound, a configured timeout, or caller cancellation.

#### Token effect

Only the retained error result adds tokens.

#### KV Cache effect

Append-only; the error follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Render payload

#### What the model sees

Nothing. The payload the Web card draws — the absolute output path, the playback URL, the byte count, and the per-scene timings with their cache flags — travels in the tool result's presentation metadata and is stripped from the model-facing text. The URL in particular is never model-visible: it is how a browser reaches the file, and the model reports the file's own path instead.

#### Token effect

None; the payload is persisted with the session log and never enters a request.

#### KV Cache effect

No invalidation. The payload adds no request content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the capability is unavailable or a poor fit. They are current package constraints.

- **Remotion is not MIT-licensed.** The shipped template depends on `remotion`, which is free for individuals and for companies of up to three employees and requires a paid licence above that. A deployment that ships this capability must confirm its own licence position; nothing in this plugin can substitute for it, and the pinned version is recorded in [`remotion/package.json`](remotion/package.json).
- **The render project is one shared directory per deployment.** `node_modules` is a toolchain rather than session data, so sessions and workspaces share one project, its narration cache, and its output directory. Two concurrent renders contend for the same bundle cache, which is why every video tool is registered at the registry's default exclusive scheduling.
- **A plugin upgrade overwrites template edits.** The recorded template version refreshes a stale project on the next setup, so a deployment that edits the composition in place loses those edits as soon as the version changes. The template is the plugin's own artifact; a deployment that wants a different composition points the capability at a different provider.
- **The template's TSX is not type-checked in this repository.** The composition and its scenes are built by the render project's own toolchain, after setup, against packages this repository does not install, so `tsc` never sees them. [`tests/template.spec.ts`](tests/template.spec.ts) checks the composition id, the props revision, and the members the host writes, and the opt-in [`tests/real-render.e2e.ts`](tests/real-render.e2e.ts) renders a real file; drift beyond that is caught only by those checks or by a failing render.
- **The playback route is absent without a web server.** A profile that loads no `webServer` still gets the capability, and a render then reports no `url` and a warning. The card shows the output path instead of a player.
- **`video_voices` has no dedicated card.** Its document is a list a reader scans once, so the generic tool row renders it; only `video_create` and `video_setup` publish something the video card draws.
- **A project whose packages are missing is reinstalled, not refused.** The install decision is the digest in `.dsh-video-install` — a hash of the dependency set the shipped template declares — together with the presence of both render-side packages. A template upgrade that adds a dependency therefore reconciles the project, and a project whose `node_modules` was deleted is repaired by the next setup call rather than left as a dead end.
- **Per-scene narration cannot crossfade.** Each scene is one synthesized file plus a fixed tail of silence, so consecutive scenes are separated by a gap rather than mixed, and a scene's audio is never trimmed to overlap its neighbour.
- **The first setup is slow and network-bound.** Packages and the Chrome Headless Shell are downloaded on the first `video_setup`, which is why its bound defaults to thirty minutes and why the tool description warns that the first call takes minutes.
- **The capability produces narrated vertical video only.** There is no footage or image library, no music bed, no avatar or lip-sync, and no image generation; a request for any of those is outside this capability rather than approximated by it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`src/contract.ts` is the whole agreement with the shipped template: the composition id, the props revision, the project's internal directory names, and the storyboard bounds. Changing one side without the other is what the template spec exists to catch, and the spec reads the template's own source text rather than importing it.

The narration cache is content-addressed by text, voice, and rate, with a separator between the fields so no two distinct triples can collide; a cached MP3 is only reused when its `srt` sibling is present, because the timeline needs the cues the audio alone does not carry.

</details>
