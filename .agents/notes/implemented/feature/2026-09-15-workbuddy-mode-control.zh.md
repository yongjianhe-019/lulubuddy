# Agent Note: WorkBuddy 协作模式控件

Status: implemented

[English](2026-09-15-workbuddy-mode-control.md) | 中文

## Problem

WorkBuddy 呈现为一个姿态控件 —— Ask、Plan 或 Craft —— 用户只需思考一个选择。DSH 把同样的两个轴表达成两个彼此独立的界面：输入框 `conversation.input.plan` 席位上的 plan 芯片，以及 `/permission` 背后的权限选择器。于是想要 WorkBuddy 姿态的部署没有单一控件可用，用户还必须知道「只问不动」意味着一个权限预设，而不是一个模式。

## Decision

[`ui-workbuddy-mode`](../../../../packages/client/ui-workbuddy-mode/README.zh.md) 把分段控件加入输入框的 `conversation.input.left` 列表席位。

该控件不持有任何模式状态。它读取 Host 计算出的 `plan` 与 `permissions` 投影并据此判读当前模式：plan mode 开启（或正在进入）判读为 **Plan**；否则 `read-only` 预设判读为 **Ask**，其他预设判读为 **Craft**。判读时 plan mode 优先，因为它是更强的约束 —— 无论沙箱如何都会把模型按在评审态。

每一次写入都走普通命令通道（`/plan`、`/plan off`、`/permission <preset>`），因此控件不新增会话事件，也不新增模型可见输入。被标记的选项只跟随投影；点击提交命令并在落定前禁用整组，高亮在 Host 推回结果投影帧时才移动。

`Craft` 会把 `read-only` 限制恢复到 `workspace-write`，其余情况不动预设，因此一个刻意设为 `danger-full-access` 的选择经过一次 `Ask` 往返后仍保持原样，不会被悄悄收窄。只要任一投影缺失，席位就保持为空，与 plan 芯片和权限选择器既有的约定一致。

## Alternatives considered

**把 `mode` 作为会话状态存起来。** 这给控件一个权威值，判读也变得平凡，但它所概括的两个旋钮仍可被分别写入 —— 被 `/plan`、被 `/permission`、以及被通用设置默认值。存下来的模式会成为第三个事实来源，需要与 Host 已经拥有的两个去对账，而且它需要会话事件才能被重建。

**替换 `ui-plan`，独占 `conversation.input.plan` 席位。** 复用该席位避免了新增控件，并让所有 plan 相关操作集中在一处，但 `single` 席位只容一个占用者，所以这是替换包而不是插件贡献。该席位还携带 `locked` owner share，且尺寸是为状态芯片而非三选项组设计的。

**选 Craft 时强制 `workspace-write`。** 这会让三档模式成为一个闭环，每次选择都重新施加完整姿态，但它会悄悄收窄用户刻意放宽的会话，而且这次收窄在下一次写入被拦之前都不可见。

**从审批策略而非沙箱预设判读 Ask。** 审批与沙箱是两个独立的旋钮，部署可以配置任一；以沙箱预设为键才是真正限制写入的那一个，而「只问不动」说的正是限制写入。

## Consequences

三档模式是两个 Host 能力叉积之上的呈现，而不是被存储的状态，因此旋钮不匹配任何模式的会话仍会渲染最近的模式，点击它即重新施加该模式的命令。无需迁移，会话日志也不变。

`Ask` 约束的是写入而非知识：模型仍可能依据上一轮已读入的工作区内容作答。该映射还直接写死了出厂预设键 `read-only` 与 `workspace-write`，因此重命名它们的部署会改变 `Ask` 与 `Craft` 提交的内容，而控件无从察觉。
