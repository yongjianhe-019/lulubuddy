# Agent Note: short-video production is one host capability, one card package, and one preset

Status: implemented

English | [中文](2026-09-27-short-video-agent.zh.md)

## Problem

The harness could describe a video but not produce one. A user asking for a short video got prose: there was no capability that could synthesize narration, measure it, plan a timeline from those measurements, and encode frames into a file. The Web GUI's scenario row carried a 视频生成 starter, which promised an artifact the harness had no way to deliver.

Producing one means driving a render toolchain and a speech synthesizer, both of which are external programs with their own packages, their own download weight, and their own failure modes. The change had to add that production path without making a harness host install a render toolchain it may never use, without letting a model author the data that drives the frames, and without putting a machine-local URL or file layout into the model's context.

## Decision

`packages/video/video-local` (`@deepseek-ai/dsh-video-local`) is the short-video capability, `packages/client/ui-video-view` (`@deepseek-ai/dsh-client-ui-video-view`) is its two Web cards, and `packages/preset/agent-presets/presets/video/` is the `video` preset that mounts the model-facing tools.

### One host package holds the operation, the process, and the route

The host package carries all three capability-seam roles plus the playback route. `src/service.ts` is the Service Definition — `ctx.video` with one bounded `invoke(invocation, signal)` over three operations: `setup`, `voices`, and `create`. `src/index.ts` registers the local provider and, when the composition has a web server, `GET /video/<path>`. `src/tools.ts` is the Consumer and ships as the package's separate `tools` entry, so a preset owns whether an agent sees `video_setup`, `video_voices`, and `video_create` while a deployment owns where the render project lives.

The provider spawns short-lived programs through `ctx.subprocess` and holds nothing between calls: the configured package manager for an install, `python3 -m venv` plus pip for the narration interpreter, `edge_tts` once per uncached scene, and the shipped driver for the render. The render project is materialized by the `setup` operation rather than by plugin load, so mounting the row on a host that never makes a video writes nothing.

### One render project per deployment

The project directory is one per deployment, not one per workspace or session, and a deployment can move it with the `projectRoot` field. `node_modules` there is a toolchain rather than session data, and the composition id, the props revision, and the directory names inside the project are the agreement between the host half and the shipped template. A per-session copy would multiply a multi-hundred-megabyte install and a browser download by the number of sessions, and it would let two sessions hold different template revisions against one protocol. The cost of the shared directory is contention on the bundle cache, which the tools entry pays for by leaving every video tool at the registry's default exclusive scheduling.

### Setup reconciles by dependency digest, not by presence

Whether the project's packages need installing is decided by a digest of the dependency set the shipped template declares, recorded in `.dsh-video-install`, together with the presence of both render-side packages. A presence check alone answers the wrong question: a template upgrade that adds a dependency would find `node_modules` already there and skip the install, and the render would then fail on a module the project never got, with an error that names neither the template nor the setup call. Keying the decision to the declared set makes a template upgrade reconcile, and the presence half is what repairs a project whose `node_modules` was deleted — the failure mode that a marker-only decision would turn into a permanent dead end, because every later setup call would agree with the stale marker and skip.

### The model writes the storyboard, not the data

`video_create` takes a title and a list of scenes, and the model is what writes them; the tool never generates text. Everything downstream of the text is the host's own measurement: the narration is synthesized by edge-tts, each MP3's length is read from its MPEG Layer III frames, the timeline is the running sum of those lengths plus a fixed tail of silence, and each scene's subtitles are the cues edge-tts wrote beside the audio, clipped so none outlives its scene. Nothing in the timeline is derived from a character count or from the requested speaking rate.

That split exists because a model-authored timeline would be a transcription task with a wrong answer: writing hundreds of milliseconds values into prose invites rounding, omission, and invention, and the result would render a video whose lengths disagree with its own audio. The measured audio is authoritative, the host computes it once, and the same numbers reach the model's document and the browser's card.

### The playback URL stays out of the model's context

