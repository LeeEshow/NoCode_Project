from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from firebase_admin import firestore as fs
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db

router = APIRouter()

PLAN_CONFIG_COL = "plan_config"
PLAN_CONFIG_DOC = "main"

INVESTMENT_PLANS_COL = "investment_plans"
YEARLY_RECORDS_COL   = "yearly_records"

PLAN_CONFIG_DEFAULTS = {
    "annualInvest":        120000,
    "rBase":               0.08,
    "inflation":           "base",
    "kRisk":               1.0,
    "startYear":           datetime.now().year,
    "overrides":           {},
    "currentYearReinvest": 0,
}


def ts_iso(val) -> str:
    if isinstance(val, datetime):
        return val.isoformat()
    return datetime.now(timezone.utc).isoformat()


# ─── Plan Config 反序列化 ──────────────────────────────────────────────────────

def deserialize_plan_config(doc) -> dict:
    d = doc.to_dict()
    return {
        "annualInvest":        d.get("annual_invest",          PLAN_CONFIG_DEFAULTS["annualInvest"]),
        "rBase":               d.get("r_base",                 PLAN_CONFIG_DEFAULTS["rBase"]),
        "inflation":           d.get("inflation",              PLAN_CONFIG_DEFAULTS["inflation"]),
        "kRisk":               d.get("k_risk",                 PLAN_CONFIG_DEFAULTS["kRisk"]),
        "startYear":           d.get("start_year",             PLAN_CONFIG_DEFAULTS["startYear"]),
        "overrides":           d.get("overrides",              {}),
        "currentYearReinvest": d.get("current_year_reinvest",  0),
        "updatedAt":           ts_iso(d.get("updated_at")),
    }


# ─── GET /plan/config ──────────────────────────────────────────────────────────

@router.get("/config")
async def get_plan_config():
    db = get_db()
    doc = db.collection(PLAN_CONFIG_COL).document(PLAN_CONFIG_DOC).get()
    if not doc.exists:
        return {"success": True, "data": {**PLAN_CONFIG_DEFAULTS, "updatedAt": datetime.now(timezone.utc).isoformat()}}
    return {"success": True, "data": deserialize_plan_config(doc)}


# ─── PUT /plan/config ──────────────────────────────────────────────────────────

@router.put("/config")
async def update_plan_config(body: dict):
    for field in ["annualInvest", "rBase", "kRisk", "startYear"]:
        if body.get(field) is None:
            raise HTTPException(status_code=400, detail=f"缺少必填欄位：{field}")
    if body.get("inflation") not in ["low", "base", "high"]:
        raise HTTPException(status_code=400, detail="inflation 必須為 low | base | high")

    db = get_db()
    ref = db.collection(PLAN_CONFIG_COL).document(PLAN_CONFIG_DOC)
    ref.set({
        "annual_invest":          float(body["annualInvest"]),
        "r_base":                 float(body["rBase"]),
        "inflation":              body["inflation"],
        "k_risk":                 float(body["kRisk"]),
        "start_year":             int(body["startYear"]),
        "overrides":              body.get("overrides", {}),
        "current_year_reinvest":  float(body.get("currentYearReinvest", 0)),
        "updated_at":             fs.SERVER_TIMESTAMP,
    })
    updated = deserialize_plan_config(ref.get())
    return {"success": True, "data": updated}


# ─── InvestmentPlan 反序列化 ───────────────────────────────────────────────────

def deserialize_investment_plan(doc) -> dict:
    d = doc.to_dict()
    return {
        "assetType":         doc.id,
        "annualInvest":      d.get("annual_invest", 0),
        "rBase":             d.get("r_base", 0),
        "piBase":            d.get("pi_base", 0),
        "piShock":           d.get("pi_shock", 0),
        "inflationScenario": d.get("inflation_scenario", "base"),
        "kRisk":             d.get("k_risk", 1.0),
        "startYear":         d.get("start_year", datetime.now().year),
        "planYears":         d.get("plan_years", 10),
        "createdAt":         ts_iso(d.get("created_at")),
        "updatedAt":         ts_iso(d.get("updated_at")),
    }


# ─── GET /plan ─────────────────────────────────────────────────────────────────

@router.get("/")
async def get_plan(asset_type: str = Query(default="tw_stock", alias="asset_type")):
    db = get_db()
    doc = db.collection(INVESTMENT_PLANS_COL).document(asset_type).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="投報計畫不存在，請先建立")
    return {"success": True, "data": deserialize_investment_plan(doc)}


# ─── PUT /plan ─────────────────────────────────────────────────────────────────

