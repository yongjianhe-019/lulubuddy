---
description: "dsh Web 客户端的 WorkBuddy 外壳界面：左侧能力导航与右侧结果区标签页，两者都是以只读索引的形式把每个 WorkBuddy 界面与背后的 DSH 能力配对。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbuddy-shell

[English](README.md) | 中文

## 概述

把 WorkBuddy 办公外壳的两个导航界面呈现为 **只读索引**：左侧栏的一行打开主列中的能力索引，右侧栏的一个标签页索引 WorkBuddy 的结果区。每一行都把 WorkBuddy 的一个界面与背后的 DSH 能力配对，或直说 DSH 没有对应能力。当部署想要 WorkBuddy 的能力图可见、又不想凭空造出 DSH 并不具备的能力或写入路径时，选用本包。

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

把本插件与 `ui-layout`、`ui-sidebar`、`ui-sidebar-right` 一同挂载。左侧栏的全局面板行会多出 **WorkBuddy 能力**，它在主列打开能力索引；右侧栏的引导页会提供 **WorkBuddy 结果区** 页面，其主体就是结果索引。

### 能力索引

| WorkBuddy 界面 | DSH 对应 |
|---|---|
| 专家中心 | `packages/subagent` 与 Agent 预设 |
| 技能市场 | `packages/skill` —— 文件系统发现；DSH 没有市场界面 |
| 自动化 | `packages/schedule` —— 能力存在；DSH 没有写入界面 |
| 连接器 | `packages/mcp` |
| 记忆 | 无 —— DSH 没有对应能力 |

### 结果索引

| WorkBuddy 界面 | DSH 对应 |
|---|---|
| 变更记录 | 没有独立面板；文件改动以会话内的工具行与交付行呈现 |
| 浏览器预览 | 没有内置浏览器；右侧栏的文档预览可以只读渲染 HTML 文件 |
| 分享 | 无 —— DSH 没有对应能力 |

### 这里没有控件

没有一行是按钮，面板也不声明任何写入路径。这是刻意的：DSH 没有市场界面、没有自动化编辑器、没有浏览器、也没有分享服务可供本包把点击路由过去，所以一行陈述事实，而不是提供一个点了没用的操作。本包贡献的唯一可交互元素就是侧栏那一行本身，它选择面板，因此确实做了事。

-----

<a id="understand-the-implementation"></a>
## 理解实现

[`index-data.ts`](src/client/index-data.ts) 以纯数据持有两组行 —— 左侧能力与右侧结果：稳定的行 id、WorkBuddy 界面的 locale 键、DSH 对应陈述的 locale 键，以及标记 DSH 并不具备该界面的 `absent`。 [`IndexPanel.tsx`](src/client/IndexPanel.tsx) 把任意一组行渲染成共享的只读面板，两个界面都是它的薄封装：[`CapabilityIndex.tsx`](src/client/CapabilityIndex.tsx) 供左侧面板，[`ResultsBody.tsx`](src/client/ResultsBody.tsx) 供右侧标签页。

本包对三处注册使用同一个身份 `SHELL_ID`。`sidebar.panellist` 行把它当作列表 `id`；`main` 主体以同一个键注册，因此该行指向该面板。结果区标签类型把它发布为定义里的 `id`，带键的 `sidebar.right.pane.tab` 与 `sidebar.right.pane.tab.title` 席位也以同一 id 注册，因此即便其他类型接管了 kind，芯片与主体仍然一同派发。 [`CapabilityIcon.tsx`](src/client/CapabilityIcon.tsx) 画侧栏行的字形； [`ResultsTitle.tsx`](src/client/ResultsTitle.tsx) 画芯片的。

两个面板主体都接 locale 席位（`workbuddy.shell`），侧栏行则从一个 `label` thunk 解析其无障碍名称，因此语言切换会重新读取文案，无需重新注册。

-----

<a id="further-exploration"></a>
## 进一步探索

- [`ui-workbuddy-mode`](../ui-workbuddy-mode/README.zh.md) —— Ask / Plan / Craft 输入框控件，另一个 WorkBuddy 呈现包。
- [`ui-sidebar`](../ui-sidebar/README.zh.md) —— 声明 `sidebar.panellist` 的侧栏外壳。
- [`ui-sidebar-right`](../ui-sidebar-right/README.zh.md) —— 标签注册表与带键的主体/标题席位。
- `packages/subagent`、`packages/skill`、`packages/schedule`、`packages/mcp` —— 索引所点名的 DSH 能力。

-----

<a id="model-experience"></a>
## 模型体验

无。本包不新增工具、提示段落、会话事件或模型可见输入；它渲染的是 locale 字典里已经存在的静态文案，且不读取任何会话数据。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **索引是文案，不是能力探测。** 每条对应陈述都是手写点名的 DSH 包。挂载或卸载这些包不会改变索引，移除 `packages/mcp` 的部署仍会读到连接器一行由它支撑。
- **按范围没有写入界面。** 本包只做产品界面：不新增技能市场、自动化编辑器、浏览器预览或分享服务。这些行存在的意义是让缺失可见，而不是在这里把它补上。
- **结果标签页是页面，不是查看器。** 它不认领资源地址，也不接导航参数，因此无法以某个具体文件或会话为主题打开。
- **不发布 runtime invariant 伴生，因为本包不拥有任何可能被独立观测分歧的关系。** 它唯一的运行时行为是注册与清理，已由销毁测试钉住。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本包在标签页两阶段注册上照搬 `ui-sidebar-files`（先 `ctx.sidebarRightTabs.register` 注册类型，再在带键的 `sidebar.right.pane.tab` 与 `sidebar.right.pane.tab.title` 席位注册），在 locale 与 Host 半边形态上照搬 `ui-workbuddy-mode`。它注册进另外三个包的席位 —— `ui-sidebar`/`ui-layout` 的 `sidebar.panellist` 与 `main`，以及 `ui-sidebar-right` 的两个标签席位 —— 因此每次注册都走 `ctx.effect` 里的 `ctx.slots.inject`，它会等待声明方条目，并随本插件的 fiber 一起回滚。

共享面板是无 store、无注入面、无订阅的纯呈现组件：行是模块常量，文案来自 `t` 席位，因此没有需要穿线的活数据。

</details>
