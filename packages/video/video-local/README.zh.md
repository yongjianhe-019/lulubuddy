---
description: "短视频生成能力（ctx.video）：驱动 Remotion 渲染工程与 edge-tts 配音的本地 Provider，以及由 Agent 预设挂载的环境准备、音色与成片工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-video-local

[English](README.md) | 中文

## 概述

借助 `dsh-video-local`，Harness 能把一份分镜变成一条竖版 1080x1920、带配音的短视频成片——即 Web GUI 中「短视频」Agent 预设背后的能力。它的根入口是宿主机半边：`ctx.video` 的 Service Definition，以及通过 `ctx.subprocess` 驱动 Remotion 渲染工程与 edge-tts 配音的 Provider。它的 `tools` 入口是面向模型的半边，由 Agent 预设挂载。三个操作分别覆盖准备机器、列出音色、渲染一份分镜。渲染工程放在哪里由部署决定；模型能否看到这些工具由预设决定。

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

把根入口挂在已经加载 subprocess Provider 的组合里：它提供 `ctx.video`，并在部署带 Web 服务器时提供播放路由。把 `tools` 入口挂在应当产出视频的那个 Agent 的组合里——也就是 Agent 预设内部——因为工具 schema 属于该 Agent，而不属于宿主机上的每个会话。

### 何时选择

当部署需要的是由文本驱动的竖版配音视频、而不是模型对视频的描述时选它：工具会朗读旁白、测量返回的音频、按测量结果规划时间轴，并编码出文件。不要指望它提供素材画面、音乐、数字人或图像生成；这些都不是本能力的操作。

### 部署要求

程序由部署提供，工程不由部署提供：渲染工程由插件自己创建。可用的环境准备需要一个 Node 可执行文件（默认为当前进程自身的）、一个包管理器（默认 `npm`），以及一个能创建虚拟环境的 `python3`。edge-tts 由环境准备操作装进该虚拟环境；若部署已有提供 edge-tts 的解释器，则改以 `ttsPython` 指名它。环境准备还会下载 Remotion 渲染所驱动的 Chrome Headless Shell，这是等待时间里最大的一块。

### 最小配置

每个字段都有可用默认值，因此完全不带配置地挂载该行也是合法的；首次环境准备会写入 Harness 主目录下的 `video`。三个路径字段在加载时校验，因此写错会在组合阶段失败，而不是在四分钟的安装之后。

```yaml
- name: '@deepseek-ai/dsh-video-local'
  config:
    projectRoot: /path/to/video
```

| Field | Default | Meaning |
|---|---|---|
| `projectRoot` | `<dsh home>/video` | 存放渲染工程、其缓存与成片的目录；必须是绝对路径 |
| `nodePath` | 当前进程的 `execPath` | 运行渲染驱动的 Node 可执行文件；必须在加载时存在 |
| `npmPath` | `npm` | 渲染工程安装依赖所用的包管理器 |
| `ttsPython` | 工程自带的虚拟环境 | 已提供 edge-tts 的解释器；设置后工程虚拟环境不再使用，且该路径必须在加载时存在 |
| `pythonPath` | `python3` | 用于创建工程虚拟环境的解释器 |
| `defaultVoice` | `zh-CN-XiaoxiaoNeural` | 分镜未指名音色时 `video_create` 使用的音色 |
| `defaultRate` | `+0%` | 分镜未指名语速时 `video_create` 使用的语速 |
| `ttsTimeoutMs` | `180000` | 单次配音合成、单次音色探测或单次音色列出的墙钟上限 |
| `renderTimeoutMs` | `1800000` | 单次渲染的墙钟上限 |
| `setupTimeoutMs` | `1800000` | 环境准备单个步骤的墙钟上限 |
| `maxOutputBytes` | `8388608` | 单条命令捕获 stdout 的内存上限；超长则该命令失败 |
| `maxStderrBytes` | `262144` | 捕获 stderr 的上限，仅用于失败诊断 |
| `graceMs` | `5000` | 子进程终止与排空的宽限期 |

`tools` 入口只接受一个字段。它的预算不得短于 Provider 最长的上限，否则工具调用策略会取消一个 Provider 仍认为在预算内的进程：

| Field | Default | Meaning |
|---|---|---|
| `timeoutMs` | `2400000` | 附加到每个视频工具的协作式工具调用预算 |

```yaml
- name: '@deepseek-ai/dsh-video-local/tools'
```

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-video-local)是每个可接受字段及其 JSDoc 的完整来源。它覆盖包的根入口，因此 `tools` 入口自身的字段记录在此处。

### 工具

