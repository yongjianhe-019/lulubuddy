# Agent Note: the 金融服务 scenario becomes a finance agent preset

Status: implemented

[English](2026-09-19-workbuddy-finance-agent.md) | 中文

## Problem

Web GUI 的「金融服务」子标签只往输入框里写入一段草稿：草稿点名了七个分析工具，并要求模型以机构分析师的身份作答。这个选择背后没有任何东西为那个会话挂载这些工具：能力的 schema 注册在宿主平面上，因此进程内每个会话都能看到它们，而子标签本身只写文本。七个工具里还有两个伸到了 Harness 自身数据路径之外——其中一个读取 Dojo 行业快照，而该快照最新的交易日是 `2026-08-21`，仓库里又没有任何东西刷新它，于是一个月前的行业表会被当作当前分析呈现。

每个场景子标签都将成为各自的 Agent，金融服务是第一个，因此这个选择必须组装一个会话，而不是给它所在的那个会话做装饰。

## Decision

`packages/preset/agent-presets/presets/finance` 是一个随包发布的 Agent 预设。它运行两行：一行 `persona`，其 prefix 陈述分析师身份、suffix 承载提炼后的工具协议；一行 `finance-tools`，指向 `@deepseek-ai/dsh-finance-local/tools`。由它组成的会话——也就是每个选择金融服务的会话——恰好看到五个工具 schema 和系统提示词中的协议，其他会话两者都看不到。

能力只保留由 StockMarket 支撑的工具：`market_data_refresh`、`csi300_analysis`、`csi2000_analysis`、`market_timing_signal` 与 `macro_snapshot`。Dojo 依赖是被删除而不是被配置的——`sector_theme_query` 工具、`python/dojo_sector.py`、`dojoPython` 与 `dojoDataDir` 两个 `Config` 字段、桥接脚本的 `sector_query` 操作，以及所有演练它们的测试。卫星 `opportunity_radar` 工具随之删除：它由 StockMarket 支撑，但它是一个会写入自身持仓状态文件的建仓工作流，而本阶段是一个没有执行与持仓面的分析 Agent。

### Two entries, two owners

`@deepseek-ai/dsh-finance-local` 现在有一个根入口和一个 `tools` 入口。根入口是宿主侧——`ctx.finance` Service Definition 与 Python Provider，其 `stockMarketPython` 与 `stockMarketRoot` 是必填 `Config` 字段。`tools` 入口是面向模型的一侧，由预设挂载在宿主 Provider 之上。

这次拆分是由配置能放在哪里决定的，而不是出于偏好。preset 文件是名单通过 `Include` 直接挂载的输入；任何 profile 或 bundle 补丁层都到不了它。因此如果 Provider 位于 preset 中，外部项目的路径就无法来自部署方的 `cordis.patch.yml`，而在随包发布的 preset 里写死字面路径则会把某一台机器硬编码进仓库。Provider 行留在宿主平面，profile 补丁已经用字面路径覆盖它；预设挂载不需要任何机器相关字段的 Consumer，而工具 schema 从此属于该 Agent 而不是宿主。`verify-cordis-config` 从另一侧执行同一条单平面规则：preset 行重复一个仍然活跃的宿主行 id 会被拒绝。

### The protocol

来源是 DojoAgents 的强制工具调用协议——21,526 字符、340 行、33 个工具，其中大部分是组合工作流、主题筛选与 `screen_market_stocks` 路由。预设的 persona suffix 保留了能迁移到本组合的部分：分析师身份、在真实存在的五个工具上「每条消息只选一条路径」的路由规则、分析工具本身已执行项目增量抓取因此 `market_data_refresh` 只用于显式刷新的规则、`market_timing_signal` 就是合成后的立场而不构成重新读取两个指数分数的理由的顺序规则，以及强制的时效披露——写明每份文档的 `as_of` 日期，并把每条 `warnings` 当作限制转述，因为出现警告意味着该面板缺失而不是为零。它还陈述了范围边界：没有个股、行业、组合或执行面，也不以记忆代替工具事实。

结果在 persona suffix 中约 2,000 字符。本组合无法据以行动的内容——组合写入、批量代码解析、分类 id 处理、会话文件保存——都被删除而不是改写。

### The pick opens a session

`packages/client/ui-workbuddy-scenarios` 为子场景新增了 `presetId`：指定它即声明该选择代表一整套能力，而金融服务是唯一指定它的子场景。指定预设的选择通过 `packages/client/ui-agent-preset` 提供的 `agentPresetLaunch` 客户端服务打开由该预设组成的会话。该服务会把预设暂存到 Hero chip 自己的控制器上并启动新建会话流程，由流程既有的复用或新建规则决定哪个会话承接这一选择。

