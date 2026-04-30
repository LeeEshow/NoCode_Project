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
        stocks = []
        for c in manager.api.Contracts.Stocks.TSE:
            if hasattr(c, "code") and hasattr(c, "name"):
                stocks.append(StockItem(code=c.code, name=c.name, exchange="TSE"))
        for c in manager.api.Contracts.Stocks.OTC:
            if hasattr(c, "code") and hasattr(c, "name"):
                stocks.append(StockItem(code=c.code, name=c.name, exchange="OTC"))
    except Exception as e:
        raise HTTPException(503, detail=f"Failed to fetch stock list: {e}")

    _cache = stocks
    return StocksResponse(data=stocks, total=len(stocks))