| Tool | Returns |
|---|---|
| `video_setup` | 工程根目录、本次调用是否铺下模板/安装依赖/备好浏览器，以及它读到的 Remotion 与 edge-tts 版本 |
| `video_voices` | edge-tts 为某个语言提供的音色：每个音色的 id、locale、性别与类别列表，最多 60 个 |
| `video_create` | 成片文件路径、实测时长、画面尺寸与帧率、字节数、音色，以及每段的起止与长度 |

分镜由模型撰写：`video_create` 接受标题、分镜，以及可选的音色、语速与文件名主干，工具本身不会替调用方写任何文本。旁白既是朗读音频、也是该段字幕，因此工具描述明确指出它必须读起来像播报者会说出口的话。

### 环境准备做什么

`video_setup` 执行四个步骤，并报告其中哪些改变了状态。当目录中没有工程、或记录的模板版本早于本插件时，它把随包模板铺进 `projectRoot`；它用配置的包管理器安装工程依赖；它创建工程虚拟环境并 pip 安装 edge-tts（或探测部署自带的解释器）；它请求渲染驱动确保浏览器已缓存。`.dsh-video-template` 中记录的版本使第二次调用成为空操作，因此该操作可安全重复，而插件升级正是刷新过期工程的机制。模板只携带源码与清单，因此刷新只覆盖模板自身的文件，绝不会覆盖累积的依赖、配音缓存或成片。

其他每个操作都拒绝尚未就绪的工程，且拒绝信息会指名 `video_setup`。

### 播放成片

当组合提供 Web 服务器时，根入口挂载 `GET /video/<path>`，每次渲染都会报告其下的 `url`。该路由严格在 `projectRoot` 内提供文件，对经过文本规范化与真实路径检查后仍越出该目录的路径予以拒绝，应答字节范围以便 `<video>` 元素拖动进度，并把每个响应标记为 `no-store`，因为重渲染同一份分镜会覆盖其 URL 指向的文件。没有 Web 服务器的部署同样获得该能力：此时渲染报告一条警告而非 URL，文件从其路径直接打开。

### 失败与恢复

