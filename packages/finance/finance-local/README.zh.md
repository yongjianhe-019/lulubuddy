---
description: "金融市场分析能力（ctx.finance）：驱动 StockMarket 项目的 Python Provider，以及 Agent 预设挂载的五个面向模型的大盘、指数、择时与宏观工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-finance-local

[English](README.md) | 中文

## 概述

`dsh-finance-local` 让 Harness 能够基于真实 A 股、ETF 与宏观数据，为中证 300 与中证 2000 打分、生成冰点/泡沫月度择时信号、刷新市场序列，并快照宏观面板——它就是 Web GUI「金融服务」Agent 预设背后的能力。根入口是宿主侧：`ctx.finance` 的 Service Definition 与一个 Provider，后者通过 `ctx.subprocess` 为每次调用启动部署方配置的 Python 项目，交换一次 JSON 请求与响应。`tools` 入口是面向模型的一侧，由 Agent 预设挂载。部署方决定项目所在位置；预设决定模型是否看到这些工具。

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

在已经加载子进程 Provider 的组合中挂载根入口：它提供 `ctx.finance`，不注册其他任何东西。把 `tools` 入口挂载在应当看到市场工具的 Agent 被组成的地方——即 Agent 预设内部——因为这些工具 schema 属于该 Agent，而不是主机上的每个会话。

### 何时选择

当部署方需要真实的 A 股与宏观分析、而不是模型自己的记忆时选择它：工具返回分析项目自身的分数、阈值与数据源判断，并在抓取失败时说明缺什么，而不是猜测。不要在没有该项目的主机上挂载它；缺少项目时根入口会拒绝加载。

### 部署要求

部署方必须提供带虚拟环境的 **StockMarket** 项目：其 `data/fetcher.py`、`macro/fetcher.py`、`models/` 与 `strategy.py` 负责数据抓取与打分。

### 最小配置

两条路径都是必填项并在加载时校验：解释器缺失、解释器没有执行位、或项目根目录缺少 `data/fetcher.py`，都会让插件加载失败，而不是留到后面的分析调用才失败。它们是仅有的机器相关字段；所有上限都有声明的默认值。

