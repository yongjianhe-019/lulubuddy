#!/usr/bin/env python3
"""JSON bridge between the DSH finance capability and the StockMarket project.

One invocation reads one request object from stdin, runs one named operation, and
writes exactly one response object to stdout. The bridge owns no analysis: it
imports the StockMarket modules for A-share/ETF/macro operations and encodes the
result as lossless JSON. Everything the imported modules print on stdout is
diverted to stderr so stdout carries only the response object.

Request  (stdin, one JSON object):
    {"operation": "<name>", "arguments": {<operation arguments>}}

Response (stdout, one JSON object):
    {"ok": true,  "operation": "<name>", "document": {...}, "warnings": [...], "charts": {...}}
    {"ok": false, "operation": "<name>", "error": "<message>"}

``document`` and ``warnings`` are model-facing. ``charts`` is not: it carries the
bounded numeric series a UI draws (daily bars, monthly valuation and equity-risk
premium trends), and the consumer projects it into the tool result's
presentation metadata. It never enters the model's context, so it can hold the
history the scored document deliberately summarizes away.

The project root comes from the environment, never from a default:
    DSH_FINANCE_STOCK_MARKET_ROOT  StockMarket project root (the import root)
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import traceback
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable

STOCK_MARKET_ROOT_ENV = "DSH_FINANCE_STOCK_MARKET_ROOT"

# Importing the StockMarket package rewrites the shared `requests.Session`
# defaults and probes the network; it must happen only after the request is
# validated so a malformed request never pays that cost.
_IMPORTED = False


def _jsonable(value: Any) -> Any:
    """Convert one Python/NumPy/pandas value into a lossless JSON value.

    NaN and infinity become null because JSON has no representation for them,
    and a reviewer reading the document cannot act on a null the same way they
    would act on a number, so ``None`` is the honest encoding of "no value".
    """
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(item) for item in value]
    # pandas Timestamp/NaT, numpy scalars, Decimals, and any type exposing a
    # scalar conversion. `item()` is the pandas/NumPy protocol for the Python
    # scalar behind one cell, and running the result back through this function
    # handles Timestamp (which is a datetime) and NaT (which becomes None).
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return _jsonable(item())
        except (TypeError, ValueError):
            pass
    # pandas NA-family singletons and anything else with no JSON form.
    return None


def _require_dir(name: str, raw: str | None) -> Path:
    """Resolve one required directory environment variable or fail loud."""
    if raw is None or raw.strip() == "":
        raise RuntimeError(f"{name} is not set; configure the finance capability with it")
    path = Path(raw).expanduser()
    if not path.is_dir():
        raise RuntimeError(f"{name} does not name a directory: {path}")
    return path

def _stock_market_root() -> Path:
    """Import root of the StockMarket project, validated against its data module."""
    root = _require_dir(STOCK_MARKET_ROOT_ENV, os.environ.get(STOCK_MARKET_ROOT_ENV))
    if not (root / "data" / "fetcher.py").is_file():
        raise RuntimeError(f"{STOCK_MARKET_ROOT_ENV} has no data/fetcher.py: {root}")
    return root


def _ensure_stock_market_imports() -> None:
    """Put the StockMarket project root on ``sys.path`` exactly once."""
    global _IMPORTED
    if not _IMPORTED:
        root = str(_stock_market_root())
        if root not in sys.path:
            sys.path.insert(0, root)
        _IMPORTED = True


def _frame_dates(frame: Any) -> dict[str, Any]:
    """Row count and date span of one DataFrame, absent columns omitted."""
    summary: dict[str, Any] = {"rows": int(len(frame))}
    if "date" in frame.columns and len(frame) > 0:
        dates = frame["date"].dropna()
        if len(dates) > 0:
            summary["first_date"] = _jsonable(dates.iloc[0])
            summary["last_date"] = _jsonable(dates.iloc[-1])
    return summary


def _cache_freshness(directory: Path) -> dict[str, Any]:
    """Modification time of every cached parquet file, newest first.

    The cache file mtime is the only evidence a deterministic bridge can offer
    that an incremental fetch reused a cache instead of refetching.
    """
    files = sorted(directory.glob("*.parquet"))
    entries = [
        {
            "file": path.name,
            "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
        }
        for path in files
    ]
    entries.sort(key=lambda entry: entry["modified"], reverse=True)
    return {"directory": str(directory), "files": entries}


def _market_data(force: bool = False) -> tuple[dict[str, Any], Any]:
    """Run the documented incremental pre-step and return market data plus macro data.

    Mirrors the composition order in the StockMarket dashboard: market data,
    macro data, then the CSI 2000 index patch. A patch that cannot be computed
    from overlapping ETF history degrades the CSI 2000 leg only, so the failure
    is reported as a warning instead of discarding otherwise valid data.
    """
    _ensure_stock_market_imports()
    from data.fetcher import fetch_all_data, patch_csi2000_index
    from macro.fetcher import fetch_all_macro

    data = fetch_all_data(force=force)
    macro = fetch_all_macro(force=force)
    warning = None
    try:
        patch_csi2000_index(data)
    except ValueError as error:
        warning = f"CSI2000 index patch skipped: {error}"
    data["_patch_warning"] = warning
    return data, macro


def _data_warnings(data: dict[str, Any]) -> list[str]:
    """Non-fatal data-source facts worth surfacing to the model."""
    warnings: list[str] = []
    patch_warning = data.get("_patch_warning")
    if patch_warning:
        warnings.append(str(patch_warning))
    if data.get("bond_yield_10y") is None:
        warnings.append("10-year treasury yield unavailable; the equity risk premium dimension is skipped")
    if data.get("csi300_valuation") is None:
        warnings.append("CSI300 valuation unavailable; the valuation dimension is skipped")
    return warnings


# Chart payload contract: a versioned list of named numeric series, each with
# its own date axis. Series ids and column keys are protocol tokens the client
# maps to its own localized labels, so nothing here carries display copy.
CHART_VERSION = 1

# Daily bars in a candlestick series. The scored dimensions read at most 250
# trading days back, so half a year of bars is what a reader needs to see the
# shape the score describes.
CHART_PRICE_BARS = 120

# Monthly points in a valuation or equity-risk-premium trend. This is the
# analysis project's own equity-risk-premium lookback (five years), so the
# percentile line is drawn over exactly the window the score is percentiled in.
CHART_MONTHLY_POINTS = 60


def _short_date(value: Any) -> str:
    """One date axis label as ``YYYY-MM-DD``."""
    text = _jsonable(value)
    return text[:10] if isinstance(text, str) else ""


def _chart_columns(frame: Any, columns: list[str]) -> dict[str, Any]:
    """One column per requested name, in the frame's own row order."""
    return {
        column: [_jsonable(item) for item in frame[column]]
        for column in columns
        if column in frame.columns
    }


