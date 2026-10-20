# Agent Note: financial-market analysis drives an external Python project

Status: implemented

English | [中文](2026-09-17-finance-local-python-bridge.zh.md)

## Problem

The Web GUI's 金融服务 scenario existed as a prompt starter over a financial-analysis persona, but the harness had no tool that could produce a real market read. A working Python project already owned that analysis on this machine: StockMarket, whose `data/`, `macro/`, `models/`, and `strategy.py` hold A-share index, ETF, valuation, bond-yield, and macro acquisition plus the CSI 300/CSI 2000 scoring and the monthly ice-point/bubble timing strategy. The scenario therefore promised analysis the model could only improvise.

The change had to give the model real data without reimplementing that project, without asking a user to start or supervise a service, and without weakening the harness's failure and bound guarantees. It also had to arm the 金融服务 scenario itself, because a tool the model never reaches is not a capability.

## Decision

`packages/finance/finance-local` (`@deepseek-ai/dsh-finance-local`) is the financial-analysis capability. It carries all three capability-seam roles: `src/service.ts` is the Service Definition (`ctx.finance`, one bounded `invoke(invocation, signal)`), the package's root entry in `src/index.ts` is the provider, and the `tools` entry in `src/tools.ts` is the consumer that owns the five model-facing schemas, argument mapping, and JSON presentation.

The provider spawns one short-lived interpreter process per invocation through `ctx.subprocess`, writes `{"operation", "arguments"}` on stdin, and reads one JSON response object from stdout. `python/finance_bridge.py` is a dispatcher: it imports the analysis project's own functions, runs them, and encodes their results. Each analysis operation runs the documented incremental pre-step first — `fetch_all_data(force=False)` and `fetch_all_macro(force=False)`, then the CSI 2000 index patch — so a cache written today is reused and only stale series are downloaded. An explicit `market_data_refresh` tool makes that step callable on its own.

The two deployment paths (`stockMarketPython`, `stockMarketRoot`) are required `Config` fields validated in the root entry's `apply`: a missing or non-executable interpreter, or a project root without `data/fetcher.py`, fails plugin loading. `timeoutMs`, `maxDocumentBytes`, `maxStderrBytes`, and `graceMs` are bounded `Config` fields with declared defaults, and the `tools` entry carries its own per-call `timeoutMs`. A response longer than `maxDocumentBytes` fails the call rather than being truncated, and the decoder validates the response object at the process boundary.

The root entry is mounted on the Web host plane in `packages/bundle/web-app/cordis.patch.yml`, disabled unless `DSH_FINANCE_STOCK_MARKET_ROOT` is set, with `!!js` expressions reading the two paths from the environment; a deployment with literal machine paths overrides the row in its profile patch. The `tools` entry is mounted by an agent preset instead, so the five schemas and the analysis instructions belong to the agent a user picks. [The 金融服务 agent preset](2026-09-19-workbuddy-finance-agent.md) owns that composition, the removal of the Dojo sector surface, and the scenario rewire.

## Consequences

The capability is only as available as the external project and its virtual environment. A machine without it keeps a disabled row and no tools; a machine with it can reach real analysis, but every result depends on that project's network pipelines, its cache freshness rules, and its own state files. Because the provider is a host row and the tools entry is a preset row, the two can be composed separately: a deployment that mounts no provider cannot compose a preset that mounts the consumer.

A cold analysis call can take minutes because the analysis project refetches stale series on its own schedule; `timeoutMs` defaults to three minutes and is deployment-configurable. Mounting the tools entry exposes five schemas to the agents whose presets name it, and the preset's own prompt is what makes a model reach for them.

The plugin owns no analysis thresholds. When the project changes a scoring dimension, the tool's `score.details` object changes with it and no harness code needs updating; the model-facing documents are opaque JSON in the seam and are stated only through the tool schemas.

## Alternatives considered

**A pure-TypeScript reimplementation.** Rejected: it would clone five-dimension scoring, threshold calibration, backtested channel logic, and multi-source redundancy into a second implementation that immediately drifts from the project the user actually trusts. The project is the source of truth and stays so.

**An MCP server.** Rejected: it would make a second process topology and a second tool-registration path for a capability the harness already models as `ctx.tools` plus a service seam, and it would put the analysis behind a server lifecycle the scenario must discover rather than behind configuration the deployment already owns.

**A long-running analysis service.** Rejected: the project exposes plain functions, not a service protocol, and a resident process adds startup, health, port, and teardown obligations for work that is naturally one batch call. The chosen shape spawns on demand and holds nothing between calls.

**The subagent-provider route.** Rejected: DojoAgents' own CLI runs a full model loop over its tools, so delegating to it would put a second model between the user and the answer, spend tokens on a re-derivation of data the harness can fetch directly, and make results depend on that project's prompt stack rather than on this harness's tool contract. The project's analysis functions are reached directly instead.

**Three packages for the three seam roles.** Rejected for now: `packages/AGENTS.md` splits a seam only when its roles evolve independently. There is one provider, the consumer reads nothing the definition does not state, and all three ship as one deployment unit, so a definition package and a consumer package would add manifests, READMEs, and registrations without an independent owner. The consumer is a second *entry* rather than a second package for the plane reason the preset note records.

## Testing

`packages/finance/finance-local/tests/finance-local.spec.ts` covers config validation, the process boundary over a recorded spawn, every tool's argument mapping, and the disposal of both entries. `tests/loader-composition.spec.ts` boots a test-only `cordis.yml` through the real Loader over the real local subprocess provider and asserts the model-visible result, mocking only the external Python process with a stub interpreter. `tests/real-analysis.e2e.ts` self-skips without the two paths and, with them, runs the real bridge through the Loader for CSI 300 scoring and the composed timing signal.
