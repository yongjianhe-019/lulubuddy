---
description: "小红书帖子成品卡片：内嵌成片、标题、正文、标签、置顶评论、两道发布闸与复制动作。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-xhs-view

[English](README.md) | 中文

## 概述

把 `xhs_post` 的结果画成一张成品卡片，而不是一段原始 JSON。卡片包含竖屏播放器、标题、正文、标签、置顶评论、`detect` 与 `发布前扫描` 的结果、三份落盘文件，以及标题/正文/标签/置顶评论和发布包的复制按钮。

## 使用本包

与 `ui-tool`、`locale` 一起挂载。卡片以工具名 `xhs_post` 注册进 `tool.call.toolview`，无法识别或损坏的 payload 回退为结果原文。

| 卡片区域 | 内容 |
|---|---|
| 头部 | 帖子编号、主题、待发布状态 |
| 成片 | `/xhs-assets` 播放器，或路由缺失提示 |
| 文案 | 标题、正文、标签、置顶评论，各自可复制 |
| 发布前检查 | `detect` verdict 与命中数、扫描 🔴/🟡 计数 |
| 文件 | 成稿、发布版、成片路径 |
| 底部 | 复制发布包与未自动发布提醒 |

## Model Experience

None, as this package draws the post card in the browser and registers nothing model-facing.

#### KV Cache effect

No invalidation. The package adds no request content and no session event.

## Known Limitations and Deferred Work

- **卡片只画 payload 携带的内容。** 缺失呈现元数据的结果回退为结果文本，不画残缺卡片。
- **播放器依赖宿主机播放路由。** 没有 `/xhs-assets` 的部署只能显示文件路径。
- **复制使用浏览器剪贴板。** 不可用或拒绝时按钮显示复制失败，不静默吞掉。
- **不自动发布。** 复制动作只把文本放进剪贴板，发布仍由用户完成。
- **不发布运行时不变式伴生文件。** 本包的行为是注册、字典归属与清理，已由卸载 spec 钉住。

### Dev Note

`src/client/model.ts` 收窄不可信 payload；`XhsPostView.tsx` 只渲染收窄后的模型；`parts.tsx` 持有卡片壳、KPI、复制按钮与回退。