```yaml
- name: '@deepseek-ai/dsh-finance-local'
  config:
    stockMarketPython: /path/to/StockMarket/.venv/bin/python
    stockMarketRoot: /path/to/StockMarket
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `stockMarketPython` | required | StockMarket 虚拟环境解释器 |
| `stockMarketRoot` | required | StockMarket 项目根目录（桥接脚本的导入根） |
| `timeoutMs` | `180000` | 单次桥接调用的墙钟上限 |
| `maxDocumentBytes` | `8388608` | 单次响应的内存上限；超出即调用失败 |
| `maxStderrBytes` | `65536` | 捕获的 stderr 上限，仅用于失败详情 |
| `graceMs` | `5000` | 子进程的终止与排空宽限期 |

`tools` 入口只接受一个字段。它的预算不得短于 Provider 的 `timeoutMs`，否则工具调用策略会取消一个 Provider 仍认为在预算内的桥接进程：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `timeoutMs` | `180000` | 附加到每个金融工具上的协作式工具调用预算 |

```yaml
- name: '@deepseek-ai/dsh-finance-local/tools'
```

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-finance-local)是每个可接受字段及其 JSDoc 的完整来源。它覆盖包的根入口，因此 `tools` 入口自己的字段记录在这里。

### 工具

| 工具 | 返回 |
|---|---|
| `market_data_refresh` | 对缓存的指数、ETF 与宏观序列做增量刷新，并返回每个数据集的行数、日期跨度与缓存修改时间 |
| `csi300_analysis` | 中证 300 的五个维度得分、ERP 极端与宏观底部两个加分维度、最新收盘、PE 分位与冰点判定 |
| `csi2000_analysis` | 中证 2000 得分、三通道买入信号、其仓位比例与通道明细 |
| `market_timing_signal` | 合成后的月度信号：冰点标记、各指数的卖出或回补腿及其理由、操作与仓位建议 |
| `macro_snapshot` | 最新对齐的宏观行与近期历史，外加中证 300 估值与十年期国债收益率 |
| `market_dashboard` | 组合日报：核心指数动作、下一触发、卫星机会、龙头闸门、持仓、计划、近期日志对照与降级面板 |
| `csi2000_ice_check` | 买入闸门：ETF 收盘、MA10、通道、仓位、分数分位、回撤，以及离触发还差什么 |
| `opportunity_radar` | 卫星 ETF 机会：R:R、条件胜率、EV、建议仓位与缺失条件 |
| `dragon_head` | 最新盘后龙头复盘：环境、涨停情绪、板块结构与跟踪候选 |
| `positions_snapshot` | 人工维护的持仓文件与卫星雷达状态 |
| `journal_append` | 往核心或卫星交易日志追加一条分析记录 |
| `journal_recent` | 最近的核心、卫星与日报记录：上次计划、触发缺口与复盘 |
| `dragon_history` | 最近 N 份龙头盘后复盘（从新到旧）与跟踪候选台账 |
| `strategy_doc` | 读取项目里的心法、进度或 README 文档 |

每个分析工具都会先执行文档化的增量前置步骤（`fetch_all_data`/`fetch_all_macro` 且 `force=False`），因此当天写入的缓存会被复用，只下载过期的序列。`market_data_refresh` 的作用是在首次分析前显式执行该步骤。

### 失败与恢复

Provider 在进程边界校验桥接脚本的 JSON 响应。非零退出会回报捕获的 stderr；响应格式错误或自身失败会拒绝；响应超过 `maxDocumentBytes` 会失败而不是截断；配置的 `timeoutMs` 会终止失控的子进程；调用方的 `exec.signal` 会在取消时终止它。工具层把每次拒绝转成模型可见的 `Error: <message>`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释插件背后的设计决策；可观测行为已在[使用本包](#use-this-package)中完整覆盖。

### Capability Seam 的角色

本包拥有全部三个角色：`src/service.ts` 是 Service Definition（`ctx.finance`，一个有界的 `invoke`），`src/index.ts` 注册 Python Provider，`src/tools.ts` 是拥有 schema、参数映射与呈现的 Consumer。Consumer 是一个独立入口，而不是 Provider 的又一行，因为两者回答不同的所有者：部署方指定外部项目，而 Agent 的预设选择工具。除工具外没有别的东西读取该服务的方法，因此 Seam 的 Provider 与 Consumer 共享同一个版本。

### 进程模型

每次调用都是一个短命解释器进程，而不是常驻服务：Provider 通过 `ctx.subprocess` 启动 `[python, python/finance_bridge.py]`，在 stdin 写入 `{"operation", "arguments"}`，并从 stdout 读取一个 JSON 对象。桥接脚本把配置的项目根目录加入 `sys.path`，并以该解释器在该目录下运行。`python/finance_bridge.py` 只是分发器——它导入分析项目自己的函数并编码其结果。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 根入口：该能力的配置 schema、路径校验与 Provider 注册 |
| [`src/service.ts`](src/service.ts) | `FinanceRuntime` Service Definition 与调用词汇 |
| [`src/types.ts`](src/types.ts) | 操作、各操作的参数与结果文档 |
| [`src/provider.ts`](src/provider.ts) | 每次调用一个进程的 Provider、响应解码、上限与取消 |
| [`src/tools.ts`](src/tools.ts) | `tools` 入口：十四个面向模型的工具、其 JSON 呈现，以及它们在 `ctx.finance` 上的独立挂载 |
| [`python/finance_bridge.py`](python/finance_bridge.py) | 面向分析项目的 stdin/stdout JSON 分发器 |
| — | 不发布运行时不变式伴随文件；除 Seam 契约外本包不拥有可独立观测的关系，其上限由 Provider 强制执行。 |

### 读取路径

一次调用以有界的 stdout/stderr 收集方式启动一个进程，并等待退出。成功时解码桥接脚本的 `{"ok": true, "document", "warnings"}` 对象；Consumer 把 `warnings` 追加到规范值上，并把整个文档渲染为 JSON，以免丢失任何维度明细。所有无法产出完整文档的分支都会抛出异常，因此残缺文档永远不会到达模型。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级契约不够用时阅读这些页面。它们从 Seam 词汇走向挂载本插件的组合。

- [dsh-subprocess](../../subprocess/subprocess/README.zh.md) — 本 Provider 所使用的子进程 Seam。
- [dsh-tools](../../core/tools/README.zh.md) — Consumer 注册所用的工具注册表与执行流水线。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-finance-local) — 每个可接受的根入口配置字段及其来源声明。
- [金融分析能力决策](../../../.agents/notes/implemented/feature/2026-09-17-finance-local-python-bridge.zh.md) — 为什么该能力驱动外部项目而不是重新实现它们。

-----

<a id="model-experience"></a>
## 模型体验

### 面向模型的工具

#### 模型看到什么

模型看到上述十四个 schema，且只在挂载了 `tools` 入口的预设所组成的会话中看到；`market_data_refresh` 带有可选的 `force` 参数。数据源路径、解释器、上限与桥接协议对模型不可见。

#### Token 影响

`tools` 入口挂载在该 Agent 上期间，每次请求都有固定的 schema 开销。在预设中卸载它是移除这些 schema 的方式。

#### KV Cache 影响

对于只组合一次该入口的 Agent（预设在其首个请求前正是如此），前缀保持稳定。

### 工具结果

#### 模型看到什么

成功调用返回可选的 `Data warnings:` 项目符号列表，随后是 ```json 围栏中完整的桥接 JSON 对象。例如中证 300 调用会返回 `index`、`as_of`、`close`、`pe_percentile`、`ice_point`、`ice_point_threshold`，以及带各维度明细的嵌套 `score` 对象。

