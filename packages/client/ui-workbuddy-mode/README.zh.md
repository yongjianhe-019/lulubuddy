---
description: "dsh Web 客户端的 WorkBuddy 协作模式控件：基于 plan 与 permissions 投影的 Ask / Plan / Craft 分段控件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbuddy-mode

[English](README.md) | 中文

## 概述

用输入框左侧条带里的 **Ask / Plan / Craft** 分段控件，选择当前会话的协作姿态。该控件读取 Host 计算出的 `plan` 与 `permissions` 投影，且只通过普通命令通道写入，因此自身不持有任何会话状态，也不新增模型可见输入。当部署想要 WorkBuddy 的三档姿态、又不想改动 plan mode 或权限预设时，选用本包。

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

把本插件与 `ui-conversation`、`ui-plan`、`ui-permission-presets` 一同挂载。当两项能力都已组合时，控件就占据输入框左侧条带。

### 三档模式的含义

| 模式 | 判读依据 | 选择后提交 |
|---|---|---|
| **Ask** | plan mode 关闭，权限预设 `read-only` | 需要时先 `/plan off`，再 `/permission read-only` |
| **Plan** | plan mode 开启（或正在进入） | `/plan` |
| **Craft** | plan mode 关闭，且预设为其他值 | 需要时先 `/plan off`；仅当原本是 `read-only` 时才 `/permission workspace-write` |

判读时 plan mode 优先于权限预设：它是更强的约束，无论沙箱如何都会把模型按在评审态，因此处于 plan mode 的会话即便在只读预设下也判读为 **Plan**。

### Craft 是解除限制，不是强制预设

选择 **Craft** 会把 `read-only` 限制恢复到 `workspace-write`，其余情况不动预设。因此一个被刻意设为 `danger-full-access` 的会话，经过一次 **Ask** 往返后仍保持原样，不会被悄悄收窄。

### 能力缺失时

只要 `plan` 或 `permissions` 任一投影不在组合中，该席位就保持为空 —— 与 plan 芯片和权限选择器遵循同一约定。它绝不渲染一个写不进去的控件。

-----

<a id="understand-the-implementation"></a>
## 理解实现

[`mode.ts`](src/client/mode.ts) 持有两个纯函数。`deriveMode` 按 Host 将来的方式折叠 plan 投影中待定的选择（`pending ? !active : active`）并判读模式；`modeCommands` 返回一次选择要提交的命令行，若选择已经成立则返回空列表。

组件从这两个函数渲染，并把得到的命令行交给注入面，由其按序执行、遇首个失败即停止。失败字符串保持英文，与 plan 芯片遵循的错误面策略一致。

### 无客户端乐观更新

被标记的选项只跟随投影。点击会提交命令并在落定前禁用整组；高亮在 Host 推回结果投影帧时才移动，绝不在点击时移动。点击已生效的模式不提交任何东西。

-----

<a id="further-exploration"></a>
## 进一步探索

- [`ui-plan`](../ui-plan/README.zh.md) —— 拥有 `conversation.input.plan` 席位的 plan 模式芯片。
- [`ui-permission-presets`](../ui-permission-presets/README.zh.md) —— `/permission` 选择器与通用设置默认行。

-----

<a id="model-experience"></a>
## 模型体验

间接影响：选 **Plan** 会进入 plan mode，从而把 plan-mode 策略段落加入请求；选 **Ask** 会把沙箱与审批策略收窄到 `read-only`/`ask`。控件本身不新增工具、提示段落或会话事件。

#### KV Cache 影响

无直接失效；plan mode 与沙箱/审批策略的归属包自行承担请求前缀的变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **两个轴，一个控件。** plan mode 与权限预设是彼此独立的 Host 能力；三档模式是它们叉积之上的呈现，而不是被存储的模式。旋钮不匹配任何模式的会话仍会渲染最近的模式，点击它即重新施加该模式的命令。
- **`Ask` 无法保证只读推理。** 它设置的是沙箱预设。模型仍可能依据上一轮已读入的工作区内容作答；该模式约束的是写入，不是知识。
- **映射不含自定义预设。** `read-only` 与 `workspace-write` 是出厂表中的键。若部署重命名了它们，`Ask` 与 `Craft` 提交的内容随之改变，而控件无法发现这一重命名。
- **不发布 runtime invariant 伴生，因为本包不拥有任何可能被独立观测分歧的关系。** 它的运行时行为是在两个 Host 旋钮之上的命令注册，已由销毁测试钉住。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本包照搬 `ui-plan` 的注册形态（声明感知的 `slots.inject`、闭包持有 `sessionId` 的注入面、作为 effect 注册的 locale 字典），因为两者都基于同一命令通道占据一个输入框席位。它注册进 `conversation.input.left` —— 一个没有 owner props 的 `list` 席位，因此其 props 是运行时 share + 注入面 + locale 席位，没有 `locked` share 需要处理。

</details>
