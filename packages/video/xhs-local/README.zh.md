---
description: "小红书帖子打包能力（ctx.xhs）：写完成稿与发布版、复制成片、跑两道发布闸、更新运营手册，并让 Web 卡片播放成片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-xhs-local

[English](README.md) | 中文

## 概述

`dsh-xhs-local` 把一条已经渲染完成的视频和一份帖子文案打包成小红书发布物。它的根入口是宿主机半边：`ctx.xhs` 服务、部署路径配置，以及 `/xhs-assets` 播放路由；它的 `tools` 入口是面向模型的 `xhs_post` 工具，由「小红书创作」Agent 预设挂载。

它不生成视频，也不发布。视频由 Agent 按运营手册的 Remotion + edge-tts 流水线产出；发布仍由用户在小红书手动完成。

## 使用本包

在宿主机组合里挂载根入口，在 `xiaohongshu` 预设里挂载 `tools` 入口。默认路径面向本机运营手册；部署可以用配置覆盖。

```yaml
- name: '@deepseek-ai/dsh-xhs-local'
  config:
    contentRoot: /Users/hyj/Documents/mywiki/小红书运营
    assetRoot: /Users/hyj/Documents/素材图
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `contentRoot` | `~/Documents/mywiki/小红书运营` | 运营手册与素材库目录；`小红书运营.md` 必须带两个插入标记 |
| `assetRoot` | `~/Documents/素材图` | 成片目录；路由只服务这个目录 |
| `routePrefix` | `/xhs-assets` | 播放路由前缀 |
| `detectScript` | `~/.claude/skills/de-aigc-ch/scripts/detect.py` | 去 AI 味扫描 |
| `scanScript` | `<contentRoot>/技术方案/发布前扫描.py` | 站外信息与联系方式扫描 |
| `checkTimeoutMs` | `120000` | 单道闸的墙钟上限 |
| `maxOutputBytes` | `8388608` | 单条命令的 stdout 上限 |
| `maxStderrBytes` | `262144` | stderr 上限 |
| `graceMs` | `5000` | 终止宽限期 |

### 工具

| Tool | 作用 |
|---|---|
| `xhs_post` | 校验文案、写 `成稿.md` 与 `发布版.txt`、复制成片到 `assetRoot`、跑两道闸、更新手册、返回卡片 payload |

### 落盘与手册更新

- 文案先写到同目录的临时文件，两道闸都通过后才写成 `第N篇-发布版.txt`；失败不留下发布版。
- 成片复制为 `<assetRoot>/<topic stem>.mp4`，卡片通过 `/xhs-assets/<file>` 播放。
- `小红书运营.md` 用两个标记插入索引行和今日进展：`<!-- xhs-index-insert -->` 与 `<!-- xhs-progress-insert -->`。缺少标记只产生 warning，不阻断发布。

## 理解实现

- `src/publish.ts`：文案校验、ffprobe 测量、两道闸、文件写入、手册更新。
- `src/tools.ts`：`xhs_post` 的 schema、模型文本、卡片 payload 投影。
- `src/route.ts`：`/xhs-assets` 的字节范围与真实路径检查。
- `src/service.ts`：`ctx.xhs` 服务，一次有界的 `publish`。

## Model Experience

### Model-facing tools

#### What the model sees

`xhs_post` 的 schema：必填 `number`、`topic`、`title`、`body`、`tags`、`pinnedComment`、`videoPath`。标题、正文、标签数量、第一人称、引号、破折号、空行与「不是」次数的硬上限写在工具描述里；具体路径、脚本位置、路由前缀与超时不可见。

#### Token effect

挂载 tools 入口时每个请求都有固定 schema 开销；结果文本只报告标题、视频路径、两道闸的计数与文件路径，不重复正文。

#### KV Cache effect

预设只组合一次，schema 在首个请求前稳定；结果文本 append-only，不使既有前缀失效。

### Tool results

#### What the model sees

成功时返回一段摘要：帖子编号与主题、标题、视频路径与实测规格、`detect` 与 `发布前扫描` 的计数、成稿与发布版路径、未发布的提醒。失败时返回两道闸的完整输出和可执行的修复提示。

#### Token effect

数据相关；结果在压缩前会被重复发送。正文长度有 1000 字上限，闸输出受 `maxOutputBytes` 限制。

#### KV Cache effect

Append-only；新结果跟随可复用的请求前缀，不使既有 KV-cache 条目失效。

### Card payload

#### What the model sees

Nothing。卡片 payload 通过工具结果的 presentation metadata 传给浏览器，包含正文、标签、置顶评论、视频 URL、闸计数、文件路径与 warning；模型文本里没有 URL。

#### Token effect

None；payload 持久化在会话日志里，不进入请求。

#### KV Cache effect

No invalidation；payload 不增加请求内容。

## Known Limitations and Deferred Work

- **只打包，不发布。** 用户仍需复制标题、正文、标签和置顶评论到小红书。
- **手册标记是结构约定。** 手册没有标记时索引行与今日进展不会写入；工具用 warning 报告，而不是猜表格位置。
- **视频由 Agent 产出。** 本包不驱动 Remotion、edge-tts 或 BGM；它只测量、复制和展示成片。
- **默认路径面向本机。** 其他部署必须覆盖 `contentRoot`、`assetRoot` 与两个脚本路径。
- **不生成图片或卡片。** 当前只覆盖视频帖子；图文卡片留给后续能力。

### Dev Note

根入口只注册服务和路由；`tools` 入口只注册模型工具。两者分开，是因为部署拥有手册与素材路径，而 Agent 预设定拥有工具 schema。
