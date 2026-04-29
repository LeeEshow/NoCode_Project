from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from models import plan_config, yearly_record, investment_plan
import lib.api_response as R

router = APIRouter()

# ── GET/PUT /api/v1/plan/config ─────────────────────────────────────────────

@router.get("/config")
async def get_config():
    data = await plan_config.find()
    return R.success(data)


@router.put("/config")
async def update_config(body: dict):
    if body.get("annualInvest") is None: raise HTTPException(400, "缺少必填欄位：annualInvest")
    if body.get("rBase")        is None: raise HTTPException(400, "缺少必填欄位：rBase")
    if body.get("inflation") not in ["low", "base", "high"]:
        raise HTTPException(400, "inflation 必須為 low | base | high")
    if body.get("kRisk")     is None: raise HTTPException(400, "缺少必填欄位：kRisk")
    if body.get("startYear") is None: raise HTTPException(400, "缺少必填欄位：startYear")

    data = await plan_config.upsert({
        "annualInvest":        float(body["annualInvest"]),
        "rBase":               float(body["rBase"]),
        "inflation":           body["inflation"],
        "kRisk":               float(body["kRisk"]),
        "startYear":           int(body["startYear"]),
        "overrides":           body.get("overrides", {}),
        "currentYearReinvest": float(body.get("currentYearReinvest", 0)),
    })
    return R.success(data)


# ── GET/PUT /api/v1/plan（舊版 InvestmentPlan）──────────────────────────────

@router.get("")
async def get_plan(asset_type: str = Query(default="tw_stock")):
    data = await investment_plan.find(asset_type)
    if not data:
        raise HTTPException(404, "投報計畫不存在，請先建立")
    return R.success(data)


@router.put("")
async def update_plan(body: dict):
    required = ["annualInvest", "rBase", "piBase", "piShock", "inflationScenario",
                "kRisk", "startYear", "planYears"]
    missing  = [k for k in required if body.get(k) is None]
    if missing:
        raise HTTPException(400, f"缺少必填欄位：{', '.join(missing)}")
    data = await investment_plan.upsert({
        "assetType":         body.get("assetType", "tw_stock"),
        "annualInvest":      float(body["annualInvest"]),
        "rBase":             float(body["rBase"]),
        "piBase":            float(body["piBase"]),
        "piShock":           float(body["piShock"]),
        "inflationScenario": body["inflationScenario"],
        "kRisk":             float(body["kRisk"]),
        "startYear":         int(body["startYear"]),
        "planYears":         int(body["planYears"]),
    })
    return R.success(data)


# ── GET/POST/PUT /api/v1/plan/yearly-records ────────────────────────────────

@router.get("/yearly-records")
async def get_yearly_records(asset_type: str = Query(default="tw_stock")):
    data = await yearly_record.find_all(asset_type)
    return R.success(data)


@router.post("/yearly-records", status_code=201)
async def create_yearly_record(body: dict):
    required = ["year", "prevYearTotal", "amountInvested", "stockValue",
                "cashBalance", "foreignValueTwd", "returnAmount", "returnRate", "settledAt"]
    missing  = [k for k in required if body.get(k) is None]
    if missing:
        raise HTTPException(400, f"缺少必填欄位：{', '.join(missing)}")

    asset_type = body.get("assetType", "tw_stock")
    year       = int(body["year"])
    existing   = await yearly_record.find_by_year(asset_type, year)
    if existing:
        raise HTTPException(409, f"{asset_type}_{year} 年度結算已存在")

    data = await yearly_record.create({**body, "assetType": asset_type, "year": year})
    return R.success(data)


@router.put("/yearly-records/{year}")
async def update_yearly_record(year: int, body: dict, asset_type: str = Query(default="tw_stock")):
    data = await yearly_record.update(asset_type, year, body)
    if not data:
        raise HTTPException(404, "年度結算不存在")
    return R.success(data)
