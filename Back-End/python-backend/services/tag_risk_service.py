from __future__ import annotations

import asyncio
import logging
from typing import TypedDict

from services.firestore import db

logger = logging.getLogger(__name__)

_STATE_MULTIPLIERS = {
    "neutral":      1.0,
    "risk-on":      1.3,
    "risk-off":     1.8,
    "liquidity-dry": 2.5,
}


def _r2(v: float) -> float:
    """四捨五入至小數兩位，對應 Node.js parseFloat(v.toFixed(2))"""
    return round(v, 2)


def _clamp(v: float) -> float:
    return max(0.0, min(3.0, v))


def _get_preset_value(msp: dict | None, state: str) -> float | None:
    if not msp:
        return None
    key_map = {
        "risk-on":       "riskOn",
        "risk-off":      "riskOff",
        "liquidity-dry": "liquidityDry",
        "neutral":       None,
    }
    key = key_map.get(state)
    if key is None:
        return None
    v = msp.get(key)
    return float(v) if v is not None else None


async def recalculate_dynamic_risk(market_state: str) -> dict:
    """
    依市場狀態批次更新所有 Tag 的 dynamicRisk。
    計算邏輯（M3-B 規格）：
      1. 若 tag.marketStatePresets[currentState] 存在 → 直接用 preset 值
      2. 否則 → tag.baseRisk × stateMultiplier
    所有 tag 都更新；skippedCount 僅統計無 asset_tags 掛載的 tag 數量（提示用）。
    """
    tags_snap = await asyncio.to_thread(lambda: list(db.collection("tags").stream()))
    asset_tags_snap = await asyncio.to_thread(lambda: list(db.collection("asset_tags").stream()))

    # 建立有掛載持股的 tagName 集合
    tags_with_holdings: set[str] = set()
    for at_doc in asset_tags_snap:
        tag_name = at_doc.to_dict().get("tag_name", "")
        if tag_name:
            tags_with_holdings.add(tag_name)

    multiplier = _STATE_MULTIPLIERS.get(market_state, 1.0)
    updates: list[dict] = []
    skipped_count = 0

    for doc in tags_snap:
        d = doc.to_dict()
        base_risk = d.get("base_risk", 0)
        tag_name  = d.get("name", "")
        msp_raw   = d.get("market_state_presets")

        # 轉換 Firestore snake_case presets → camelCase 供 _get_preset_value 使用
        msp = None
        if msp_raw:
            msp = {
                "riskOn":       msp_raw.get("risk_on"),
                "riskOff":      msp_raw.get("risk_off"),
                "liquidityDry": msp_raw.get("liquidity_dry"),
            }

        preset_val = _get_preset_value(msp, market_state)
        if preset_val is not None:
            dynamic_risk = _r2(_clamp(preset_val))
        else:
            dynamic_risk = _r2(_clamp(base_risk * multiplier))

        updates.append({"id": doc.id, "dynamicRisk": dynamic_risk})

        if tag_name not in tags_with_holdings:
            skipped_count += 1

    # Firestore batch 寫入
    def _batch_write():
        batch = db.batch()
        col = db.collection("tags")
        for u in updates:
            batch.update(col.document(u["id"]), {"dynamic_risk": u["dynamicRisk"]})
        batch.commit()

    if updates:
        await asyncio.to_thread(_batch_write)

    return {"updatedCount": len(updates), "skippedCount": skipped_count}
