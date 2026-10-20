---
description: "The financial-market analysis capability (ctx.finance): a Python-backed provider over the StockMarket project plus the five model-facing market, index, timing, and macro tools an agent preset mounts."
kind: "package-reference"
---

# @deepseek-ai/dsh-finance-local

English | [中文](README.zh.md)

## Summary

With `dsh-finance-local`, the harness scores the CSI 300 and CSI 2000, composes the monthly ice-point/bubble timing signal, refreshes the market series, and snapshots the macro panel from live A-share, ETF, and macro data — the capability behind the Web GUI's 金融服务 agent preset. Its root entry is the host half: the `ctx.finance` Service Definition and a provider that spawns the deployment's Python project through `ctx.subprocess` for one JSON request and response. Its `tools` entry is the model-facing half, mounted by an agent preset. The deployment owns the project's location; the preset owns whether the model sees the tools.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the root entry in a composition that already loads a subprocess provider: it provides `ctx.finance` and registers nothing else. Mount the `tools` entry where the agent that should see the market tools is composed — inside an agent preset — because the tool schemas belong to that agent rather than to every session on the host.

### When to choose it

Choose it when a deployment needs real A-share and macro analysis rather than a model's own recollection: the tools return the analysis project's own scores, thresholds, and data-source decisions, and they state what they could not fetch instead of guessing. Do not mount it on a host that does not carry the project; the root entry refuses to load without it.

### Requirements

The deployment must supply the **StockMarket** project with its virtual environment: its `data/fetcher.py`, `macro/fetcher.py`, `models/`, and `strategy.py` own data acquisition and scoring.

### Minimal configuration

Both paths are required and validated at load: a missing interpreter, a non-executable interpreter, or a project root without `data/fetcher.py` fails the plugin rather than the later analysis call. They are the only machine-specific fields; every bound has a declared default.

```yaml
- name: '@deepseek-ai/dsh-finance-local'
  config:
    stockMarketPython: /path/to/StockMarket/.venv/bin/python
    stockMarketRoot: /path/to/StockMarket
```

| Field | Default | Meaning |
|---|---|---|
| `stockMarketPython` | required | StockMarket virtual-environment interpreter |
| `stockMarketRoot` | required | StockMarket project root (the bridge's import root) |
| `timeoutMs` | `180000` | Wall-clock bound for one bridge invocation |
| `maxDocumentBytes` | `8388608` | In-memory cap on one response; a longer response fails the call |
| `maxStderrBytes` | `65536` | Captured-stderr cap, used only for failure detail |
| `graceMs` | `5000` | Termination and drain grace for the child process |

The `tools` entry takes one field. Its budget must not be shorter than the provider's `timeoutMs`, or the tool-call policy would cancel a bridge process the provider still considers within budget:

| Field | Default | Meaning |
|---|---|---|
| `timeoutMs` | `180000` | Cooperative tool-call budget attached to every finance tool |

```yaml
- name: '@deepseek-ai/dsh-finance-local/tools'
```

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-finance-local) is the exhaustive source for every accepted field and its JSDoc. It covers a package's root entry, so the `tools` entry's own field is documented here.

### The tools

| Tool | Returns |
|---|---|
| `market_data_refresh` | Incremental refresh of the cached index, ETF, and macro series, with each dataset's row count, date span, and cache modification times |
| `csi300_analysis` | Five-dimension CSI 300 score plus the ERP-extreme and macro-bottom dimensions, the latest close, the PE percentile, and the ice-point verdict |
| `csi2000_analysis` | CSI 2000 score plus the three-channel buy signal, its position size, and the channel detail |
| `market_timing_signal` | The composed monthly signal: ice-point flags, per-index sell or recovery legs with reasons, actions, and position advice |
| `macro_snapshot` | The latest aligned macro row and recent history, plus the CSI 300 valuation and the 10-year treasury yield |

Every analysis tool runs the documented incremental pre-step first (`fetch_all_data`/`fetch_all_macro` with `force=False`), so a cache written today is reused and only stale series are downloaded. `market_data_refresh` exists to make that step explicit before a first analysis.

### Failures and recovery

