from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from services.firestore import db

logger = logging.getLogger(__name__)

_TZ_TAIPEI = timezone(timedelta(hours=8))


def _vix_to_market_state(vix: Optional[float]) -> Optional[str]:
    if vix is None:
        return None
    if vix < 20:
        return "risk-on"
    if vix <= 30:
        return "neutral"
    return "risk-off"


def _today_taipei() -> str:
    return datetime.now(_TZ_TAIPEI).strftime("%Y-%m-%d")


async def record_snapshot(payload: dict) -> dict:
    """
    並行抓 VIX + 寫入 Firestore daily_snapshots/{date}。
    VIX 失敗靜默存 None，不阻斷主流程。
    快照寫入後 fire-and-forget 觸發 dynamic risk 重算。
    """
    from services.yahoo_finance import get_vix
    from services.tag_risk_service import recalculate_dynamic_risk

    # ── 並行抓 VIX ──────────────────────────────────────────────────────────────
    vix_result = await asyncio.gather(get_vix(), return_exceptions=True)
    vix: Optional[float] = None
    if not isinstance(vix_result[0], Exception):
        vix = vix_result[0]
    else:
        logger.debug("VIX fetch failed: %s", vix_result[0])

    market_state_auto = _vix_to_market_state(vix)

    # ── 組合並寫入 Firestore（merge，冪等）───────────────────────────────────
    date_str = payload.get("date") or _today_taipei()

    doc_data = {
        **{_camel_to_snake(k): v for k, v in payload.items()},
        "vix": vix,
        "market_state_auto": market_state_auto,
    }

    def _write():
        db.collection("daily_snapshots").document(date_str).set(doc_data, merge=True)

    await asyncio.to_thread(_write)

    # ── fire-and-forget dynamic risk ────────────────────────────────────────────
    current_market_state = payload.get("marketState", "neutral")
    asyncio.create_task(_safe_recalculate(recalculate_dynamic_risk, current_market_state))

    result = _snake_to_camel_dict(doc_data)
    result["date"] = date_str
    return result


async def _safe_recalculate(fn, *args):
    try:
        await fn(*args)
    except Exception as e:
        logger.error("fire-and-forget recalculate_dynamic_risk failed: %s", e)


# ── GET helpers ───────────────────────────────────────────────────────────────

async def get_all_snapshots() -> list:
    def _read():
        docs = db.collection("daily_snapshots").order_by("date", direction="DESCENDING").stream()
        return [_deserialize(d) for d in docs]
    return await asyncio.to_thread(_read)


async def get_snapshot_by_date(date_str: str) -> Optional[dict]:
    def _read():
        doc = db.collection("daily_snapshots").document(date_str).get()
        if not doc.exists:
            return None
        return _deserialize(doc)
    return await asyncio.to_thread(_read)


def _deserialize(doc) -> dict:
    d = doc.to_dict() or {}
    result = _snake_to_camel_dict(d)
    result.setdefault("date", doc.id)
    result.setdefault("vix", None)
    result.setdefault("marketStateAuto", None)
    return result


# ── camelCase ↔ snake_case helpers ────────────────────────────────────────────

def _camel_to_snake(name: str) -> str:
    import re
    s1 = re.sub(r'(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def _snake_to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def _snake_to_camel_dict(d: dict) -> dict:
    return {_snake_to_camel(k): v for k, v in d.items()}
