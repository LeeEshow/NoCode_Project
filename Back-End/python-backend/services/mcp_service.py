from __future__ import annotations

import asyncio
import logging
from typing import Any

from services.firestore import db

logger = logging.getLogger(__name__)


# ── Tool implementations ───────────────────────────────────────────────────────

async def get_holdings() -> list[dict]:
    def _read():
        docs = db.collection("holdings").stream()
        result = []
        for doc in docs:
            d = doc.to_dict() or {}
            result.append({
                "stockId":      d.get("stock_id", doc.id),
                "name":         d.get("name", ""),
                "sharesHeld":   d.get("shares_held", 0),
                "averageCost":  d.get("average_cost", 0),
                "market":       d.get("market", ""),
            })
        return result
    return await asyncio.to_thread(_read)


async def get_tags_and_risk() -> list[dict]:
    def _read():
        docs = db.collection("tags").stream()
        result = []
        for doc in docs:
            d = doc.to_dict() or {}
            result.append({
                "id":           doc.id,
                "name":         d.get("name", ""),
                "baseRisk":     d.get("base_risk", 0),
                "dynamicRisk":  d.get("dynamic_risk", 0),
                "targetWeight": d.get("target_weight", 0),
            })
        return result
    return await asyncio.to_thread(_read)


async def get_market_state() -> dict:
    def _read():
        doc = db.collection("market_state").document("main").get()
        if not doc.exists:
            return {"current": "neutral"}
        d = doc.to_dict() or {}
        return {"current": d.get("current", "neutral"), "updatedAt": d.get("updated_at")}
    return await asyncio.to_thread(_read)


async def get_latest_snapshot() -> dict | None:
    def _read():
        docs = list(
            db.collection("daily_snapshots")
            .order_by("date", direction="DESCENDING")
            .limit(1)
            .stream()
        )
        if not docs:
            return None
        d = docs[0].to_dict() or {}
        d.setdefault("date", docs[0].id)
        d.setdefault("vix", None)
        d.setdefault("market_state_auto", None)
        return {
            "date":            d.get("date"),
            "totalValue":      d.get("total_value"),
            "totalCost":       d.get("total_cost"),
            "totalGain":       d.get("total_gain"),
            "gainPercent":     d.get("gain_percent"),
            "vix":             d.get("vix"),
            "marketStateAuto": d.get("market_state_auto"),
            "marketState":     d.get("market_state"),
        }
    return await asyncio.to_thread(_read)


async def get_rebalance_rules() -> dict:
    _DEFAULTS = {
        "baseThreshold":    0.05,
        "volatilityFactor": 1.0,
        "liquidityCapRatio": 0.20,
        "advLookbackDays":  20,
        "concentrationLimit": 0.70,
    }
    def _read():
        doc = db.collection("rebalance_rules").document("main").get()
        if not doc.exists:
            return _DEFAULTS.copy()
        d = doc.to_dict() or {}
        return {
            "baseThreshold":     d.get("base_threshold",     _DEFAULTS["baseThreshold"]),
            "volatilityFactor":  d.get("volatility_factor",  _DEFAULTS["volatilityFactor"]),
            "liquidityCapRatio": d.get("liquidity_cap_ratio",_DEFAULTS["liquidityCapRatio"]),
            "advLookbackDays":   d.get("adv_lookback_days",  _DEFAULTS["advLookbackDays"]),
            "concentrationLimit":d.get("concentration_limit",_DEFAULTS["concentrationLimit"]),
        }
    return await asyncio.to_thread(_read)


async def get_stock_price(stock_id: str) -> dict:
    from services import yahoo_finance as yf_svc
    return await yf_svc.get_quote(stock_id)


async def get_correlation_matrix() -> dict:
    def _read():
        doc = db.collection("tag_correlation_matrix").document("main").get()
        if not doc.exists:
            return {"entries": [], "previousEntries": None}
        d = doc.to_dict() or {}
        entries = [
            {"tagA": e.get("tag_a"), "tagB": e.get("tag_b"), "rho": e.get("rho")}
            for e in (d.get("entries") or [])
        ]
        prev_raw = d.get("previous_entries")
        prev = None
        if prev_raw:
            prev = [
                {"tagA": e.get("tag_a"), "tagB": e.get("tag_b"), "rho": e.get("rho")}
                for e in prev_raw
            ]
        return {"entries": entries, "previousEntries": prev, "lastUpdated": d.get("last_updated")}
    return await asyncio.to_thread(_read)


async def get_rebalance_snapshots(limit: int = 3) -> list[dict]:
    def _read():
        docs = list(
            db.collection("rebalance_snapshots")
            .order_by("created_at", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        result = []
        for doc in docs:
            d = doc.to_dict() or {}
            result.append({
                "id":          doc.id,
                "createdAt":   d.get("created_at"),
                "params":      d.get("params", {}),
                "suggestions": d.get("suggestions", []),
            })
        return result
    return await asyncio.to_thread(_read)


# ── Tool registry ──────────────────────────────────────────────────────────────

TOOLS: dict[str, dict] = {
    "get_holdings": {
        "description": "取得目前所有持股清單（stockId、name、sharesHeld、averageCost）",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "fn": lambda _args: get_holdings(),
    },
    "get_tags_and_risk": {
        "description": "取得所有 Tag 與其風險參數（baseRisk、dynamicRisk、targetWeight）",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "fn": lambda _args: get_tags_and_risk(),
    },
    "get_market_state": {
        "description": "取得目前市場狀態（neutral / risk-on / risk-off / liquidity-dry）",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "fn": lambda _args: get_market_state(),
    },
    "get_latest_snapshot": {
        "description": "取得最新每日資產快照（totalValue、gainPercent、vix、marketStateAuto）",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "fn": lambda _args: get_latest_snapshot(),
    },
    "get_rebalance_rules": {
        "description": "取得再平衡規則參數（baseThreshold、volatilityFactor、liquidityCapRatio 等）",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "fn": lambda _args: get_rebalance_rules(),
    },
    "get_stock_price": {
        "description": "查詢個股即時報價（price、change、changePercent）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "stockId": {"type": "string", "description": "台股代號，例如 2330"}
            },
            "required": ["stockId"],
        },
        "fn": lambda args: get_stock_price(args["stockId"]),
    },
    "get_correlation_matrix": {
        "description": "取得 Tag 相關性矩陣（tagA、tagB、rho）",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "fn": lambda _args: get_correlation_matrix(),
    },
    "get_rebalance_snapshots": {
        "description": "取得最近再平衡快照建議（最多 3 筆）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "回傳筆數，預設 3", "default": 3}
            },
            "required": [],
        },
        "fn": lambda args: get_rebalance_snapshots(args.get("limit", 3)),
    },
}
