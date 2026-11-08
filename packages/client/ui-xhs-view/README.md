---
description: "Xiaohongshu post card: inline video, title, body, hashtags, pinned comment, both publication gates, and copy actions."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-xhs-view

English | [中文](README.zh.md)

## Summary

Draws an `xhs_post` result as a finished-post card instead of raw JSON: a vertical player, title, body, hashtags, pinned comment, the detect and outbound-scan results, three written files, and copy actions for each block and the publish package.

## Use this package

Mount it with `ui-tool` and `locale`. The card registers under the `xhs_post` tool name in `tool.call.toolview`; unknown or malformed payloads fall back to the result text.

| Card area | Content |
|---|---|
| Header | Post number, topic, ready-to-publish status |
| Video | `/xhs-assets` player, or a route-missing notice |
| Copy | Title, body, hashtags, and pinned comment, each copyable |
| Gates | `detect` verdict and hits; scan hard and soft counts |
| Files | Draft, publish copy, and finished video paths |
| Footer | Copy package and the not-published reminder |

## Model Experience

None, as this package draws the post card in the browser and registers nothing model-facing.

#### KV Cache effect

No invalidation. The package adds no request content and no session event.

## Known Limitations and Deferred Work

- **The card draws only what the payload carries.** A result with no presentation metadata falls back to the result text.
- **The player needs the host playback route.** A deployment without `/xhs-assets` shows the file path instead.
- **Copy uses the browser clipboard.** An unavailable or rejected clipboard reports a failure instead of doing nothing.
- **It never publishes.** Copy actions only fill the clipboard.
- **No runtime invariant companion is published.** Its behavior is registration, dictionary ownership, and cleanup, which the disposal spec pins.

### Dev Note

`src/client/model.ts` narrows the untrusted payload; `XhsPostView.tsx` renders the narrowed model; `parts.tsx` owns the card shell, KPI capsules, copy button, and fallback.