The provider validates the bridge's JSON response at the process boundary. A non-zero exit reports the captured stderr; a malformed or failed response rejects; a response longer than `maxDocumentBytes` fails rather than truncating; the configured `timeoutMs` terminates a runaway child; the caller's `exec.signal` terminates it on cancellation. The tool layer turns every rejection into the model-visible `Error: <message>`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the plugin; the observable behavior is fully covered in [Use this package](#use-this-package).

### Capability seam roles

The package holds all three roles: `src/service.ts` is the Service Definition (`ctx.finance`, one bounded `invoke`), `src/index.ts` registers the Python-backed provider, and `src/tools.ts` is the Consumer that owns the schemas, argument mapping, and presentation. The consumer is a separate entry rather than a second row of the provider's because the two answer to different owners: the deployment names the external project, while the agent's preset chooses the tools. Nothing reads the service methods that is not a tool, so the seam's Provider and Consumer share one version.

### Process model

Each invocation is one short-lived interpreter process, not a service: the provider spawns `[python, python/finance_bridge.py]` through `ctx.subprocess`, writes `{"operation", "arguments"}` on stdin, and reads one JSON object from stdout. The bridge adds the configured project root to `sys.path` and runs under that interpreter from that directory. `python/finance_bridge.py` is a dispatcher only — it imports the analysis project's own functions and encodes their results.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Root entry: the capability's config schema, path validation, and provider registration |
| [`src/service.ts`](src/service.ts) | The `FinanceRuntime` Service Definition and the invocation vocabulary |
| [`src/types.ts`](src/types.ts) | Operations, per-operation arguments, and the outcome document |
| [`src/provider.ts`](src/provider.ts) | Process-per-invocation provider, response decoding, bounds, cancellation |
| [`src/tools.ts`](src/tools.ts) | The `tools` entry: the five model-facing tools, their JSON presentation, and their own mount over `ctx.finance` |
| [`python/finance_bridge.py`](python/finance_bridge.py) | stdin/stdout JSON dispatcher over the analysis project |
| — | No runtime invariant companion is published; the package owns no independently observable relation beyond the seam contract, and its bounds are enforced in the provider. |

### Read path

An invocation spawns one process with bounded collected stdout and stderr, and waits for exit. Success decodes the bridge's `{"ok": true, "document", "warnings"}` object; the consumer appends `warnings` to the canonical value and renders the document as JSON so no dimension detail is lost. Every branch that cannot produce a complete document throws, so a partial document never reaches the model.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the seam vocabulary to the compositions that mount this plugin.

- [dsh-subprocess](../../subprocess/subprocess/README.md) — the subprocess seam this provider spawns through.
- [dsh-tools](../../core/tools/README.md) — the tool registry and execution pipeline the consumer registers into.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-finance-local) — every accepted root-entry config field and its source declaration.
- [Financial-analysis capability decision](../../../.agents/notes/implemented/feature/2026-09-17-finance-local-python-bridge.md) — why the capability drives an external project instead of reimplementing it.

-----

<a id="model-experience"></a>
## Model Experience

### Model-facing tools

#### What the model sees

The model sees the five schemas above, and only in a session composed from a preset that mounts the `tools` entry; `market_data_refresh` carries its optional `force` argument. Data-source paths, interpreter, bounds, and the bridge protocol are not model-visible.

#### Token effect

Fixed schema cost per request while the tools entry is mounted on the agent. Unmounting it in the preset is the way to remove the schemas.

#### KV Cache effect

Prefix-stable for an agent that composes the entry once, which is what the preset does before its first request.

### Tool results

#### What the model sees

A successful call returns an optional `Data warnings:` bullet list followed by the bridge's complete documented JSON object in a ```json fence. For example a CSI 300 call returns `index`, `as_of`, `close`, `pe_percentile`, `ice_point`, `ice_point_threshold`, and the nested `score` object with its per-dimension detail.

#### Token effect

Data-dependent and resent until compaction. The warnings list carries only unavailable or degraded data sources, and the document is bounded by `maxDocumentBytes` at the process boundary.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Tool failure

#### What the model sees

Every rejection becomes exactly `Error: <message>`: a non-zero bridge exit with its captured stderr, the bridge's own error detail, a malformed response, the byte bound, the configured timeout, or caller cancellation.

#### Token effect

Only the retained error result adds tokens.

#### KV Cache effect

Append-only; the error follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the capability is unavailable or a poor fit. They are current package constraints.

- **A cold analysis call can take minutes.** The analysis project refetches stale series on the documented incremental schedule, so the first call of a day may spend a minute or more in its own data pipelines before scoring. `timeoutMs` bounds it, and the deployment controls it.
- **The capability and the tools have different owners, so the tools entry needs the host provider.** A deployment that mounts no `ctx.finance` leaves the tools entry waiting for it, and a session composed from a preset that mounts the entry is refused rather than started with a partial composition. The shipped Web bundle keeps the provider row disabled until the deployment names the project.
- **The surface is indexes and the macro panel.** There is no single-stock, sector or theme ranking, satellite-scan, or portfolio tool: those need a maintained data source this package does not drive, and a stale one would present old values as current analysis.
- **The bridge protocol is versioned by its own request/response fields**, not by a schema version: adding an operation is additive, and changing the response envelope is a breaking change for `decodeBridgeResponse`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The four bounds and the two paths are the complete deployment-varying surface; analysis thresholds stay in the external project, so a change there alters the tool documents without touching this package.

</details>