def _price_series(daily: Any, series_id: str = "price") -> dict[str, Any]:
    """The most recent daily bars of one index, oldest first.

    The id is a parameter because one result may carry several indexes' bars
    (the composed timing signal draws both legs), and each needs its own series
    identity for a card to address it.
    """
    frame = daily.tail(CHART_PRICE_BARS)
    return {
        "id": series_id,
        "kind": "candlestick",
        "dates": [_short_date(item) for item in frame["date"]],
        "columns": _chart_columns(frame, ["open", "high", "low", "close", "volume"]),
    }


def _valuation_series(valuation: Any) -> dict[str, Any] | None:
    """The most recent monthly valuation points, oldest first."""
    if valuation is None or len(valuation) == 0:
        return None
    frame = valuation.tail(CHART_MONTHLY_POINTS)
    columns = _chart_columns(frame, ["pe", "pb"])
    if not columns:
        return None
    return {
        "id": "valuation",
        "kind": "line",
        "dates": [_short_date(item) for item in frame["date"]],
        "columns": columns,
    }


def _erp_frame(daily: Any, valuation: Any, bond_yield_df: Any) -> Any | None:
    """The merged monthly series the equity-risk-premium dimension scores.

    The valuation month ends joined to the trading days, the 10-year yield
    forward-filled, and the premium as ``100 / PE - yield``. Both the drawn
    premium trend and the percentile bars read this one frame, so neither can
    disagree with the scored dimension.
    """
    if valuation is None or len(valuation) == 0 or bond_yield_df is None or len(bond_yield_df) == 0:
        return None
    merged = daily[["date", "close"]].merge(valuation[["date", "pe"]], on="date", how="inner")
    merged = merged.merge(bond_yield_df[["date", "yield_10y"]], on="date", how="left")
    merged["yield_10y"] = merged["yield_10y"].ffill()
    merged = merged[merged["pe"] > 0]
    merged["erp"] = (1 / merged["pe"] * 100) - merged["yield_10y"]
    merged = merged.dropna(subset=["erp"])
    return merged if len(merged) > 0 else None


def _erp_series(daily: Any, valuation: Any, bond_yield_df: Any) -> dict[str, Any] | None:
    """The equity-risk-premium level and its five-year percentile, by month."""
    from models.csi300 import LOOKBACK_YEARS, _window_pct

    merged = _erp_frame(daily, valuation, bond_yield_df)
    if merged is None:
        return None
    frame = merged.tail(CHART_MONTHLY_POINTS)
    columns = _chart_columns(frame, ["erp"])
    columns["erp_percentile"] = [
        _jsonable(_window_pct(merged, "erp", end, LOOKBACK_YEARS)) for end in frame["date"]
    ]
    return {
        "id": "erp",
        "kind": "line",
        "dates": [_short_date(item) for item in frame["date"]],
        "columns": columns,
    }


def _percentile_series(valuation: Any, as_of: Any) -> dict[str, Any] | None:
    """The valuation percentiles the score reads, as bars.

    All three are windowed over the analysis project's own five years and are
    read the same way — a lower percentile is cheaper — so one 0-100 axis and
    one boundary are honest across them. The equity-risk-premium percentile is
    deliberately absent: the project scores it in the opposite direction (higher
    is cheaper), and its own trend panel already draws it.
    """
    from models.csi300 import LOOKBACK_YEARS, _window_pct

    if valuation is None or len(valuation) == 0:
        return None
    pe_pct = _window_pct(valuation, "pe", as_of, LOOKBACK_YEARS)
    pb_pct = _window_pct(valuation, "pb", as_of, LOOKBACK_YEARS)
    if pe_pct is None or pb_pct is None:
        # The valuation dimension itself degrades when either window is short,
        # so a partial bar set would report a reading the score never used.
        return None
    return {
        "id": "percentiles",
        "kind": "bar",
        "categories": ["pe_percentile", "pb_percentile", "mean_percentile"],
        "columns": {"value": [pe_pct, pb_pct, (pe_pct + pb_pct) / 2]},
        "reference": 0.5,
    }