A render produces a payload carrying the output path, the byte count, the frame facts, the per-scene timings, and the URL a browser plays it from. The URL never reaches the model: the tool projects the payload as the result's presentation metadata, and the model-facing document names the file's own path instead. A URL is how a browser on this machine reaches a file, and a model reporting one would be reporting transport rather than the artifact; the path is what a person can open, present, or move. A deployment with no web server loses only the URL, which the render reports as a warning.

### The cards are a separate client package

The two cards live in their own package rather than in the host one because the presentation plane is replaced wholesale: `ui-video-view` registers keyed `tool.call.toolview` cards for `video_create` and `video_setup`, and its host half is an inert body so the Loader sees the plugin. `video_voices` has no card because its document is a list a reader scans once and the generic tool row already renders it. The cards decode the render payload and the setup document, compute no timing of their own, and fall back to the result text for anything they cannot recognize.

### The Remotion licence is a deployment constraint

The shipped template pins `remotion` 4.0.529, which is not MIT-licensed: it is free for individuals and for companies of up to three employees and requires a paid licence above that. The plugin cannot decide a deployment's licence position, so the constraint is recorded in the package README, in the subsystem page, and here, and the template's own manifest is where the pinned version lives.

### The scenario pick opens the preset

The 视频生成 capability pick moved from the office row to the design row in `packages/client/ui-workbuddy-scenarios`, and it now carries `presetId: 'video'`, so choosing it opens a session composed from the `video` preset rather than only writing a draft prompt.

## Alternatives considered

**Generating the frames inside the harness.** Rejected: a Remotion-compatible renderer plus a text-to-speech engine would be two large subsystems reimplemented in TypeScript, and the harness would inherit the codec, font, and headless-browser problems those projects already solve. Driving the maintained tools keeps the harness owning the seam and the contract.

**A per-workspace render project.** Rejected: the install is the toolchain, not workspace content, so a copy per workspace multiplies a large download and lets template revisions diverge between workspaces that share one protocol. One project per deployment with a configurable root keeps one toolchain and one template revision.

**Letting the model write the timeline into the tool result.** Rejected: milliseconds derived by a model would round, drop, and invent, and a video whose scene lengths disagree with its narration is worse than no video. The host measures the audio it actually got.

**Returning the playback URL to the model.** Rejected: the URL is a browser's route to a machine-local file, and a model that reports one reports transport instead of the artifact. The path is what the user can act on, and the URL stays in the payload the browser reads.

**A card for `video_voices`.** Rejected: the document is a flat list a reader scans once, the generic tool row renders it faithfully, and a dedicated card would add a component and a dictionary for no reading that the list does not already get.

**An MCP server or a long-running render daemon.** Rejected: the harness already models this shape as a service seam plus `ctx.tools`, and a daemon would add startup, health, port, and teardown obligations for work that is naturally one batch call per video.

## Consequences

Producing a video now costs a first `video_setup` that downloads packages and a headless browser, which is why its bound defaults to thirty minutes and why the tool description warns that the first call takes minutes. Subsequent renders reuse the install, the narration cache, and the browser.

The capability is only as available as the three external programs: a Node executable, a package manager, and a Python interpreter that can create a virtual environment. A deployment that already has an edge-tts interpreter names it and installs nothing for narration. Every path a deployment names is validated at plugin load, so a typo fails the composition rather than a first render.

Two owners remain separable: the provider row is a deployment fact, and the tools entry is an agent-preset fact. A profile without a web server still gets the whole capability and loses only the playback URL.

## Deferred

- **No footage, image, music, or avatar production.** The capability narrates text over generated frames; a request for stock footage, a music bed, an avatar, or lip-sync is outside it rather than approximated by it.
- **`video_voices` has no card.** Its list reaches the model as a document and the user through the generic tool row.
- **The template's TSX is not type-checked in this repository.** The composition is built by the render project's own toolchain after setup, against packages this repository does not install, so `tests/template.spec.ts` checks the composition id, the props revision, and the members the host writes, and the opt-in `tests/real-render.e2e.ts` renders a real file.
- **Per-scene narration cannot crossfade.** Each scene is one synthesized file plus a fixed tail of silence, so consecutive scenes are separated by a gap rather than mixed.
