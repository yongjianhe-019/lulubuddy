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


OPERATIONS: dict[str, Callable[[dict[str, Any]], tuple[dict[str, Any], list[str], dict[str, Any]]]] = {
    "refresh": op_refresh,
    "csi300_analysis": op_csi300_analysis,
    "csi2000_analysis": op_csi2000_analysis,
    "market_signal": op_market_signal,
    "macro_snapshot": op_macro_snapshot,
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
