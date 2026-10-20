# Agent Note: the 金融服务 scenario becomes a finance agent preset

Status: implemented

English | [中文](2026-09-19-workbuddy-finance-agent.zh.md)

## Problem

The Web GUI's 金融服务 sub-tab seeded a composer draft that named seven analysis tools and told the model to act as an institutional analyst. Nothing behind the pick mounted those tools for that session: the capability's schemas were registered on the host plane, so every session in the process saw them, and the sub-tab itself only wrote text. Two of the seven tools also reached outside the harness's own data path — one read a Dojo sector snapshot whose newest trade date was `2026-08-21`, and nothing in the repository refreshed it, so a month-old sector table would have been presented as current analysis.

Each scenario sub-tab is meant to become its own agent, and 金融服务 is the first, so the pick has to compose a session rather than decorate the one it is made from.

## Decision

`packages/preset/agent-presets/presets/finance` is a shipped agent preset. It runs two rows: a `persona` whose prefix states the analyst identity and whose suffix carries the distilled tool protocol, and `finance-tools`, which names `@deepseek-ai/dsh-finance-local/tools`. A session composed from it — every session that picks 金融服务 — sees exactly five tool schemas and the protocol in its system prompt, and no other session sees either.

The capability keeps only the StockMarket-backed tools: `market_data_refresh`, `csi300_analysis`, `csi2000_analysis`, `market_timing_signal`, and `macro_snapshot`. The Dojo dependency is removed rather than configured — the `sector_theme_query` tool, `python/dojo_sector.py`, the `dojoPython` and `dojoDataDir` `Config` fields, the bridge's `sector_query` operation, and every test that exercised them. The satellite `opportunity_radar` tool is removed with them: it is StockMarket-backed, but it is a position-taking workflow that writes its own holding-state file, and this phase is an analysis agent with no execution or holding surface.

### Two entries, two owners

`@deepseek-ai/dsh-finance-local` now has a root entry and a `tools` entry. The root entry is the host half — the `ctx.finance` Service Definition and the Python-backed provider, whose `stockMarketPython` and `stockMarketRoot` are required `Config` fields. The `tools` entry is the model-facing half, and the preset mounts it over the host provider.

The split is forced by where configuration can live, not by taste. A preset file is an input the roster mounts directly through `Include`; no profile or bundle patch layer reaches it. The external project's paths therefore cannot come from a deployment's `cordis.patch.yml` if the provider sits in a preset, and putting literal paths in a shipped preset would hardcode one machine into the repository. The provider row stays on the host plane where the profile patch already overrides it with literal paths; the preset mounts the consumer, which needs no machine-specific field, and the tool schemas become the agent's rather than the host's. `verify-cordis-config` enforces the same one-plane rule from the other side: a preset row repeating an active host row id is refused.

### The protocol

The source was DojoAgents' mandatory tool-calling protocol — 21,526 characters, 340 lines, and 33 tools, most of it portfolio workflows, theme screening, and `screen_market_stocks` routing. The preset's persona suffix keeps what transfers to this composition: the analyst identity, one-path-per-message routing over the five tools that exist, the rule that the analysis tools already run the project's incremental fetch so `market_data_refresh` is only for an explicit refresh, the ordering rule that `market_timing_signal` is the composed stance rather than a reason to read both index scores again, and the mandatory freshness disclosure — name each document's `as_of` date and report every `warnings` entry as a limitation, because a warning means a panel is missing rather than zero. It also states the scope boundary: no single-stock, sector, portfolio, or execution surface, and no substituting recollection for a tool fact.

The result is about 2,000 characters in the persona suffix. Everything the composition cannot act on — portfolio writes, batch ticker resolution, taxonomy id handling, session-file saving — is gone rather than reworded.

### The pick opens a session

`packages/client/ui-workbuddy-scenarios` gained a `presetId` on a sub-scenario: naming one declares that the pick stands for a capability, and the finance sub-scenario is the only one that names it. A pick that names a preset opens a session composed from it through a new `agentPresetLaunch` client service provided by `packages/client/ui-agent-preset`. That service stages the preset on the hero chip's own controller and starts the New Session flow, so the flow's existing reuse-or-create rule decides which session takes the choice.

