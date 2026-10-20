# Agent Note: financial-market analysis drives an external Python project

Status: implemented

[English](2026-09-17-finance-local-python-bridge.md) | 中文

## Problem

Web GUI 的「金融服务」场景此前只是一个金融分析人设之上的提示起始语，而 Harness 没有任何能产出真实盘面解读的工具。本机上已有一个可用的 Python 项目拥有这项分析：StockMarket，其 `data/`、`macro/`、`models/` 与 `strategy.py` 承载 A 股指数、ETF、估值、国债收益率与宏观数据的抓取，以及中证 300/中证 2000 打分与冰点/泡沫月度择时策略。因此该场景所承诺的分析，模型只能凭空编造。

这次改动必须在不重新实现该项目、不要求用户启动或看管服务、也不削弱 Harness 失败与上限保证的前提下，把真实数据交给模型；同时还要真正武装「金融服务」场景，因为模型接触不到的工具不构成能力。

## Decision

`packages/finance/finance-local`（`@deepseek-ai/dsh-finance-local`）就是金融分析能力。它承载全部三个 Capability Seam 角色：`src/service.ts` 是 Service Definition（`ctx.finance`，一个有界的 `invoke(invocation, signal)`），`src/index.ts` 中的包根入口是 Provider，`src/tools.ts` 中的 `tools` 入口是拥有五个面向模型 schema、参数映射与 JSON 呈现的 Consumer。

Provider 通过 `ctx.subprocess` 每次调用启动一个短命解释器进程，在 stdin 写入 `{"operation", "arguments"}`，并从 stdout 读取一个 JSON 响应对象。`python/finance_bridge.py` 是分发器：它导入分析项目自己的函数、运行它们并编码结果。每个分析操作都会先执行文档化的增量前置步骤——`fetch_all_data(force=False)` 与 `fetch_all_macro(force=False)`，随后是中证 2000 指数补丁——因此当天写入的缓存会被复用，只下载过期的序列。显式的 `market_data_refresh` 工具让该步骤可单独调用。

两条部署路径（`stockMarketPython`、`stockMarketRoot`）是必填 `Config` 字段，在根入口的 `apply` 中校验：解释器缺失或没有执行位、或项目根目录缺少 `data/fetcher.py`，都会让插件加载失败。`timeoutMs`、`maxDocumentBytes`、`maxStderrBytes` 与 `graceMs` 是带有声明默认值的有界 `Config` 字段，而 `tools` 入口带有自己的每次调用 `timeoutMs`。超过 `maxDocumentBytes` 的响应会让调用失败而不是被截断，解码器在进程边界校验响应对象。

根入口挂载在 Web 宿主平面的 `packages/bundle/web-app/cordis.patch.yml` 中，未设置 `DSH_FINANCE_STOCK_MARKET_ROOT` 时保持禁用，并用 `!!js` 表达式从环境读取两条路径；携带字面机器路径的部署在其 profile 补丁中覆盖该行。`tools` 入口则由 Agent 预设挂载，因此五个 schema 与分析指令属于用户所选择的那个 Agent。[金融服务 Agent 预设](2026-09-19-workbuddy-finance-agent.zh.md)拥有该组合、Dojo 行业面的移除，以及场景的改接。

## Consequences

该能力只与其外部项目及虚拟环境同样可用。没有它的机器保留一行禁用配置且没有工具；有它的机器可以触及真实分析，但每个结果都取决于该项目的网络管道、缓存时效规则与自身状态文件。由于 Provider 是宿主行、`tools` 入口是预设行，两者可以分开组合：未挂载 Provider 的部署无法组成挂载该 Consumer 的预设。

冷启动的分析调用可能要几分钟，因为分析项目按自己的计划重新抓取过期序列；`timeoutMs` 默认三分钟并可由部署方配置。挂载 `tools` 入口会向点名它的预设所在的 Agent 暴露五个 schema，而促使模型去使用它们的是预设自身的提示词。

插件不拥有任何分析阈值。当项目改变某个打分维度时，工具的 `score.details` 对象随之改变，无需更新任何 Harness 代码；面向模型的文档在该 Seam 中是不透明 JSON，仅通过工具 schema 陈述。

## Alternatives considered

**纯 TypeScript 重新实现。** 否决：它会把五维打分、阈值校准、回测过的通道逻辑与多源冗余复制成第二份实现，并立即与用户真正信任的那个项目产生漂移。该项目是事实来源，并将保持如此。

**MCP 服务器。** 否决：它会为 Harness 已经用 `ctx.tools` 加服务 Seam 建模的能力，再造一套进程拓扑与第二条工具注册路径，并把分析放到场景必须去发现的服务生命周期之后，而不是部署方已经拥有的配置之后。

**常驻分析服务。** 否决：该项目暴露的是普通函数而非服务协议，常驻进程会为天然只是一次批量调用的工作增加启动、健康检查、端口与拆除义务。所选形态按需启动，调用之间不保留任何东西。

**子代理 Provider 路线。** 否决：DojoAgents 自己的 CLI 在其工具之上运行完整的模型循环，因此委派给它会在用户与答案之间插入第二个模型、把 token 花在重新推导 Harness 可以直接抓取的数据上，并让结果取决于该项目的提示词栈而不是本 Harness 的工具契约。现在改为直接调用该项目的分析函数。

**为三个 Seam 角色建三个包。** 目前否决：`packages/AGENTS.md` 只在角色独立演进时才拆分 Seam。这里只有一个 Provider，Consumer 不读取 Definition 未陈述的任何东西，三者作为同一个部署单元发布，因此拆出 Definition 包与 Consumer 包只会增加清单、README 与注册，而没有独立的所有者。Consumer 是第二个*入口*而非第二个包，出于预设记录里说明的平面原因。

## Testing

`packages/finance/finance-local/tests/finance-local.spec.ts` 覆盖配置校验、以录制式 spawn 为边界的进程边界、每个工具的参数映射，以及两个入口的释放。`tests/loader-composition.spec.ts` 通过真实 Loader 在真实本地子进程 Provider 之上启动一个仅测试用的 `cordis.yml`，只用一个桩解释器替换外部 Python 进程，并断言模型可见的结果。`tests/real-analysis.e2e.ts` 在缺少两条路径时自行跳过；具备时则通过 Loader 运行真实桥接脚本完成中证 300 打分与合成择时信号。
