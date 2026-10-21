---
description: "五项金融分析工具的 Web 专用卡片：KPI 行、按维度得分的条形、冰点阈值仪表、宏观事实、择时信号与刷新时间线。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-finance-view

[English](README.md) | 中文

## 概述

把五项金融分析工具的返回结果渲染为专用卡片，而不是一段原始 JSON 代码块。每张卡片以各自的线上工具名注册进 ui-tool 的键控 `tool.call.toolview` 席位，解码该工具自己的文档结构，并在文档无法识别时回退到结果文本。卡片只使用语义化的 `--dsw-alias-*` 令牌与 CSS Modules，因此 WorkBuddy 皮肤无需改动组件即可重新着色。

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

把本插件与 `ui-tool` 一同挂载。五项金融工具随后在会话中显示各自的卡片：

| 工具 | 卡片展示 |
|---|---|
| `csi300_analysis` | KPI 行、按解析出的上限绘制的逐维度得分条、冰点仪表，以及每个维度其余字段 |
| `csi2000_analysis` | 同样的得分版式，外加它的三通道买入明细 |
| `market_timing_signal` | 两个指数的得分、每个指数一张信号卡，以及仓位建议 |
| `macro_snapshot` | 最新宏观事实的 KPI 网格及其日期，外加估值与国债收益率行 |
| `market_data_refresh` | 刷新模式、每个数据集的行数与日期区间，以及按最新排序的缓存文件 |
| `market_dashboard` | 组合日报的结论、核心行、机会、龙头闸门、计划与告警 |
| `csi2000_ice_check` | 买入闸门状态、收盘/MA10、分数分位、通道、缺口与条件明细 |
| `opportunity_radar` | 卫星机会的 R:R、胜率、EV 与缺失条件 |
| `dragon_head` | 环境、情绪、板块涨停结构与收盘标记 |
| `positions_snapshot` | 持仓与已平仓，以及截至日期 |

组合未注册的工具仍留在通用工具行上，因此未组合该行就是关闭开关。

### 卡片如何处理结果

每个取值都来自工具结果文本：它在若干 `Data warnings:` 行之后以一个围栏 JSON 对象承载文档。运行中的调用会自行声明状态；文本不是该工具文档的已结算结果直接渲染原始文本；两者都保留卡片标题。警告既可来自前言，也可来自文档自身的 `warnings` 数组，最终都进入卡片的警告列表。

-----

<a id="understand-the-implementation"></a>
## 理解实现

[`model.ts`](src/client/model.ts) 拥有整个不可信输入边界：它收窄每个 JSON 值、解码围栏文档、解析每个维度括号中的上限（`估值温度(30)`、`ERP极端信号(+15)`），并为每个工具派生一个视图模型。视图对任何无法识别的输入返回 `null`，卡片则改为渲染 [`PlainResult`](src/client/parts.tsx)。

[`charts.tsx`](src/client/charts.tsx) 承载两个手写图形：一个线性得分条，以 `role="progressbar"` 暴露真实得分与上限；一个半圆阈值仪表，带阈值刻度。 [`parts.tsx`](src/client/parts.tsx) 承载卡片外壳、KPI 胶囊、警告列表、字段表与回退。四个视图模块渲染五张卡片：一个共享的指数得分渲染器用于两个指数键，外加择时卡、宏观卡与刷新卡各一。

### 注册

`ctx.slots.inject('tool.call.toolview', …)` 在插件 fiber 内按工具名逐个产出键控注册，`ctx.effect` 拥有 `finance` 词典。键是线上工具名而非操作名：`market_timing_signal` 渲染的是包装键为 `signal` 的文档。

### 量程从何而来

维度名在括号中自带上限，因此条形的量程是解析出来的而不是写死的，得分取 `得分` 字段，并回退到某个维度改用的 `总分` 键。冰点仪表跨越文档说明的 0–100 分区间，因为文档不携带总分上限；阈值本身来自文档的 `ice_point_threshold`，只有发布它的指数才有。

-----

<a id="further-exploration"></a>
## 进一步探索

- [`ui-tool`](../ui-tool/README.zh.md) — 声明 `tool.call.toolview` 席位的工具调用呈现层。
- [`ui-primitives`](../ui-primitives/README.zh.md) — 动作与冰点徽章复用的 `Tag` 胶囊。
- [`ui-theme`](../ui-theme/README.zh.md) — 这些卡片消费的语义化 `--dsw-alias-*` 令牌。
- [`dsh-finance-local`](../../finance/finance-local/README.zh.md) — 产生被解码文档的能力与宿主渲染器。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只是对已持久化工具结果的纯客户端呈现；工具结果本身以及模型读取的文档都没有变化。

#### KV 缓存影响

无失效。本包不增加任何请求内容，也不新增会话事件。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **这些卡片是固定渲染器，不是控件语言。** 五项工具各有一个手写组件；新增一项金融工具，或出现任何卡片未预定义的视图组合，都需要新组件与新注册，而不是一个组合式描述符。
- **无法识别的文档显示原始文本。** 回退是结果文本而不是半张卡片，因为本包不对它不认识的结构作任何声明；所有字段都消失的文档只渲染其残留部分。
- **宏观事实标签只覆盖分析项目当前发布的键。** 不熟悉的宏观键会原样渲染，因此新增宏观序列在补上词典键之前会以其蛇形命名显示。
- **游标分页把调用留在运行窗口之外时没有工具身份**，因此只有结果的历史页会落到 ui-tool 的通用行。
- **不发布运行时不变式伴随包，因为本包不拥有任何独立观测可能产生分歧的关系。** 它的运行时行为是注册、词典所有权与清理，均由处置测试钉定。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 — 点击展开</summary>

测试用 2026-09-19 真实运行 `finance_bridge.py` 后由 `renderFinanceDocument` 产出的精确文本驱动组件，这些文本以 `<tool>.rendered.txt`（工具输出）连同 `<tool>.bridge.json`（原始桥接响应）检入在 `tests/fixtures/` 下。重新运行桥接、把它的 `document` 与 `warnings` 送入宿主渲染器即可同时重生成两者；不要手写夹具，因为这些卡片存在的意义就是读取真实文档。

`src/index.ts` 故意是空的宿主主体：本包不在宿主侧注册任何内容，该行的存在只是让 Loader 看到插件，而浏览器半边通过 `exports["./client"]` 发布。

</details>
