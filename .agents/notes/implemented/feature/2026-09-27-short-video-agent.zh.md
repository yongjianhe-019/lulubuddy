# Agent Note: short-video production is one host capability, one card package, and one preset

Status: implemented

[English](2026-09-27-short-video-agent.md) | 中文

## Problem

Harness 能描述一段视频，却无法产出一段。用户要一条短视频，得到的只有散文：没有任何能力可以合成配音、测量它、按测量结果规划时间轴并把画面编码成文件。Web GUI 的场景行里有一个「视频生成」入口，承诺了 Harness 无法交付的产物。

产出一条视频意味着驱动一条渲染工装链与一个语音合成器，两者都是外部程序，各有自己的依赖、自己的下载体积与自己的失败方式。这次改动必须加入这条生产路径，同时不让可能永远不做视频的 Harness 主机安装一套渲染工装，不让模型撰写驱动画面的数据，也不把机器本地的 URL 或文件布局放进模型的上下文。

## Decision

`packages/video/video-local`（`@deepseek-ai/dsh-video-local`）是短视频能力，`packages/client/ui-video-view`（`@deepseek-ai/dsh-client-ui-video-view`）是它的两张 Web 卡片，`packages/preset/agent-presets/presets/video/` 是挂载面向模型工具的 `video` 预设。

### One host package holds the operation, the process, and the route

宿主机包承载能力 seam 的全部三个角色加上播放路由。`src/service.ts` 是 Service Definition——`ctx.video`，一次有界的 `invoke(invocation, signal)`，覆盖 `setup`、`voices`、`create` 三个操作。`src/index.ts` 注册本地 Provider，并在组合带 Web 服务器时注册 `GET /video/<path>`。`src/tools.ts` 是 Consumer，以包独立的 `tools` 入口发布，因此预设拥有 Agent 是否看到 `video_setup`、`video_voices`、`video_create`，而部署拥有渲染工程放在哪里。

Provider 通过 `ctx.subprocess` 启动短命程序，调用之间不保留任何状态：安装用配置的包管理器，配音解释器用 `python3 -m venv` 加 pip，每个未缓存分段各一次 `edge_tts`，渲染用随包驱动。渲染工程由 `setup` 操作落地而不是由插件加载落地，因此在永不做视频的主机上挂载该行不会写入任何东西。

### One render project per deployment

工程目录是每个部署一份，而不是每个 workspace 或会话一份，部署可用 `projectRoot` 字段迁移它。其中的 `node_modules` 是工具链而非会话数据，而工程内部的合成 id、props 修订号与目录名是宿主机半边与随包模板之间的约定。每会话一份会把数百兆的安装与一次浏览器下载乘以会话数，还会让两个会话针对同一协议持有不同的模板修订号。共享目录的代价是打包缓存上的争用，tools 入口通过让每个视频工具停留在注册表默认的互斥调度上来支付它。

### 环境准备按依赖摘要对齐，而不是按存在与否

工程依赖是否需要安装，由出厂模板所声明依赖集的摘要（记录在 `.dsh-video-install`）与两个渲染侧包是否同时存在共同决定。仅看是否存在回答的是错误的问题：新增依赖的模板升级会发现 `node_modules` 已存在而跳过安装，渲染随后会因工程从未装过的模块失败，而该错误既不指向模板也不指向环境准备这一步。把决定绑定到声明的依赖集，模板升级就会重新对齐；而"存在性"那一半负责修复 `node_modules` 被删掉的工程——若只看标记，这种情况会变成永久的死路，因为此后每次环境准备都会认同那个已过期的标记并跳过。

### The model writes the storyboard, not the data

`video_create` 接受一个标题与一串分镜，撰写它们的是模型；工具从不生成文本。文本下游的一切都是宿主机自身的测量：配音由 edge-tts 合成，每个 MP3 的长度从其 MPEG Layer III 帧读出，时间轴是这些长度的累加加上固定的静音尾巴，每段的字幕是 edge-tts 写在音频旁边的 cue，并被裁剪到不会超出自己那一段。时间轴里没有任何数值来自字符数或请求的语速。

这个分工存在，是因为模型撰写的时间轴会是一项有标准答案的抄写任务：把成百上千个毫秒值写进散文，会招致四舍五入、遗漏与杜撰，结果是一条各段长度与自身音频不符的视频。实测音频才是权威，宿主机计算一次，同一组数字同时到达模型的文档与浏览器的卡片。

### The playback URL stays out of the model's context