Only an empty session may switch preset: the Host refuses `agent-presets/select` once a session has produced a turn. The service therefore never tries to retarget the current session. A blank session in the target workspace is what the flow reuses, so the sub-scenario's starter is seeded into that composer and the user keeps looking at the same input; a session that has already run keeps its composition, the flow creates a fresh one, and the user types there. The chip announces the preset either way, because the pick was made somewhere else.

The starter in `office.finance.template` was reconciled with both locales: it no longer names any tool, and it is now a short question — what the user wants to know — rather than a restatement of the routing rules the preset's prompt already carries.

## Alternatives considered

**Keep the Dojo tools with a scheduled refresh.** Rejected: nothing in this repository refreshes that snapshot, so the refresh path would have to be built here — a second external project's pipeline, its credentials, and its failure modes — to serve a sector surface the first phase does not need. The snapshot's own lag (`window_end` and `latest_trade_date_by_market` in its `manifest.json` name `2026-08-21`) is a correctness defect in what would have been presented as current analysis, not a configuration gap that a schedule closes.

**Delegate to the DojoAgents project as a subagent.** Rejected: that project's CLI runs its own model loop over its own tools, so a delegation would put a second model between the user and the answer, spend tokens re-deriving data this harness can fetch directly, and make the reply depend on that project's prompt stack instead of on this preset. The capability seam already spawns the project's own analysis functions, which is the part that is worth reusing.

**Keep the sub-tab as a prompt template.** Rejected: a draft that names tools does not mount them. The session it decorates would still be the coding agent with a finance-shaped prompt, the tool schemas would still be visible to every other session, and a tool the draft named that the deployment had not mounted would be a claim the composition cannot honour. The scenario chips exist to select a capability, so the pick has to reach the session's composition.

**Mount the whole plugin from the preset.** Rejected: the provider's config is exactly the machine-specific part, and no patch layer reaches a preset file. The choices were literal paths in shipped source, an environment variable every deployment must export before the provider can load, or the plane split this note records. The first two trade a documented deployment interface for a hardcoded or ambient one.

**Paste the source protocol into the persona.** Rejected: 21,526 characters for 33 tools, 28 of which this composition does not mount. The routing table's own rule — choose one path per message — cannot be followed for tools the agent does not have, and the unusable portion would be re-sent on every request.

## Consequences

The finance agent's catalog is exactly five schemas, and they belong to sessions composed from the preset rather than to the process. A deployment that mounts no `ctx.finance` provider cannot compose the preset: `finance-tools` waits for the service, and the mount is refused with the row named. The shipped Web bundle keeps the provider row disabled until a deployment names the project, so a stock deployment that picks 金融服务 is refused rather than started with a partial agent.

The Dojo sector and theme capability is deliberately deferred. **It must not be re-added without a refresh path**: a snapshot with no writer in this repository is a data source whose age the harness cannot state, and the tool contract requires stating it.

Removing the host-plane tool registration means the tools no longer appear in a session that runs no preset. A deployment that relied on them reaches them by composing this preset, copying it, or listing `@deepseek-ai/dsh-finance-local/tools` in its own preset.

The generated configuration catalog covers a package's root entry, so the `tools` entry's own `timeoutMs` field is documented in the package README instead. Its default matches the provider's `timeoutMs`, and a deployment that raises the provider's bound must raise this one too, or the tool-call policy cancels a bridge process the provider still considers within budget.

## Testing

`packages/finance/finance-local/tests/finance-local.spec.ts` covers the provider's config validation, the process boundary over a recorded spawn, every tool's argument mapping, and the disposal of both entries. `tests/loader-composition.spec.ts` boots a test-only `cordis.yml` through the real Loader with both entries over the real local subprocess provider, and asserts the model-visible result with only the external Python process stubbed. `tests/real-analysis.e2e.ts` self-skips without the two paths and, with them, scores the CSI 300 and composes the timing signal from live data.

`packages/preset/agent-presets/tests/shipped-root.spec.ts` asserts the finance row names the tools entry and that no `finance-local` row is declared in a preset, because that id is active on the host plane. `packages/client/ui-workbuddy-scenarios/tests/ScenarioTabs.client.spec.tsx` covers both pick paths — the starter-only draft write and the preset session — for a blank and a committed session, and `tests/scenarios.client.spec.ts` asserts finance is the only sub-scenario naming a preset and that neither locale starter mentions a removed tool. `packages/client/ui-agent-preset/tests/apply.client.spec.ts` covers the launcher: one stage and one New Session flow, with the chip reporting the pick.
