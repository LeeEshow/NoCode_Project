import asyncio
from fastapi import APIRouter
from services.yahoo_finance import get_indices, get_forex_rates, get_export_indicator

router = APIRouter()


@router.get("/indices")
async def market_indices():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_indices)
    return {"success": True, "data": data}


@router.get("/forex-rates")
async def forex_rates():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_forex_rates)
    return {"success": True, "data": data}


@router.get("/export-indicator")
async def export_indicator():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_export_indicator)
    return {"success": True, "data": data}
