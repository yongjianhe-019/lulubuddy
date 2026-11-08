---
description: "视频工具的专属 Web 卡片：内嵌播放器与渲染实测出的分镜时间轴，以及渲染环境的就绪报告。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-video-view

[English](README.md) | 中文

## 概述

把渲染出的短视频画成卡片，而不是一段原始 JSON 代码块，并报告准备渲染环境改变了什么。每张卡片以自身的线上工具名注册进 ui-tool 的键控 `tool.call.toolview` 座位：`video_create` 播放文件并列出渲染实测出的分镜时间轴，`video_setup` 显示工程及其就绪状态。卡片无法识别的结果回退为结果文本。卡片只使用语义化 `--dsw-alias-*` token 与 CSS Modules。

## 目录

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把该插件与 `ui-tool` 一起挂载。三个视频工具中有两个会在会话显示调用处渲染成各自的卡片：

| Tool | The card shows |
|---|---|
| `video_create` | 播放器中的成片；时长、画面尺寸与帧率、分镜数、文件大小与音色这些 KPI 胶囊；文件自身的路径；以及每段一行，含其区间、小标题、旁白，以及其音频是否来自缓存 |
| `video_setup` | 工程根目录、已安装的 Remotion 与 edge-tts 版本，以及三行就绪状态：模板已铺、依赖已装、浏览器已备 |

`video_voices` 刻意没有卡片：它的文档是读者扫一遍的列表，而通用工具行已经能渲染它。组合未注册的工具会留在通用工具行上，因此不组合那一行就是关闭开关。

### 卡片如何处理结果

`video_create` 从工具结果的呈现元数据读取渲染结果，宿主机把文件路径、播放 URL、字节数与实测的逐段时长都放在那里；元数据缺失或损坏的结果改为渲染原始文本。`video_setup` 从结果文本读取该操作自身的 JSON 文档，因为就绪报告本身就是面向模型的文档。两者都保留卡片标题，也都会呈现结果中的 `Production warnings:` 行。

### 播放器

只有当 payload 携带播放 URL 时才会出现播放器，而这要求部署挂载了宿主机的播放路由。没有路由时，卡片说明路由缺失并改为显示输出路径。无法解码返回文件的浏览器会在元素自报错误后，用同一条路径提示替换播放器，因此屏幕上绝不会留下一个失效的控件。

-----

<a id="understand-the-implementation"></a>
## 理解实现

[`model.ts`](src/client/model.ts) 拥有全部不可信输入边界：它收窄渲染 payload、收窄环境准备文档、派生出视图模型，并格式化时长、文件大小与画面描述。视图对任何无法识别的内容返回 `null`，卡片改为渲染 [`PlainResult`](src/client/parts.tsx)：保留标题并显示结果自身的文本。

[`parts.tsx`](src/client/parts.tsx) 持有卡片外壳、KPI 胶囊、警告列表、小节标题与回退。[`VideoCreateView.tsx`](src/client/VideoCreateView.tsx) 渲染播放器、胶囊与分镜时间轴；[`VideoSetupView.tsx`](src/client/VideoSetupView.tsx) 渲染就绪状态行。

### 注册

`ctx.slots.inject('tool.call.toolview', …)` 在插件 fiber 内为每个工具名产出一个键控注册，`ctx.effect` 持有 `video` 字典。键是线上工具名而非操作名：`video_create` 是 `create` 操作的卡片。

### 时间轴从何而来

卡片画出的每个时间值都是宿主机的实测值：一段的区间是其音频实测长度加上固定静音尾巴的累加，缓存标记是 Provider 复用已合成文件时置上的标志。卡片不做任何计算、也不重新测量，因此它显示的时间轴就是宿主机渲染所依据的时间轴。

-----

<a id="further-exploration"></a>
## 进一步探索

- [`ui-tool`](../ui-tool/README.zh.md) — 声明 `tool.call.toolview` 座位的工具调用呈现层。
- [`ui-theme`](../ui-theme/README.zh.md) — 这些卡片消费的语义化 `--dsw-alias-*` token。
- [`dsh-video-local`](../../video/video-local/README.zh.md) — 产出这些卡片所解码的 payload 与文档的能力与宿主机渲染端。

-----

<a id="model-experience"></a>
## 模型体验

None, as this package draws video cards in the browser and registers nothing model-facing.

#### KV Cache effect

No invalidation. The package adds no request content and no session event.

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **三个工具中有两个有卡片。** `video_voices` 是读者扫一遍的列表，留在通用工具行上；只有将来出现需要卡片的音色界面时才会加。
- **播放器需要宿主机的播放路由。** profile 未加载 Web 服务器的部署不会渲染出 URL，因此卡片只能显示输出路径并说明路由缺失。
- **卡片只画 payload 携带的内容。** 呈现元数据缺失的渲染——例如在本包被挂载之前产出的结果——会回退为结果文本，而不是画出残缺的卡片。
- **一段的缓存标记反映合成缓存，而不是重渲染。** 该标记报告配音音频是否被复用；视频总是重新编码。
- **环境准备卡片报告的是宿主机读到的版本。** manifest 不可读的包会在该版本处渲染 `—` 而不是猜测，因为该报告就是一份报告。
- **不发布运行时不变式伴生文件，因为该包不拥有可被独立观测推翻的关系。** 它的运行时行为是注册、字典归属与清理，已由卸载 spec 钉住。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

各 spec 用宿主机产出的确切字符串驱动组件：`tests/fixtures/` 中一个 `<tool>.rendered.txt`（面向模型的工具输出）与一个 `<tool>.meta.json`（卡片所画的呈现元数据）并存。两者都应由一次真实运行重新生成，而不是手写，因为卡片的存在就是为了读取真实 payload。

`src/index.ts` 刻意是空的宿主机主体：该包不在宿主机侧注册任何东西，该行的存在只是为了让 Loader 看到这个插件，而浏览器半边通过 `exports["./client"]` 发布。

</details>