@router.put("/")
async def update_plan(body: dict):
    required = ["annualInvest", "rBase", "piBase", "piShock",
                "inflationScenario", "kRisk", "startYear", "planYears"]
    for f in required:
        if body.get(f) is None:
            raise HTTPException(status_code=400, detail="缺少必填欄位")

    asset_type = str(body.get("assetType", "tw_stock"))
    db = get_db()
    ref = db.collection(INVESTMENT_PLANS_COL).document(asset_type)
    existing = ref.get()
    ref.set({
        "asset_type":         asset_type,
        "annual_invest":      float(body["annualInvest"]),
        "r_base":             float(body["rBase"]),
        "pi_base":            float(body["piBase"]),
        "pi_shock":           float(body["piShock"]),
        "inflation_scenario": body["inflationScenario"],
        "k_risk":             float(body["kRisk"]),
        "start_year":         int(body["startYear"]),
        "plan_years":         int(body["planYears"]),
        "created_at":         existing.to_dict().get("created_at", fs.SERVER_TIMESTAMP) if existing.exists else fs.SERVER_TIMESTAMP,
        "updated_at":         fs.SERVER_TIMESTAMP,
    })
    updated = deserialize_investment_plan(ref.get())
    return {"success": True, "data": updated}


# ─── YearlyRecord 反序列化 ─────────────────────────────────────────────────────

def deserialize_yearly_record(doc) -> dict:
    d = doc.to_dict()
    return {
        "id":              doc.id,
        "assetType":       d.get("asset_type"),
        "year":            d.get("year"),
        "prevYearTotal":   d.get("prev_year_total", 0),
        "amountInvested":  d.get("amount_invested", 0),
        "stockValue":      d.get("stock_value", 0),
        "cashBalance":     d.get("cash_balance", 0),
        "foreignValueTwd": d.get("foreign_value_twd", 0),
        "returnAmount":    d.get("return_amount", 0),
        "returnRate":      d.get("return_rate", 0),
        "settledAt":       ts_iso(d.get("settled_at")),
        "note":            d.get("note", ""),
        "createdAt":       ts_iso(d.get("created_at")),
    }


# ─── GET /plan/yearly-records ──────────────────────────────────────────────────

@router.get("/yearly-records")
async def get_yearly_records(asset_type: str = Query(default="tw_stock", alias="asset_type")):
    db = get_db()
    snap = (
        db.collection(YEARLY_RECORDS_COL)
        .where(filter=FieldFilter("asset_type", "==", asset_type))
        .get()
    )
    items = [deserialize_yearly_record(doc) for doc in snap]
    items.sort(key=lambda x: x["year"])
    return {"success": True, "data": items}


# ─── POST /plan/yearly-records ─────────────────────────────────────────────────

@router.post("/yearly-records")
async def create_yearly_record(body: dict):
    required = ["year", "prevYearTotal", "amountInvested", "stockValue",
                "cashBalance", "foreignValueTwd", "returnAmount", "returnRate", "settledAt"]
    for f in required:
        if body.get(f) is None:
            raise HTTPException(status_code=400, detail="缺少必填欄位")

    asset_type = str(body.get("assetType", "tw_stock"))
    year = int(body["year"])
    doc_id = f"{asset_type}_{year}"

    db = get_db()
    ref = db.collection(YEARLY_RECORDS_COL).document(doc_id)
    if ref.get().exists:
        raise HTTPException(status_code=409, detail=f"{doc_id} 年度結算已存在")

    ref.set({
        "asset_type":       asset_type,
        "year":             year,
        "prev_year_total":  float(body["prevYearTotal"]),
        "amount_invested":  float(body["amountInvested"]),
        "stock_value":      float(body["stockValue"]),
        "cash_balance":     float(body["cashBalance"]),
        "foreign_value_twd": float(body["foreignValueTwd"]),
        "return_amount":    float(body["returnAmount"]),
        "return_rate":      float(body["returnRate"]),
        "settled_at":       datetime.fromisoformat(str(body["settledAt"]).replace("Z", "+00:00")),
        "note":             str(body.get("note", "")),
        "created_at":       fs.SERVER_TIMESTAMP,
    })
    created = deserialize_yearly_record(ref.get())
    return {"success": True, "data": created}


# ─── PUT /plan/yearly-records/:year ───────────────────────────────────────────

@router.put("/yearly-records/{year}")
async def update_yearly_record(
    year: int,
    body: dict,
    asset_type: str = Query(default="tw_stock", alias="asset_type"),
):
    doc_id = f"{asset_type}_{year}"
    db = get_db()
    ref = db.collection(YEARLY_RECORDS_COL).document(doc_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="年度結算不存在")

    patch: dict = {}
    if "prevYearTotal"   in body: patch["prev_year_total"]   = float(body["prevYearTotal"])
    if "amountInvested"  in body: patch["amount_invested"]   = float(body["amountInvested"])
    if "stockValue"      in body: patch["stock_value"]       = float(body["stockValue"])
    if "cashBalance"     in body: patch["cash_balance"]      = float(body["cashBalance"])
    if "foreignValueTwd" in body: patch["foreign_value_twd"] = float(body["foreignValueTwd"])
    if "returnAmount"    in body: patch["return_amount"]     = float(body["returnAmount"])
    if "returnRate"      in body: patch["return_rate"]       = float(body["returnRate"])
    if "settledAt"       in body:
        patch["settled_at"] = datetime.fromisoformat(str(body["settledAt"]).replace("Z", "+00:00"))
    if "note"            in body: patch["note"]              = str(body["note"])

    ref.update(patch)
    updated = deserialize_yearly_record(ref.get())
    return {"success": True, "data": updated}
