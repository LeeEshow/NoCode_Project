from fastapi import APIRouter, HTTPException

from shioaji_api.core.manager import manager
from shioaji_api.schemas.market import StockItem, StocksResponse

router = APIRouter()

_cache: list[StockItem] | None = None


@router.get("/stocks", response_model=StocksResponse)
async def get_stocks():
    global _cache

    if not manager.initialized:
        raise HTTPException(503, detail="Service not ready")

    if _cache is not None:
        return StocksResponse(data=_cache, total=len(_cache))

    try:
        stocks = [
            StockItem(code=c.code, name=c.name, exchange=c.exchange)
            for c in manager.api.Contracts.Stocks
            if c.exchange in ("TSE", "OTC")
        ]
    except Exception as e:
        raise HTTPException(503, detail=f"Failed to fetch stock list: {e}")

    _cache = stocks
    return StocksResponse(data=stocks, total=len(stocks))