#### Token 影响

随数据变化，并在压缩前反复重发。警告列表只承载不可用或降级的数据源，文档在进程边界受 `maxDocumentBytes` 限制。

#### KV Cache 影响

仅追加；新可见内容跟在可复用请求前缀之后，不会使既有 KV 缓存条目失效。

### 工具错误

#### 模型看到什么

每次拒绝都变成精确的 `Error: <message>`：带捕获 stderr 的非零退出、桥接脚本自身的错误详情、格式错误的响应、字节上限、配置的超时，或调用方取消。

#### Token 影响

只有被保留的错误结果会增加 token。

#### KV Cache 影响

仅追加；错误跟在可复用请求前缀之后，不会使既有 KV 缓存条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了该能力何时不可用或不合适。它们是本包当前的约束。

- **冷启动的分析调用可能要几分钟。** 分析项目按文档化的增量计划重新抓取过期序列，因此一天中的首次调用可能在其自身数据管道中花费一分钟以上。`timeoutMs` 会约束它，部署方可自行调整。
- **能力与工具分属不同所有者，因此 `tools` 入口需要宿主 Provider。** 未挂载 `ctx.finance` 的部署会让该入口一直等待它，而挂载该入口的预设所组成的会话会被拒绝，而不是以残缺组合启动。Web 发行包让 Provider 行保持禁用，直到部署方指定项目位置。
- **覆盖面是指数与宏观面板。** 这里没有个股、行业/主题排序、卫星扫描或组合工具：那些需要本包并未驱动、且可持续维护的数据源，而过期的数据源会把旧值当作当前分析呈现。
- **桥接协议由其自身的请求/响应字段而非 schema 版本定义**：新增操作是追加式的，而改变响应信封对 `decodeBridgeResponse` 是破坏性变更。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

四个上限与两条路径就是部署相关的全部表面；分析阈值留在外部项目中，因此那边发生变化只会改变工具文档，无需改动本包。

</details>
