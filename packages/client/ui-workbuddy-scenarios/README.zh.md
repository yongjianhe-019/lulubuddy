---
description: "dsh Web 客户端的 WorkBuddy 场景标签页：输入框上方的两级场景与子场景选择器，其选择要么把提示词起始句写入草稿，要么在具名 Agent 预设上开启一个会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbuddy-scenarios

[English](README.md) | 中文

## 概述

把 WorkBuddy 的两级场景选择器放进输入框的 dock：三个场景标签，每个标签下是一行可横向滚动的子场景。一次选择要么把它的提示词起始句写入输入框草稿，要么在具名 Agent 预设上开启一个会话——后者用于代表整项能力的子场景。任何内容都不会被发送。当部署想要 WorkBuddy 的入口分类把用户导入输入框、或导入由预设组成的会话时，选用本包。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本插件与 `ui-conversation`、`ui-agent-preset` 一同挂载。选择器随后占据输入框的 dock：上行选择场景，下行把该场景的子场景放在一条可滚动的条带里，两端各有一个步进箭头。`ui-agent-preset` 与槽位注册表都是必需注入而非可选席位，因此一次组合要么提供完整的选择器，要么完全不提供。

### 一次选择会做什么

| 子场景类型 | 一次选择会做什么 |
|---|---|
| 只有起始句 | 把其 locale 键所指的提示词起始句写入输入框草稿；不发送任何内容 |
| 具名 Agent 预设 | 仅当会话为空白时写入起始句，随后开启一个由该预设组成的会话 |

带预设的选择是本包表达「能力属于 Agent 而非文本」的方式：该子场景的工具与指令随会话一起到达，而不是变成一段要靠用户自觉发送的提示词。目前 `office.finance` 与 `design.video` 属于这一类，其余十六个只写起始句。

### 场景分类

三个场景——日常办公（office）、代码开发（code）与设计创意（design）——合计承载十八个子场景。同一项能力只有一个归属芯片：做演示文稿的是 `office.slides`，没有任何场景以另一个名字重复它，因此用户看到的是一枚标签，而不是在两枚之间挑选。每个 id 都稳定且可寻址：场景标签上是 `data-workbuddy-scenario`，芯片上是 `data-workbuddy-sub`，因此规格或部署无需依赖文案即可定位其中一个。

-----

<a id="understand-the-implementation"></a>
## 理解实现

[`scenarios.ts`](src/client/scenarios.ts) 以纯数据持有分类：稳定的场景 id、每个标签与每条提示词起始句的 locale 键，以及把子场景变成一项能力的可选 `presetId`。 [`locales.ts`](src/client/locales.ts) 拥有 `workbuddy.scenarios` 字典，其中文一侧是键集的唯一事实来源。 [`ScenarioTabs.tsx`](src/client/ScenarioTabs.tsx) 渲染两行，并持有本包唯一的状态——被标记的芯片。

一次选择会触达两个面，各对应一类子场景：`conversation.input.dock` 席位携带的会话作用域运行时份额里的 `inputActions.setDraft`，以及注入面的 `startSession`——注册时把它绑定到 `ctx.agentPresetLaunch.startSession`。注册是 `ctx.slots.inject` 内 order 为 8 的一个 dock 席位，因此它会等待声明方条目，并随本插件的 fiber 一起回滚；字典则走 `ctx.effect`。

### 标记是局部的，草稿不是

被标记的芯片是组件状态，不是持久状态：它背后的草稿或会话才是持久的东西，而用户可以整体替换其中任何一个。因此一次选择只为反馈标记芯片，不写其他任何东西——在一个已经跑过一轮的会话上做带预设的选择，不会改动该会话的组合，而是开启 New Session 流程，让用户在那里自己输入问题。

-----

<a id="further-exploration"></a>
## 进一步探索

- [`ui-workbuddy-mode`](../ui-workbuddy-mode/README.zh.md) —— 与本选择器共用输入框左侧条带的 Ask / Plan / Craft 控件。
- [`ui-conversation`](../ui-conversation/README.zh.md) —— 声明 `conversation.input.dock` 席位及其会话作用域运行时份额的输入框。
- [`ui-agent-preset`](../ui-agent-preset/README.zh.md) —— 名单本身，以及带预设的选择开启会话所用的 `agentPresetLaunch` 服务。
- [`ui-slots`](../ui-slots/README.zh.md) —— 本插件所合并的席位契约与 locale 命名空间映射。

-----

<a id="model-experience"></a>
## 模型体验

间接影响：通过 `agentPresetLaunch` 开启的会话生效。带预设的选择用该预设组成新会话的 Agent，而该预设自己的各个包拥有模型随后看到的工具、指令与提示段落。

#### KV Cache 影响

无直接失效；被具名预设背后的各个包拥有进入请求的一切，而一次选择写入草稿的起始句只有在用户发送后才到达模型。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **分类是文案，不是能力探测。** 每个子场景都是手写声明的，且只有 `office.finance` 与 `design.video` 具名预设，因此把其中某个预设从名单中拿掉的部署，会让那枚芯片开启一个该名单无法组成的会话。
- **带预设的选择无法改换一个已经跑过的会话。** 它改为开启新会话，因为会话的 Agent 组合在一轮之后就固定了；起始句只在会话为空白时才随行。
- **十八条起始句是面向用户的问题，不是提示词。** 起始句是预期由用户编辑或发送的文本，而属于带预设选择的起始句不得复述该预设自身提示词已经承载的协议。
- **不发布 runtime invariant 伴生，因为本包不拥有任何可能被独立观测分歧的关系。** 它的运行时行为是注册、字典归属与清理，已由销毁测试钉住。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

`src/index.ts` 刻意是一个空的宿主侧主体：本包不注册任何宿主侧行为，该行的存在只是让 Loader 看到这个插件，而浏览器半边通过 `exports["./client"]` 发布。

`office.finance` 是后续每个由 Agent 支撑的子场景所照搬的形态——加一个 `presetId`，选择就从只写草稿变成开启会话——因此新增者要在 `scenarios.ts` 里声明，并在同一次改动中为两侧字典补上文案。`design.video` 是第二个：把一个芯片从一个场景挪到另一个场景，挪的只是它的两个 locale 键和分类里的一行，别无其他，因为它的 id 和它开启的预设都不属于任何场景。中文侧是键集的唯一事实来源，英文侧依它校验。

</details>
