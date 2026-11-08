---
description: "Xiaohongshu post packaging (ctx.xhs): writes the draft and publish copy, copies the video, runs both publication gates, updates the operating manual, and serves the video for the Web card."
kind: "package-reference"
---

# @deepseek-ai/dsh-xhs-local

English | [中文](README.zh.md)

## Summary

`dsh-xhs-local` packages one finished video and its post copy into the files a Xiaohongshu publication needs. Its root entry is the host half: the `ctx.xhs` service, deployment path configuration, and the `/xhs-assets` playback route. Its `tools` entry is the model-facing `xhs_post` tool, mounted by the `xiaohongshu` agent preset.

It does not render or publish. The video comes from the Agent's Remotion + edge-tts pipeline in the operating manual; the user still publishes in Xiaohongshu manually.

## Use this package

Mount the root entry on the host composition and the `tools` entry in the `xiaohongshu` preset. The defaults target this machine's operating manual and can be overridden.

```yaml
- name: '@deepseek-ai/dsh-xhs-local'
  config:
    contentRoot: /Users/hyj/Documents/mywiki/小红书运营
    assetRoot: /Users/hyj/Documents/素材图
```

| Field | Default | Meaning |
|---|---|---|
| `contentRoot` | `~/Documents/mywiki/小红书运营` | Operating manual and post library; `小红书运营.md` must carry the two insertion markers |
| `assetRoot` | `~/Documents/素材图` | Finished-video directory; the route serves only this directory |
| `routePrefix` | `/xhs-assets` | Playback route prefix |
| `detectScript` | `~/.claude/skills/de-aigc-ch/scripts/detect.py` | De-AI prose scan |
| `scanScript` | `<contentRoot>/技术方案/发布前扫描.py` | Outbound-contact and external-platform scan |
| `checkTimeoutMs` | `120000` | Wall-clock bound for one gate |
| `maxOutputBytes` | `8388608` | Per-command stdout cap |
| `maxStderrBytes` | `262144` | Per-command stderr cap |
| `graceMs` | `5000` | Termination grace period |

### Tools

| Tool | Effect |
|---|---|
| `xhs_post` | Validates the copy, writes `成稿.md` and `发布版.txt`, copies the video into `assetRoot`, runs both gates, updates the manual, and returns the card payload |

### Files and manual update

- The copy is first written to a temporary file; the publish file is written only after both gates pass. A failed gate leaves no publish file.
- The video is copied to `<assetRoot>/<topic stem>.mp4`; the card plays it at `/xhs-assets/<file>`.
- `小红书运营.md` receives the index row and daily-progress section at `<!-- xhs-index-insert -->` and `<!-- xhs-progress-insert -->`. A missing marker produces a warning, not a failed publication.

## Understand the implementation

- `src/publish.ts`: copy validation, ffprobe measurement, both gates, file writes, and manual update.
- `src/tools.ts`: the `xhs_post` schema, model-facing summary, and card payload projection.
- `src/route.ts`: `/xhs-assets` byte ranges and real-path containment.
- `src/service.ts`: the `ctx.xhs` service and one bounded `publish` call.

## Model Experience

### Model-facing tools

#### What the model sees

The `xhs_post` schema: required `number`, `topic`, `title`, `body`, `tags`, `pinnedComment`, and `videoPath`. The hard limits on title, body, tag count, first person, quotation marks, dashes, blank lines, and 不是 count live in the description; paths, script locations, route prefix, and timeouts are not visible.

#### Token effect

Fixed schema cost per request while the tools entry is mounted; the result text reports only the title, video path, gate counts, and file paths, never the body again.

#### KV Cache effect

The preset composes the entry once, so the schema is stable before the first request; result text is append-only and invalidates no reusable prefix.

### Tool results

#### What the model sees

A success returns a summary: post number and topic, title, video path and measured geometry, detect and scan counts, draft and publish paths, and the not-published reminder. A failure returns both gates' complete output plus an actionable repair instruction.

#### Token effect

Data-dependent and resent until compaction. The body has a 1000-character limit and gate output is bounded by `maxOutputBytes`.

#### KV Cache effect

Append-only; new content follows the reusable request prefix and invalidates no existing KV-cache entries.

### Card payload

#### What the model sees

Nothing. The card payload travels in the tool result's presentation metadata: body, hashtags, pinned comment, video URL, gate counts, file paths, and warnings. The URL never appears in model-facing text.

#### Token effect

None; the payload is persisted with the session log and never enters a request.

#### KV Cache effect

No invalidation; the payload adds no request content.

## Known Limitations and Deferred Work

- **Packaging only, never publishing.** The user still copies the title, body, hashtags, and pinned comment into Xiaohongshu.
- **Manual markers are a structural contract.** Without them the index row and progress section are skipped and reported as a warning instead of guessed.
- **The Agent renders the video.** This package does not drive Remotion, edge-tts, or BGM; it measures, copies, and presents the finished file.
- **The defaults target this machine.** Other deployments must override `contentRoot`, `assetRoot`, and both script paths.
- **No images or cards.** This version covers video posts only.

### Dev Note

The root entry registers only the service and route; the `tools` entry registers only the model tool. They are separate because the deployment owns the manual and asset paths, while the agent preset owns the tool schema.