def _comparison_series(frames: dict[str, Any]) -> dict[str, Any] | None:
    """The recent closing levels of several indexes on one shared date axis.

    The frames are joined on their trading dates rather than concatenated, so
    every drawn point carries all indexes and a gap can never be mistaken for a
    real level.
    """
    merged = None
    for key, frame in frames.items():
        if frame is None or len(frame) == 0:
            continue
        part = frame[["date", "close"]].tail(CHART_PRICE_BARS).rename(columns={"close": key})
        merged = part if merged is None else merged.merge(part, on="date", how="inner")
    if merged is None or len(merged) == 0:
        return None
    return {
        "id": "index_comparison",
        "kind": "line",
        "dates": [_short_date(item) for item in merged["date"]],
        "columns": _chart_columns(merged, list(frames)),
    }


def _charts(series: list[dict[str, Any] | None]) -> dict[str, Any]:
    """The chart payload: a version plus every series a reader can actually draw."""
    present = [item for item in series if item is not None]
    return {"version": CHART_VERSION, "series": present}


def op_refresh(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Incrementally refresh every market, ETF, and macro cache the analysis reads."""
    force = bool(arguments.get("force", False))
    data, macro = _market_data(force=force)
    stock_root = _stock_market_root()
    datasets = {
        key: _frame_dates(frame)
        for key, frame in data.items()
        if hasattr(frame, "columns")
    }
    document = {
        "force": force,
        "datasets": datasets,
        "macro": _frame_dates(macro),
        "cache": _cache_freshness(stock_root / "data"),
    }
    return document, _data_warnings(data), _charts([])


def op_csi300_analysis(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Score the CSI 300 on the five scored dimensions plus the two bonus dimensions."""
    del arguments
    from macro.sell_signal import is_ice_point
    from models.csi300 import compute_csi300_score
    from strategy import _get_pe_pct

    data, macro = _market_data()
    score = compute_csi300_score(
        daily=data["csi300_daily"],
        valuation=data.get("csi300_valuation"),
        bond_yield_df=data["bond_yield_10y"],
        macro=macro,
    )
    pe_pct = _get_pe_pct(data.get("csi300_valuation"), score["signal_date"])
    document = {
        "index": "沪深300",
        "as_of": _jsonable(score["signal_date"]),
        "close": _jsonable(score["price"]),
        "pe_percentile": _jsonable(pe_pct),
        "ice_point": bool(is_ice_point(score["total_score"], pe_pct)),
        "ice_point_threshold": 50.0,
        "score": _jsonable(score),
    }
    charts = _charts([
        _price_series(data["csi300_daily"]),
        _valuation_series(data.get("csi300_valuation")),
        _erp_series(data["csi300_daily"], data.get("csi300_valuation"), data.get("bond_yield_10y")),
        _percentile_series(data.get("csi300_valuation"), score["signal_date"]),
    ])
    return document, _data_warnings(data), charts


def op_csi2000_analysis(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Score the CSI 2000 and evaluate the three-channel buy signal."""
    del arguments
    from models.csi2000 import csi2000_buy_channel, compute_csi2000_score

    data, macro = _market_data()
    score = compute_csi2000_score(
        daily=data["csi2000_daily"],
        valuation=data.get("csi2000_valuation"),
        csi300_daily=data["csi300_daily"],
        macro=macro,
    )
    channel = csi2000_buy_channel(
        daily=data["csi2000_daily"],
        csi300_daily=data["csi300_daily"],
        macro=macro,
        latest_date=score["signal_date"],
        current_score=score["total_score"],
    )
    document = {
        "index": "中证2000",
        "as_of": _jsonable(score["signal_date"]),
        "close": _jsonable(score["price"]),
        "score": _jsonable(score),
        "buy_channel": _jsonable(channel),
    }
    charts = _charts([
        _price_series(data["csi2000_daily"]),
        _valuation_series(data.get("csi2000_valuation")),
    ])
    return document, _data_warnings(data), charts


def op_market_signal(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Compose the monthly timing signal: ice-point buys plus bubble or recovery sells."""
    del arguments
    from strategy import generate_signal

    data, macro = _market_data()
    signal = generate_signal(data, macro)
    document = {"signal": _jsonable(signal)}
    charts = _charts([
        # Both legs' own bars, so the card can show the price action each leg's
        # action describes, then the shared axis that compares them.
        _price_series(data["csi300_daily"], "price_csi300"),
        _price_series(data["csi2000_daily"], "price_csi2000"),
        _comparison_series({"csi300": data["csi300_daily"], "csi2000": data["csi2000_daily"]}),
    ])
    return document, _data_warnings(data), charts


def op_macro_snapshot(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Return the latest macro row, its recent history, and the valuation snapshot."""
    del arguments
    from data.fetcher import fetch_bond_yield_10y, fetch_valuation
    from macro.fetcher import fetch_all_macro

    _ensure_stock_market_imports()
    macro = fetch_all_macro(force=False)
    warnings: list[str] = []
    try:
        valuation = fetch_valuation("000300", "CSI300")
    except Exception as error:  # noqa: BLE001 - the valuation panel is optional context
        valuation = None
        warnings.append(f"CSI300 valuation unavailable: {error}")
    try:
        bond = fetch_bond_yield_10y()
    except Exception as error:  # noqa: BLE001 - the yield panel is optional context
        bond = None
        warnings.append(f"10-year treasury yield unavailable: {error}")

    columns = [column for column in macro.columns if column != "date"]
    latest = {}
    if len(macro) > 0:
        last_row = macro.iloc[-1]
        latest = {col: _jsonable(last_row[col]) for col in columns if _jsonable(last_row[col]) is not None}

    document = {
        "as_of": _jsonable(macro["date"].iloc[-1]) if len(macro) > 0 else None,
        "latest": latest,
        "recent": _jsonable(macro.tail(6)[["date", *columns]].to_dict(orient="records")),
        "valuation": _jsonable(valuation.tail(1)[["date", "pe", "pb"]].to_dict(orient="records"))
        if valuation is not None and len(valuation) > 0
        else [],
        "bond_yield_10y": _jsonable(bond.tail(1)[["date", "yield_10y"]].to_dict(orient="records"))
        if bond is not None and len(bond) > 0
        else [],
    }
    return document, warnings, _charts([])


def _latest_dragon(asof: str | None) -> tuple[dict[str, Any], list[str]]:
    """Read the newest dragon-head daily review, optionally for one date."""
    import json as _json
    daily_dir = Path(_stock_market_root()) / "dragon_head" / "data" / "daily"
    if asof:
        path = daily_dir / f"{asof}.json"
        if not path.is_file():
            return {"available": False, "reason": f"no dragon review for {asof}"}, []
    else:
        files = sorted(daily_dir.glob("*.json"))
        if not files:
            return {"available": False, "reason": "no dragon review files"}, []
        path = files[-1]
    try:
        payload = _json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 - a damaged daily file is reported, not hidden
        return {"available": False, "reason": f"unreadable dragon review: {error}"}, []
    return {"available": True, "file": str(path), **_jsonable(payload)}, []




def _clip(text: str, limit: int) -> str:
    """Trim one Markdown block to a readable excerpt without cutting mid-word."""
    clean = text.strip()
    if len(clean) <= limit:
        return clean
    return clean[: max(0, limit - 1)].rstrip() + "…"


def _sections(text: str, marker: str) -> list[tuple[str, str]]:
    """Split Markdown at one heading level, ignoring fenced code blocks."""
    pattern = re.compile(r"^" + re.escape(marker) + r"\s+(.+?)\s*$")
    sections: list[tuple[str, str]] = []
    heading: str | None = None
    body: list[str] = []
    fenced = False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            fenced = not fenced
            if heading is not None:
                body.append(line)
            continue
        match = None if fenced else pattern.match(line)
        if match is not None:
            if heading is not None:
                sections.append((heading, "\n".join(body).strip()))
            heading = match.group(1).strip()
            body = []
            continue
        if heading is not None:
            body.append(line)
    if heading is not None:
        sections.append((heading, "\n".join(body).strip()))
    return sections


def _pick_sections(sections: list[tuple[str, str]], *keywords: str) -> str:
    """Join every section whose heading contains one of the keywords."""
    picked = [body for heading, body in sections if any(word in heading for word in keywords)]
    return "\n\n".join(part for part in picked if part).strip()


def _dragon_lines(text: str) -> str:
    """Keep the performance lines from a review: T+1/T+3 samples and win rates."""
    performance: list[str] = []
    context: list[str] = []
    for line in text.splitlines():
        clean = line.strip().lstrip("-* ").strip()
        if not clean:
            continue
        if any(word in clean for word in ("T+1", "T+3", "T+5", "全样本", "可买", "胜率", "均值")):
            performance.append(clean)
        elif "龙头" in clean and ("跟踪" in clean or "候选" in clean):
            context.append(clean)
    return _clip(_plain("；".join((performance or context)[:5])), 900)


def _journal_entry(kind: str, heading: str, body: str) -> dict[str, Any]:
    """Convert one journal entry into the compact shape the analysis prompt reads."""
    match = re.match(r"(\d{4}-\d{2}-\d{2})", heading)
    date_value = match.group(1) if match is not None else ""
    subs = _sections(body, "###")
    conclusion = _pick_sections(subs, "模型信号", "结论", "信号")
    plan = _pick_sections(subs, "操作计划", "计划")
    review = _pick_sections(subs, "复盘", "实际操作", "成交")
    summary = conclusion or plan or review or body
    return {
        "kind": kind,
        "date": date_value,
        "heading": heading,
        "summary": _clip(summary, 700),
        "conclusion": _clip(conclusion, 1600),
        "plan": _clip(plan, 1400),
        "review": _clip(review, 1400),
        "dragon_tracking": _dragon_lines(body),
        "excerpt": _clip(body, 3000),
    }


def _daily_entry(path: Path) -> dict[str, Any]:
    """Convert one `journal/daily/YYYY-MM-DD.md` report into the compact shape."""
    text = path.read_text(encoding="utf-8")
    sections = _sections(text, "##")
    conclusion = _pick_sections(sections, "结论")
    signals = _pick_sections(sections, "模型信号")
    plan = _pick_sections(sections, "操作计划")
    review = _pick_sections(sections, "实际操作", "次日收盘复盘", "复盘")
    summary = conclusion or signals or review or text
    return {
        "kind": "daily",
        "date": path.stem,
        "heading": path.stem,
        "summary": _clip(summary, 800),
        "conclusion": _clip(conclusion, 1600),
        "signals": _clip(signals, 1600),
        "plan": _clip(plan, 1600),
        "review": _clip(review, 1600),
        "dragon_tracking": _dragon_lines(text),
        "excerpt": _clip(text, 5000),
    }


def _plain(text: str) -> str:
    """Drop Markdown emphasis from compact summaries; keep the words."""
    return text.replace("**", "").replace("__", "").replace("`", "")


def _compact_plan(plan: str) -> str:
    """Turn a Markdown plan table into a few short rows without losing the action."""
    rows: list[str] = []
    for line in plan.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 4 or all(set(cell) <= {"-", ":", " "} for cell in cells):
            continue
        target, action, position = cells[1], cells[2], cells[3]
        if target in ("标的", "target"):
            continue
        rows.append(f"{target} {action} 仓位 {position}")
    return "；".join(rows[:4])


def _compact_review(review: str) -> str:
    """Keep the first two review points, not the whole filled-in report."""
    points: list[str] = []
    for line in review.splitlines():
        clean = line.strip().lstrip("-* ").strip()
        if clean and not clean.startswith("|") and not clean.startswith("量化指标"):
            points.append(clean)
        if len(points) == 2:
            break
    return "；".join(points)


def _dedupe_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the most complete entry for each (kind, date), dropping empty re-appends."""
    best: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in entries:
        key = (str(entry.get("kind") or ""), str(entry.get("date") or ""))
        score = len(str(entry.get("review") or "")) + len(str(entry.get("plan") or "")) + len(str(entry.get("summary") or ""))
        current = best.get(key)
        current_score = -1 if current is None else len(str(current.get("review") or "")) + len(str(current.get("plan") or "")) + len(str(current.get("summary") or ""))
        if score > current_score:
            best[key] = entry
    return list(best.values())


def _journal_markdown(entries: list[dict[str, Any]]) -> str:
    """Render compact journal entries as a readable Markdown appendix."""
    labels = {"core": "核心", "satellite": "卫星", "daily": "日报"}
    blocks: list[str] = []
    for entry in entries:
        date_value = entry.get("date") or "—"
        label = labels.get(str(entry.get("kind")), str(entry.get("kind") or "记录"))
        summary = re.sub(r"\s*-\s+", "；", re.sub(r"\s+", " ", str(entry.get("summary") or "")))
        summary = re.sub(r"[；;]\s*[；;]+", "；", _plain(summary)).replace("。；", "；").replace("；。", "；").strip(" -；")
        lines = [f"### {date_value} · {label}", "", f"- 结论：{_clip(summary, 360) or '—'}"]
        plan = _plain(_compact_plan(str(entry.get("plan") or "")))
        if plan:
            lines.append(f"- 计划：{_clip(plan, 360)}")
        review = _plain(_compact_review(str(entry.get("review") or "")))
        if review:
            lines.append(f"- 复盘：{_clip(review, 360)}")
        dragon = _plain(str(entry.get("dragon_tracking") or ""))
        if dragon:
            lines.append(f"- 龙头跟踪：{_clip(dragon, 500)}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def op_dashboard(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Build the full daily snapshot: core signals, satellite radar, dragon gate, plan."""
    import dashboard
    from data.fetcher import patch_csi2000_index
    from models.opportunity_entry import scan as scan_opp
    from models.opportunity_radar import radar_scan
    from strategy import generate_signal

    data, macro = _market_data(force=bool(arguments.get("force")))
    ratio = patch_csi2000_index(data)
    signal = generate_signal(data, macro)
    opp = scan_opp(data)
    radar = radar_scan()
    snapshot = dashboard.build_snapshot(data, macro, signal, opp, radar)
    report_markdown = dashboard.report.render_markdown(snapshot)
    warnings = _data_warnings(data)
    history: list[dict[str, Any]] = []
    strategy: dict[str, Any] = {}
    if arguments.get("include_history", True):
        history_document, history_warnings, _ = op_journal_recent({"limit": 3, "kind": "all"})
        history = history_document.get("entries") or []
        warnings.extend(history_warnings)
        strategy_document, strategy_warnings = _strategy_progress()
        strategy = {**strategy_document, "entries": (strategy_document.get("entries") or [])[:2]}
        warnings.extend(strategy_warnings)
        if strategy.get("entries") or strategy.get("status"):
            report_markdown += "\n\n## 七、核心迭代\n\n" + _strategy_markdown(strategy, 2)
        if history:
            report_markdown += "\n\n## 八、近期分析对照\n\n" + _journal_markdown(history)
    document = {
        "ratio": _jsonable(ratio),
        **snapshot,
        "report_markdown": report_markdown,
        "history": history,
        "strategy": strategy,
    }
    if arguments.get("record"):
        try:
            jp, mp = dashboard.report.write_daily(snapshot)
            document["record"] = {"journal": str(jp), "machine": str(mp)}
        except Exception as error:  # noqa: BLE001 - recording is optional, analysis still valid
            warnings.append(f"daily record write failed: {error}")
    charts = _charts([
        _price_series(data["csi2000_daily"], "price_csi2000"),
        _comparison_series({"csi300": data["csi300_daily"], "csi2000": data["csi2000_daily"]}),
    ])
    return document, warnings, charts


def op_ice_check(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Answer the one question the trading brief asks before every analysis: is CSI2000 buyable, and what is missing?"""
    from data.fetcher import patch_csi2000_index
    from models.csi2000 import csi2000_buy_channel, compute_csi2000_score

    data, macro = _market_data(force=bool(arguments.get("force")))
    ratio = patch_csi2000_index(data)
    daily = data["csi2000_daily"].sort_values("date").reset_index(drop=True)
    etf = data["etf_159531"].sort_values("date").reset_index(drop=True)
    date_value = daily["date"].iloc[-1]
    px = float(etf["close"].iloc[-1])
    overlap = daily.merge(etf[["date", "close"]].rename(columns={"close": "etf_close"}), on="date", how="inner")
    fx = float((overlap["etf_close"] / overlap["close"]).tail(10).mean()) if not overlap.empty else 1.0
    ma10 = float(daily["close"].tail(10).mean()) * fx
    score = compute_csi2000_score(
        daily=daily,
        valuation=data.get("csi2000_valuation"),
        csi300_daily=data["csi300_daily"],
        macro=macro,
    )
    channel = csi2000_buy_channel(
        daily=daily,
        csi300_daily=data["csi300_daily"],
        macro=macro,
        latest_date=score["signal_date"],
        current_score=score["total_score"],
    )
    detail = channel.get("detail") or {}
    above = detail.get("站回MA10") == "✅"
    r20_pct = channel.get("r20_pct")
    dd250 = channel.get("dd250")
    gaps: list[str] = []
    if not above:
        gaps.append("站回MA10")
    if r20_pct is not None and r20_pct > 0.10:
        gaps.append("r20分位")
    if dd250 is not None and dd250 >= -0.10:
        gaps.append("回撤深度")
    document = {
        "as_of": _jsonable(date_value),
        "etf_close": px,
        "ma10": ma10,
        "distance_to_ma10": px / ma10 - 1 if ma10 else None,
        "ratio": _jsonable(ratio),
        "score": channel.get("score", score.get("total_score")),
        "score_pct": channel.get("score_pct"),
        "r20_pct": r20_pct,
        "dd250": dd250,
        "triggered": channel.get("channel") is not None,
        "channel": channel.get("channel"),
        "position_pct": channel.get("position_pct"),
        "detail": _jsonable(detail),
        "gaps": gaps,
        "check_2000_ice": True,
    }
    return document, _data_warnings(data), _charts([])


def op_opportunity_radar(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Scan the satellite ETF pool for R:R / conditional win-rate / EV opportunities."""
    from models.opportunity_entry import missing_reasons, prep, scan as scan_opp
    from models.opportunity_radar import radar_scan

    data, macro = _market_data(force=bool(arguments.get("force")))
    _ = macro
    opportunities = scan_opp(data)
    radar = radar_scan()
    rows = []
    for entry in opportunities:
        missing = []
        try:
            ma20 = float(prep(data[entry["code"]]).iloc[-1]["ma20"])
            missing = missing_reasons(entry, ma20)
        except Exception:  # noqa: BLE001 - one unreadable series must not hide the others
            pass
        rows.append({**_jsonable(entry), "missing": missing})
    document = {
        "opportunities": rows,
        "watching": _jsonable(radar.get("watching") or []),
        "exits": _jsonable(radar.get("exits") or []),
        "positions": _jsonable(radar.get("positions") or []),
        "factor_status": _jsonable(radar.get("factor_status") or {}),
    }
    return document, _data_warnings(data), _charts([])


def op_dragon_head(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Return the latest post-close dragon-head review and the tracked candidates."""
    document, warnings = _latest_dragon(arguments.get("as_of"))
    track_path = _stock_market_root() / "dragon_head" / "data" / "dragon_track.csv"
    if track_path.is_file():
        try:
            import pandas as pd
            frame = pd.read_csv(track_path)
            document["track"] = _jsonable(frame.tail(20).to_dict(orient="records"))
        except Exception as error:  # noqa: BLE001 - the review remains useful without the ledger
            warnings.append(f"dragon track unavailable: {error}")
    return document, warnings, _charts([])


def op_positions(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Read the human-maintained positions and the satellite radar state."""
    del arguments
    root = _stock_market_root()
    import json as _json
    positions = {}
    for name in ("positions.json", "radar_state.json"):
        path = root / "data" / name
        try:
            positions[name] = _json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:  # noqa: BLE001 - report a missing file, never invent holdings
            positions[name] = {"error": str(error)}
    return {"root": str(root), "files": positions}, [], _charts([])


def op_journal_append(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Append one analysis entry to the core or satellite trade journal."""
    kind = arguments.get("kind", "core")
    entry = str(arguments.get("entry", "")).strip()
    if kind not in ("core", "satellite"):
        raise RuntimeError("journal kind must be core or satellite")
    if not entry:
        raise RuntimeError("journal entry must not be empty")
    path = _stock_market_root() / "journal" / ("trade-journal.md" if kind == "core" else "satellite-trade-journal.md")
    path.parent.mkdir(parents=True, exist_ok=True)
    prefix = f"\n\n## {datetime.now().strftime('%Y-%m-%d %H:%M')} 分析记录\n\n"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(prefix + entry.rstrip() + "\n")
    return {"kind": kind, "path": str(path), "appended": True}, [], _charts([])






def _strategy_progress() -> tuple[dict[str, Any], list[str]]:
    """Read the project's iteration log, newest iteration notes first."""
    path = _stock_market_root() / "strategy" / "00-project-progress.md"
    if not path.is_file():
        return {"available": False, "entries": []}, ["strategy/00-project-progress.md unavailable"]
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as error:  # noqa: BLE001 - the log is context, not a fake signal
        return {"available": False, "entries": []}, [f"strategy progress unreadable: {error}"]
    sections = _sections(text, "##")
    status = next((body for heading, body in sections if "项目状态" in heading), "")
    entries: list[dict[str, Any]] = []
    for heading, body in sections:
        match = re.match(r"(\d{4}-\d{2}-\d{2})\s*(.*)", heading)
        if match is None:
            continue
        flat = re.sub(r"^#{1,6}\s*", "", body, flags=re.MULTILINE)
        flat = re.sub(r"^---+\s*$", "", flat, flags=re.MULTILINE)
        flat = re.sub(r"\s+", " ", flat).strip()
        entries.append({
            "date": match.group(1),
            "title": match.group(2).strip(),
            "summary": _clip(_plain(flat), 1200),
            "excerpt": _clip(body, 3000),
        })
    entries.sort(key=lambda entry: str(entry.get("date") or ""), reverse=True)
    updated = next((line.split(":", 1)[1].strip() for line in text.splitlines() if line.startswith("> 最后更新:")), "")
    return {
        "available": True,
        "updated_at": updated,
        "status": _clip(_plain(status), 1200),
        "entries": entries,
        "path": str(path),
    }, []


def _strategy_markdown(document: dict[str, Any], limit: int) -> str:
    """Render the recent iteration notes as a short, scannable appendix."""
    lines: list[str] = []
    if document.get("updated_at"):
        lines.append(f"最后更新：{document['updated_at']}")
    if document.get("status"):
        lines.append(f"- 当前状态：{document['status']}")
    for entry in (document.get("entries") or [])[:limit]:
        summary = _plain(re.sub(r"\s+", " ", str(entry.get("summary") or ""))).strip()
        lines.append(f"- **{entry.get('date')} · {entry.get('title') or '迭代'}**：{_clip(summary, 260)}")
    return "\n".join(lines)


def op_journal_recent(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Read the most recent core, satellite, and daily analysis records."""
    try:
        limit = max(1, min(20, int(arguments.get("limit", 5))))
    except (TypeError, ValueError) as error:
        raise RuntimeError("journal limit must be an integer") from error
    kind = arguments.get("kind", "all")
    if kind not in ("all", "core", "satellite", "daily"):
        raise RuntimeError("journal kind must be all, core, satellite, or daily")
    include_text = bool(arguments.get("include_text", False))
    root = _stock_market_root()
    entries: list[dict[str, Any]] = []
    warnings: list[str] = []

    if kind in ("all", "core", "satellite"):
        for journal_kind, filename in (("core", "trade-journal.md"), ("satellite", "satellite-trade-journal.md")):
            if kind not in ("all", journal_kind):
                continue
            path = root / "journal" / filename
            if not path.is_file():
                warnings.append(f"{filename} unavailable")
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except Exception as error:  # noqa: BLE001 - one unreadable journal must not hide the rest
                warnings.append(f"{filename} unreadable: {error}")
                continue
            for heading, body in _sections(text, "##"):
                if not re.match(r"\d{4}-\d{2}-\d{2}", heading):
                    continue
                entries.append(_journal_entry(journal_kind, heading, body))

    if kind in ("all", "daily"):
        daily_dir = root / "journal" / "daily"
        if not daily_dir.is_dir():
            warnings.append("journal/daily unavailable")
        else:
            for path in sorted(daily_dir.glob("*.md")):
                try:
                    entries.append(_daily_entry(path))
                except Exception as error:  # noqa: BLE001 - one damaged day must not hide the rest
                    warnings.append(f"{path.name} unreadable: {error}")

    entries = _dedupe_entries(entries)
    entries.sort(key=lambda entry: str(entry.get("date") or ""), reverse=True)
    entries = entries[:limit]
    if not include_text:
        for entry in entries:
            entry.pop("excerpt", None)
    document = {
        "kind": kind,
        "limit": limit,
        "entries": entries,
        "counts": {
            "core": sum(1 for entry in entries if entry.get("kind") == "core"),
            "satellite": sum(1 for entry in entries if entry.get("kind") == "satellite"),
            "daily": sum(1 for entry in entries if entry.get("kind") == "daily"),
        },
        "journal_markdown": _journal_markdown(entries),
    }
    return document, warnings, _charts([])


def op_dragon_history(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Read the latest N dragon-head post-close reviews, newest first."""
    try:
        limit = max(1, min(20, int(arguments.get("limit", 5))))
    except (TypeError, ValueError) as error:
        raise RuntimeError("dragon history limit must be an integer") from error
    as_of = arguments.get("as_of")
    daily_dir = _stock_market_root() / "dragon_head" / "data" / "daily"
    files = sorted(daily_dir.glob("*.json"), reverse=True)
    if as_of:
        files = [path for path in files if path.stem <= str(as_of)]
    warnings: list[str] = []
    entries: list[dict[str, Any]] = []
    for path in files:
        if len(entries) >= limit:
            break
        document, day_warnings = _latest_dragon(path.stem)
        warnings.extend(day_warnings)
        if document.get("available"):
            document["date"] = path.stem
            entries.append(document)
    if not entries and not warnings:
        warnings.append("no dragon daily reviews found")
    track_path = _stock_market_root() / "dragon_head" / "data" / "dragon_track.csv"
    track: list[dict[str, Any]] = []
    if track_path.is_file():
        try:
            import pandas as pd
            track = _jsonable(pd.read_csv(track_path).tail(20).to_dict(orient="records"))
        except Exception as error:  # noqa: BLE001 - history remains useful without the ledger
            warnings.append(f"dragon track unavailable: {error}")
    document = {"entries": entries, "track": track, "limit": limit}
    return document, warnings, _charts([])






def op_dragon_track(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Read the dragon follow-up ledger and compute T+1/T+3/T+5/T+10 stats."""
    try:
        limit = max(1, min(100, int(arguments.get("limit", 20))))
    except (TypeError, ValueError) as error:
        raise RuntimeError("dragon track limit must be an integer") from error
    path = _stock_market_root() / "dragon_head" / "data" / "dragon_track.csv"
    if not path.is_file():
        return {"available": False, "rows": [], "stats": {}}, ["dragon_track.csv unavailable"], _charts([])
    try:
        import pandas as pd
        frame = pd.read_csv(path)
    except Exception as error:  # noqa: BLE001 - a damaged ledger is reported, not hidden
        return {"available": False, "rows": [], "stats": {}}, [f"dragon track unreadable: {error}"], _charts([])
    buyable = frame[~frame["entry_unbuyable"].fillna(False).astype(bool)] if "entry_unbuyable" in frame else frame
    stats: dict[str, Any] = {}
    for horizon, column in (("t1", "t1_ret"), ("t3", "t3_ret"), ("t5", "t5_ret"), ("t10", "t10_ret")):
        if column not in buyable:
            continue
        values = pd.to_numeric(buyable[column], errors="coerce").dropna()
        by_source: dict[str, Any] = {}
        if "source" in buyable:
            for source, group in buyable.groupby("source"):
                series = pd.to_numeric(group[column], errors="coerce").dropna()
                if len(series) > 0:
                    by_source[str(source)] = {
                        "n": int(len(series)),
                        "win_rate": round(float((series > 0).mean()), 4),
                        "mean": round(float(series.mean()), 4),
                    }
        stats[horizon] = {
            "n": int(len(values)),
            "win_rate": round(float((values > 0).mean()), 4) if len(values) > 0 else None,
            "mean": round(float(values.mean()), 4) if len(values) > 0 else None,
            "by_source": by_source,
        }
    rows = _jsonable(frame.tail(limit).to_dict(orient="records"))
    document = {"available": True, "path": str(path), "rows": rows, "stats": stats, "total": int(len(frame))}
    return document, [], _charts([])


def op_strategy_recent(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Read the latest core iteration notes from strategy/00-project-progress.md."""
    try:
        limit = max(1, min(5, int(arguments.get("limit", 2))))
    except (TypeError, ValueError) as error:
        raise RuntimeError("strategy limit must be an integer") from error
    document, warnings = _strategy_progress()
    if document.get("available"):
        document["entries"] = (document.get("entries") or [])[:limit]
        document["markdown"] = _strategy_markdown(document, limit)
    document["limit"] = limit
    return document, warnings, _charts([])


def op_strategy_doc(arguments: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """Read one whitelisted StockMarket strategy document for the mindset layer."""
    names = {
        "mindset": "strategy/03-交易心法.md",
        "progress": "strategy/00-project-progress.md",
        "model": "strategy/02-model-design.md",
        "etf": "strategy/01-ETF-left-side-season-scoring-model.md",
        "readme": "README.md",
    }
    name = arguments.get("name", "mindset")
    if name not in names:
        raise RuntimeError("strategy doc name must be mindset, progress, model, etf, or readme")
    path = _stock_market_root() / names[name]
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as error:  # noqa: BLE001 - a missing document is a warning, not a fake answer
        return {"name": name, "path": str(path), "text": ""}, [f"strategy document unavailable: {error}"], _charts([])
    return {"name": name, "path": str(path), "text": text}, [], _charts([])


OPERATIONS: dict[str, Callable[[dict[str, Any]], tuple[dict[str, Any], list[str], dict[str, Any]]]] = {
    "refresh": op_refresh,
    "csi300_analysis": op_csi300_analysis,
    "csi2000_analysis": op_csi2000_analysis,
    "market_signal": op_market_signal,
    "macro_snapshot": op_macro_snapshot,
    "dashboard": op_dashboard,
    "ice_check": op_ice_check,
    "opportunity_radar": op_opportunity_radar,
    "dragon_head": op_dragon_head,
    "positions": op_positions,
    "journal_append": op_journal_append,
    "journal_recent": op_journal_recent,
    "dragon_history": op_dragon_history,
    "strategy_doc": op_strategy_doc,
    "strategy_recent": op_strategy_recent,
    "dragon_track": op_dragon_track,
}


def run(request: Any) -> dict[str, Any]:
    """Execute one validated request object and return its response object."""
    if not isinstance(request, dict):
        raise RuntimeError("request must be a JSON object")
    operation = request.get("operation")
    if not isinstance(operation, str) or operation not in OPERATIONS:
        known = ", ".join(sorted(OPERATIONS))
        raise RuntimeError(f"unknown operation {operation!r}; known operations: {known}")
    arguments = request.get("arguments", {})
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict):
        raise RuntimeError("arguments must be a JSON object")
    # Every operation imports its StockMarket modules at call time; the project
    # root must be importable before the first of those imports. Validation
    # above runs first so a malformed request never pays that cost.
    _ensure_stock_market_imports()
    document, warnings, charts = OPERATIONS[operation](arguments)
    return {
        "ok": True,
        "operation": operation,
        "document": _jsonable(document),
        "warnings": list(warnings),
        "charts": _jsonable(charts),
    }


def main() -> int:
    """Read one request from stdin, write one response object to stdout."""
    real_stdout = sys.stdout
    # Imported modules print progress and warnings on stdout; those bytes must
    # never join the response object, so every write below lands on stderr.
    sys.stdout = sys.stderr
    request: Any = None
    operation: Any = None
    try:
        raw = sys.stdin.read()
        request = json.loads(raw)
        if isinstance(request, dict):
            operation = request.get("operation")
        response = run(request)
    except Exception as error:  # noqa: BLE001 - every failure becomes the response
        traceback.print_exc(file=sys.stderr)
        response = {"ok": False, "operation": operation, "error": f"{type(error).__name__}: {error}"}
    finally:
        sys.stdout = real_stdout
    real_stdout.write(json.dumps(response, ensure_ascii=False, allow_nan=False))
    real_stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
