from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from services.firestore import db
from routers.schemas import UpdateMarketStatePayload, success

router = APIRouter()
logger = logging.getLogger(__name__)

_COL    = "market_state"
_DOC_ID = "main"

_STATE_MULTIPLIERS = {
    "neutral":       1.0,
    "risk-on":       1.3,
    "risk-off":      1.8,
    "liquidity-dry": 2.5,
}


def _r2(v: float) -> float:
    return round(max(0.0, min(3.0, v)), 2)


# ── GET /market-state ──────────────────────────────────────────────────────────

@router.get("")
def get_market_state():
    doc = db.collection(_COL).document(_DOC_ID).get()
    current = doc.to_dict().get("current", "neutral") if doc.exists else "neutral"
    return success({"current": current})


# ── PUT /market-state ──────────────────────────────────────────────────────────

@router.put("")
async def update_market_state(payload: UpdateMarketStatePayload):
    state = payload.state
    multiplier = _STATE_MULTIPLIERS[state]

    tags_snap = await asyncio.to_thread(lambda: list(db.collection("tags").stream()))

    def _batch_write():
        batch = db.batch()
        tags_col = db.collection("tags")

        for doc in tags_snap:
            d = doc.to_dict()
            base_risk = d.get("base_risk", 0)
            msp = d.get("market_state_presets")

            # preset 優先，否則 baseRisk × multiplier；neutral 直接用 baseRisk
            if state == "neutral":
                dynamic_risk = _r2(base_risk)
            elif msp:
                key_map = {"risk-on": "risk_on", "risk-off": "risk_off", "liquidity-dry": "liquidity_dry"}
                preset_val = msp.get(key_map[state])
                dynamic_risk = _r2(preset_val) if preset_val is not None else _r2(base_risk * multiplier)
            else:
                dynamic_risk = _r2(base_risk * multiplier)

            batch.update(tags_col.document(doc.id), {"dynamic_risk": dynamic_risk})

        # market_state document 同一 batch 更新
        batch.set(db.collection(_COL).document(_DOC_ID), {"current": state})
        batch.commit()

    await asyncio.to_thread(_batch_write)
    logger.info("Market state updated to %s, %d tags updated", state, len(tags_snap))
    return success({"current": state})