Provider 在每个进程边界校验程序输出。失败的环境准备步骤报告捕获的 stderr；越界的分镜会被拒绝并指名字段与上限；驱动自报失败的渲染会抛出该失败自身的消息；超过 `maxOutputBytes` 的命令失败而不截断；配置的单操作超时会终止失控的子进程，调用方的 `exec.signal` 会在取消时终止它。工具层把每次拒绝都变成模型可见的 `Error: <message>`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释插件背后的设计取舍；可观察行为已在 [Use this package](#use-this-package) 中完整覆盖。

### Capability Seam 的角色

该包同时承担三个角色：`src/service.ts` 是 Service Definition（`ctx.video`，一次有界的 `invoke`），`src/index.ts` 注册本地 Provider 与播放路由，`src/tools.ts` 是拥有 schema 与呈现的 Consumer。Consumer 是独立入口而不是 Provider 行的第二行，因为两者面向不同的 owner：渲染工程由部署指名，而工具由 Agent 预设选择。

### 进程模型

一次生产调用只会启动短命程序，绝不常驻服务。环境准备先运行配置的包管理器 `install`，然后视情况运行 `python3 -m venv` 加 `pip install edge-tts`（部署自带解释器时则跳过），最后带 `--browser` 运行渲染驱动。创建操作对每个未命中配音缓存的段各运行一次 `edge-tts`，随后用 props 文档与输出路径运行驱动，由驱动用 `@remotion/bundler` 打包合成、用 `@remotion/renderer` 编码。每次 spawn 都带上配置里的超时、stdout 上限、stderr 上限与宽限期。

### 配音缓存与时间轴

配音按段缓存，键由朗读文本、音色与语速派生，因此重渲染一份旁白未变的分镜不会重新合成任何内容。一段的时长是实测 MP3 长度加上固定的静音尾巴：长度来自遍历文件自身的 MPEG Layer III 帧，而不是读取本工具并不写入的容器头。各段起点是这些时长的累加，因此时间轴以毫秒为单位、以实测音频为准——合成端把它换算成帧，因为只有它知道自己的帧率。edge-tts 写在每个文件旁边的 `srt` 提供字幕；重叠的 cue 被裁到下一个 cue 的起点，空的被丢弃，因此字幕绝不会超出它自己那一段。

### 渲染工程

一个目录容纳该能力写入的全部内容：根目录下的模板源码与清单、环境准备产生的 `node_modules`、缓存音频与字幕的 `public/narration`、单次渲染写入文档的 `.work/props.json`、成片的 `out/`、配音解释器的 `.venv`，以及记录模板版本的 `.dsh-video-template`。该目录刻意按部署一份，而不是按 workspace 或会话一份：`node_modules` 是工具链而非会话数据，而合成 id 与 props 契约是本宿主机半边与随包模板之间的约定。

### 源码地图

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | 根入口：能力的配置 schema、路径校验、Provider 与路由注册 |
| [`src/service.ts`](src/service.ts) | `VideoRuntime` 的 Service Definition 与操作词汇 |
| [`src/types.ts`](src/types.ts) | 操作、分镜词汇、props 文档与渲染 payload |
| [`src/provider.ts`](src/provider.ts) | Provider：环境准备、音色、配音、规划、渲染，以及每一项上限 |
| [`src/tools.ts`](src/tools.ts) | `tools` 入口：三个面向模型的工具、其 JSON 呈现，以及作为呈现元数据的渲染结果 |
| [`src/storyboard.ts`](src/storyboard.ts) | 分镜的默认值与上限、时间轴规划与文件名主干 |
| [`src/narration.ts`](src/narration.ts) | 缓存键、SRT 解析与 cue 裁剪、MP3 帧测量、音色列表解析 |
| [`src/driver.ts`](src/driver.ts) | 渲染驱动的 JSON 应答 |
| [`src/payload.ts`](src/payload.ts) | 卡片所画渲染 payload 的收窄 |
| [`src/route.ts`](src/route.ts) | 播放路由：包含性检查、字节范围、内容类型 |
| [`src/contract.ts`](src/contract.ts) | Provider、工具、路由与随包模板共用的协议常量 |
| [`remotion/`](remotion/) | 随包渲染工程：合成、其各场景、驱动与锁定版本的工装 |
| — | 不发布运行时不变式伴生文件；该包除 seam 契约外不拥有可被独立观测的关系，其上限在 Provider 内强制执行。 |

### 读取路径

一次 `create` 调用会规范化并限制分镜、为每一段配音（先查缓存）、测量每个音频文件、规划时间轴、写入 props 文档，并启动驱动。成功时会解码驱动自身的 JSON 应答，并要求它指名输出、大小与帧信息；在应答之前就死掉的驱动会被折叠成一个携带其 stderr 的失败。面向模型的文档就是去掉播放 URL 的那个渲染结果，因为模型需要的是文件自身的路径。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级契约不够用时读这些页面。它们从 seam 词汇走向挂载本插件的组合。

- [dsh-subprocess](../../subprocess/subprocess/README.zh.md) — 本 Provider 借以 spawn 的 subprocess seam。
- [dsh-tools](../../core/tools/README.zh.md) — Consumer 注册进的工具注册表与执行管线。
- [dsh-host-webserver](../../host/webserver/README.zh.md) — 播放路由注册进的 Web 服务器，以及没有它的 profile 仍能加载的原因。
- [ui-video-view](../../client/ui-video-view/README.zh.md) — 播放成片并报告已准备环境的 Web 卡片。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-video-local) — 每个可接受的根入口配置字段及其来源声明。
- [短视频能力决策](../../../.agents/notes/implemented/feature/2026-09-27-short-video-agent.zh.md) — 该能力为何驱动外部渲染工程而不是自己生成画面。

-----

<a id="model-experience"></a>
## 模型体验

### Model-facing tools

#### What the model sees

模型只能看到上面三个 schema，且仅在由挂载 `tools` 入口的预设组合出的会话中：`video_setup` 无参数，`video_voices` 需要必填的 `locale`，`video_create` 需要必填的 `title` 与 `scenes`，以及可选的 `subtitle`、`voice`、`rate`、`slug`。分镜自身的上限以确切数字写在描述里。工程路径、解释器、合成 id、props 文档、播放路由以及每一项超时都不可见。

#### Token effect

只要 tools 入口挂在该 Agent 上，每个请求都有固定的 schema 开销；`video_create` 是三个中最大的一个，因为它陈述了分镜词汇与其上限。在预设中卸载该入口即可移除这些 schema。

#### KV Cache effect

对于只组合一次该入口的 Agent 而言前缀稳定，而预设正是在首次请求之前完成组合。

### Tool results

#### What the model sees