只有空会话可以切换预设：会话产出过回合后，宿主会拒绝 `agent-presets/select`。因此该服务从不尝试改指当前会话。目标工作区中的空白会话正是流程会复用的那个，因此子场景的起始语会被写入该输入框，用户仍看着同一个输入；已经运行过的会话保持自己的组装，流程新建一个空白会话，用户在那里输入。两种情况下 chip 都会宣告该预设，因为这个选择是在别处做出的。

`office.finance.template` 的起始语已在两种语言中对齐：它不再点名任何工具，现在是一个简短的问题——用户想知道什么——而不是重述预设提示词已经承载的路由规则。

## Alternatives considered

**保留 Dojo 工具并加一个定时刷新。** 否决：本仓库中没有任何东西刷新该快照，因此刷新路径只能建在这里——第二个外部项目的管道、凭据与失败模式——去支撑第一阶段并不需要的行业面。该快照自身的滞后（其 `manifest.json` 中 `window_end` 与 `latest_trade_date_by_market` 都指向 `2026-08-21`）是「被当作当前分析呈现」的正确性缺陷，而不是定时任务能够弥合的配置缺口。

**以子代理方式委派给 DojoAgents 项目。** 否决：该项目的 CLI 在自己的工具上运行自己的模型循环，因此委派会在用户与答案之间插入第二个模型、把 token 花在重新推导本 Harness 可以直接抓取的数据上，并让回答取决于该项目的提示词栈而不是本预设。能力 Seam 已经启动该项目自己的分析函数，那才是值得复用的部分。

**让子标签继续只做提示模板。** 否决：点名工具的草稿并不会挂载它们。它装饰的会话仍然只是带着金融外衣提示词的编码 Agent，工具 schema 仍然对每个其他会话可见，而草稿点名了部署并未挂载的工具，就是该组合无法兑现的声明。场景 chip 的职责是选择能力，因此这个选择必须抵达会话的组装。

**由预设挂载整个插件。** 否决：Provider 的配置恰恰就是机器相关的部分，而任何补丁层都到不了 preset 文件。可选方案只有：在随包源码里写死字面路径、要求每个部署在 Provider 加载前导出环境变量、或本记录采用的平面拆分。前两者用一个有文档的部署接口换来了硬编码或环境依赖。

**把源协议整段粘贴进 persona。** 否决：21,526 字符对应 33 个工具，而本组合不挂载其中 28 个。路由表自己的规则——每条消息只选一条路径——对 Agent 并不具备的工具无法遵守，而不可用的部分会在每次请求中重发。

## Consequences

金融 Agent 的目录恰好是五个 schema，而且它们属于由该预设组成的会话，而不是属于进程。未挂载 `ctx.finance` Provider 的部署无法组成该预设：`finance-tools` 会等待该服务，挂载被拒绝并点名该行。随包发布的 Web bundle 让 Provider 行保持禁用，直到部署方指定项目位置，因此选择金融服务的标准部署会被拒绝，而不是以一个残缺的 Agent 启动。

Dojo 行业与主题能力被有意推迟。**在没有刷新路径的前提下不得重新加入**：一个在本仓库中没有写入方的快照，其数据源的年龄是 Harness 无法陈述的，而工具契约要求陈述它。

移除宿主平面的工具注册意味着这些工具不再出现在不运行预设的会话中。依赖它们的部署可以通过组合本预设、复制它，或在自己的预设中列出 `@deepseek-ai/dsh-finance-local/tools` 来获得它们。

生成的配置目录覆盖包的根入口，因此 `tools` 入口自己的 `timeoutMs` 字段记录在包 README 中。它的默认值与 Provider 的 `timeoutMs` 一致；部署方提高 Provider 的界限时必须同时提高它，否则工具调用策略会取消一个 Provider 仍认为在预算内的桥接进程。

## Testing

`packages/finance/finance-local/tests/finance-local.spec.ts` 覆盖 Provider 的配置校验、以录制式 spawn 为边界的进程边界、每个工具的参数映射，以及两个入口的释放。`tests/loader-composition.spec.ts` 通过真实 Loader 启动一个仅测试用的 `cordis.yml`，在两个入口、真实本地子进程 Provider 之上运行，只把外部 Python 进程替换为桩，并断言模型可见的结果。`tests/real-analysis.e2e.ts` 在缺少两条路径时自行跳过；具备时则用实时数据为中证 300 打分并合成择时信号。

`packages/preset/agent-presets/tests/shipped-root.spec.ts` 断言金融行指向 `tools` 入口，且预设中没有声明任何 `finance-local` 行，因为该 id 在宿主平面上是活跃的。`packages/client/ui-workbuddy-scenarios/tests/ScenarioTabs.client.spec.tsx` 覆盖两条选择路径——只写起始语与打开预设会话——并分别覆盖空白会话与已运行会话，`tests/scenarios.client.spec.ts` 断言金融是唯一指定预设的子场景、且两种语言的起始语都没有提到被删除的工具。`packages/client/ui-agent-preset/tests/apply.client.spec.ts` 覆盖该启动服务：一次暂存与一次新建会话流程，并由 chip 报告这次选择。