一次渲染产出一个 payload，其中含输出路径、字节数、帧信息、逐段时间，以及浏览器播放它的 URL。该 URL 绝不进入模型：工具把 payload 投影为结果的呈现元数据，面向模型的文档改为指名文件自身的路径。URL 是本机浏览器抵达一个文件的方式，模型报告一个 URL 就是在报告传输而非产物；路径才是人能打开、present 或移动的东西。没有 Web 服务器的部署只失去 URL，渲染会以一条警告报告此事。

### The cards are a separate client package

两张卡片放在自己的包里而不是宿主机包里，因为表现层会被整体替换：`ui-video-view` 为 `video_create` 与 `video_setup` 注册键控 `tool.call.toolview` 卡片，其宿主机半边是空主体，只为让 Loader 看到该插件。`video_voices` 没有卡片，因为它的文档是读者扫一遍的列表，而通用工具行已经能渲染它。卡片解码渲染 payload 与环境准备文档，自己不计算任何时间值，对无法识别的内容回退为结果文本。

### The Remotion licence is a deployment constraint

随包模板锁定 `remotion` 4.0.529，它不是 MIT 许可：对个人与不超过三名员工的公司免费，超过则需付费许可。插件无法替部署决定其许可立场，因此该约束记录在包 README、子系统页与此处，而锁定版本本身位于模板自己的清单中。

### The scenario pick opens the preset

`packages/client/ui-workbuddy-scenarios` 中的「视频生成」能力入口从办公行移到设计行，并且现在携带 `presetId: 'video'`，因此选择它会打开一个由 `video` 预设组合出的会话，而不只是写入一段草稿提示。

## Alternatives considered

**在 Harness 内生成画面。** 否决：一个兼容 Remotion 的渲染器加一个语音合成引擎会是两个用 TypeScript 重写的大子系统，Harness 还会继承编解码、字体与无头浏览器这些项目已经解决的问题。驱动成熟工具让 Harness 继续拥有 seam 与契约。

**每个 workspace 一份渲染工程。** 否决：安装的是工具链而不是 workspace 内容，因此每 workspace 一份会把大体积下载成倍放大，还会让本应共用同一协议的 workspace 之间出现模板修订号分歧。每部署一份工程加可配置根目录，保住了单一工具链与单一模板修订号。

**让模型把时间轴写进工具结果。** 否决：模型推导出的毫秒值会四舍五入、遗漏并杜撰，而一条各段长度与旁白不符的视频比没有视频更糟。宿主机测量它真正得到的音频。

**把播放 URL 返回给模型。** 否决：URL 是浏览器抵达机器本地文件的路径，报告它的模型是在报告传输而非产物。路径才是用户能据以行动的东西，URL 留在浏览器读取的 payload 中。

**为 `video_voices` 做一张卡片。** 否决：该文档是读者扫一遍的平铺列表，通用工具行已忠实渲染它，专属卡片会为列表本已获得的阅读再加一个组件与一套字典。

**一个 MCP 服务器或常驻渲染守护进程。** 否决：Harness 已把这种形状建模为服务 seam 加 `ctx.tools`，而守护进程会为每段视频本来就是一次批处理调用的工作加上启动、健康、端口与拆除义务。

## Consequences

产出一条视频现在要先付一次 `video_setup`，它会下载依赖与一个无头浏览器，这正是其上限默认为三十分钟、且工具描述警告首次调用需要数分钟的原因。后续渲染复用安装、配音缓存与浏览器。

该能力只取决于三个外部程序是否可用：一个 Node 可执行文件、一个包管理器，以及一个能创建虚拟环境的 Python 解释器。已有 edge-tts 解释器的部署指名它，就不为配音安装任何东西。部署指名的每个路径都在插件加载时校验，因此写错会在组合阶段失败，而不是在首次渲染时。

两个 owner 依然可分离：Provider 行是部署事实，tools 入口是 Agent 预设事实。没有 Web 服务器的 profile 同样获得完整能力，只失去播放 URL。

## Deferred

- **不生产素材、图片、音乐或数字人。** 该能力把文本旁白叠加在生成的画面上；对素材画面、配乐、数字人或唇形同步的请求都超出它，而不是由它近似实现。
- **`video_voices` 没有卡片。** 它的列表以文档形式到达模型，以通用工具行的形式到达用户。
- **模板的 TSX 不在本仓库内做类型检查。** 合成由渲染工程自身的工装在环境准备之后构建，针对本仓库并不安装的依赖，因此 `tests/template.spec.ts` 检查合成 id、props 修订号与宿主机写入的成员，而可选启用的 `tests/real-render.e2e.ts` 渲染出真实文件。
- **逐段配音无法交叉淡化。** 每一段是一个合成文件加固定的静音尾巴，因此相邻段之间是间隔而非混音。
