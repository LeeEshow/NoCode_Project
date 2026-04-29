from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "yearly_records"


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "id": doc.id,
        "assetType": d.get("asset_type", ""),
        "year": d.get("year", 0),
        "prevYearTotal": d.get("prev_year_total", 0),
        "amountInvested": d.get("amount_invested", 0),
        "stockValue": d.get("stock_value", 0),
        "cashBalance": d.get("cash_balance", 0),
        "foreignValueTwd": d.get("foreign_value_twd", 0),
        "returnAmount": d.get("return_amount", 0),
        "returnRate": d.get("return_rate", 0),
        "settledAt": _ts_to_iso(d.get("settled_at")),
        "note": d.get("note", ""),
        "createdAt": _ts_to_iso(d.get("created_at")),
    }


async def find_all(asset_type: str = "tw_stock") -> list[dict]:
    def _run():
        snap = (
            get_db().collection(COL)
            .where("asset_type", "==", asset_type)
            .order_by("year")
            .get()
        )
        return [_from_doc(d) for d in snap]
    return await asyncio.to_thread(_run)


async def find_by_year(asset_type: str, year: int) -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(f"{asset_type}_{year}").get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def create(data: dict) -> dict:
    def _run():
        from datetime import datetime, timezone
        asset_type = data["assetType"]
        year = data["year"]
        ref = get_db().collection(COL).document(f"{asset_type}_{year}")
        settled_ts = None
        if data.get("settledAt"):
            settled_ts = datetime.fromisoformat(data["settledAt"].replace("Z", "+00:00"))
        ref.set({
            "asset_type": asset_type,
            "year": year,
            "prev_year_total": data.get("prevYearTotal", 0),
            "amount_invested": data.get("amountInvested", 0),
            "stock_value": data.get("stockValue", 0),
            "cash_balance": data.get("cashBalance", 0),
            "foreign_value_twd": data.get("foreignValueTwd", 0),
            "return_amount": data.get("returnAmount", 0),
            "return_rate": data.get("returnRate", 0),
            "settled_at": settled_ts,
            "note": data.get("note", ""),
            "created_at": SERVER_TIMESTAMP,
        })
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)


async def update(asset_type: str, year: int, patch: dict) -> Optional[dict]:
    def _run():
        from datetime import datetime, timezone
        ref = get_db().collection(COL).document(f"{asset_type}_{year}")
        if not ref.get().exists:
            return None
        data: dict = {}
        if "prevYearTotal"   in patch: data["prev_year_total"]   = patch["prevYearTotal"]
        if "amountInvested"  in patch: data["amount_invested"]   = patch["amountInvested"]
        if "stockValue"      in patch: data["stock_value"]       = patch["stockValue"]
        if "cashBalance"     in patch: data["cash_balance"]      = patch["cashBalance"]
        if "foreignValueTwd" in patch: data["foreign_value_twd"] = patch["foreignValueTwd"]
        if "returnAmount"    in patch: data["return_amount"]     = patch["returnAmount"]
        if "returnRate"      in patch: data["return_rate"]       = patch["returnRate"]
        if "note"            in patch: data["note"]              = patch["note"]
        if "settledAt"       in patch:
            data["settled_at"] = datetime.fromisoformat(patch["settledAt"].replace("Z", "+00:00"))
        if data:
            ref.update(data)
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)