成功的调用返回一条可选的 `Production warnings:` 项目符号列表，随后是该操作自身的 JSON 对象，置于 ```json 围栏中。`video_create` 返回 `title`、`output`、`duration_ms`、`duration_seconds`、`width`、`height`、`fps`、`bytes`、`voice`，以及每段一项，含其序号、小标题、旁白、`start_ms`、`end_ms`、`duration_ms` 与 `narration_cached`。`video_setup` 结果报告 `project_root`、`ready`、它执行了三个步骤中的哪些，以及它读到的已安装版本。

#### Token effect

取决于数据，并在压缩之前反复重发。创建文档随分镜段数与每段旁白长度增长，而分镜自身的上限同时约束这两者。

#### KV Cache effect

仅追加；新可见内容跟在可复用的请求前缀之后，不会使既有 KV 缓存条目失效。

### Tool failure

#### What the model sees

每次拒绝都恰好变成 `Error: <message>`：未准备或过期的工程会指名 `video_setup`；越界的分镜会指名字段与上限；合成或渲染失败会带上驱动自身的消息；此外还有字节上限、配置的超时，或调用方取消。

#### Token effect

只有被保留的错误结果增加 token。

#### KV Cache effect

仅追加；错误跟在可复用的请求前缀之后，不会使既有 KV 缓存条目失效。

### Render payload

#### What the model sees

什么都看不到。Web 卡片所画的 payload——输出绝对路径、播放 URL、字节数，以及带缓存标记的逐段时间——随工具结果的呈现元数据传输，并从面向模型的文本中剥离。URL 尤其不可见：它是浏览器抵达该文件的方式，模型改为报告文件自身的路径。

#### Token effect

无；该 payload 随会话日志持久化，绝不进入请求。

#### KV Cache effect

不失效。该 payload 不增加任何请求内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了该能力何时不可用或不合适。它们是当前的包级约束。

- **Remotion 不是 MIT 许可。** 随包模板依赖 `remotion`，它对个人与不超过三名员工的公司免费，超过则需付费许可。发布该能力的部署必须自行确认许可立场；本插件无法替代这一点，锁定的版本记录在 [`remotion/package.json`](remotion/package.json)。
- **渲染工程是每个部署一个共享目录。** `node_modules` 是工具链而非会话数据，因此各会话与各 workspace 共用同一个工程、其配音缓存与输出目录。两个并发渲染会争用同一个打包缓存，这正是每个视频工具都注册在注册表默认的互斥调度上的原因。
- **插件升级会覆盖对模板的修改。** 记录的模板版本会在下次环境准备时刷新过期工程，因此就地修改过合成的部署一旦版本变化就会丢失这些修改。模板是插件自身的产物；想要不同合成的部署应把能力指向另一个 Provider。
- **模板的 TSX 不在本仓库内做类型检查。** 合成与其各场景由渲染工程自身的工装构建——在环境准备之后、针对本仓库并不安装的依赖——因此 `tsc` 从来看不到它们。[`tests/template.spec.ts`](tests/template.spec.ts) 检查合成 id、props 修订号，以及宿主机写入的成员；可选启用的 [`tests/real-render.e2e.ts`](tests/real-render.e2e.ts) 会渲染出真实文件；此外的漂移只能靠这些检查或一次失败的渲染发现。
- **没有 Web 服务器时就没有播放路由。** 未加载 `webServer` 的 profile 同样获得该能力，此时渲染不报告 `url` 而报告一条警告，卡片显示输出路径而不是播放器。
- **`video_voices` 没有专属卡片。** 它的文档是读者扫一遍的列表，因此由通用工具行渲染；只有 `video_create` 与 `video_setup` 会发布视频卡片所画的内容。
- **缺少依赖的工程会被重装，而不是被拒绝。** 是否安装由 `.dsh-video-install` 中的摘要决定——它是出厂模板所声明依赖集的哈希——并同时要求两个渲染侧包存在。因此，新增依赖的模板升级会让工程重新对齐，而被删掉 `node_modules` 的工程会被下一次环境准备修复，而不是走进死路。
- **逐段配音无法交叉淡化。** 每一段是一个合成文件加固定的静音尾巴，因此相邻段之间是间隔而非混音，某段的音频也不会被裁到与相邻段重叠。
- **首次环境准备缓慢且依赖网络。** 依赖与 Chrome Headless Shell 在第一次 `video_setup` 时下载，这正是其上限默认为三十分钟、且工具描述警告首次调用需要数分钟的原因。
- **该能力只产出竖版配音视频。** 没有素材或图片库、没有配乐、没有数字人或唇形同步，也没有图像生成；对其中任何一项的请求都超出本能力范围，而不是由它近似实现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

`src/contract.ts` 就是与随包模板之间的全部约定：合成 id、props 修订号、工程内部目录名与分镜上限。只改一侧而不改另一侧，正是模板 spec 存在的意义；该 spec 读取模板自身的源文本，而不是导入它。

配音缓存按文本、音色与语速做内容寻址，字段之间带分隔符，因此任何两个不同的三元组都不会碰撞；缓存的 MP3 只有在其 `srt` 兄弟文件同时存在时才会被复用，因为时间轴需要音频本身并不携带的 cue。

</details>
