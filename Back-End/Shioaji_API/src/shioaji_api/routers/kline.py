import asyncio
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from shioaji_api.core.manager import manager
from shioaji_api.schemas.market import KBar, KlineResponse

router = APIRouter()


def _aggregate_daily(raw: list[dict]) -> list[KBar]:
    """將 1 分鐘 K 棒聚合成日線"""
    daily: dict[str, dict] = {}
    for bar in raw:
        day = datetime.fromtimestamp(bar["ts"] / 1e9).strftime("%Y-%m-%d")
        if day not in daily:
            daily[day] = {
                "ts": day,
                "open": bar["open"],
                "high": bar["high"],
                "low": bar["low"],
                "close": bar["close"],
                "volume": bar["volume"],
            }
        else:
            daily[day]["high"] = max(daily[day]["high"], bar["high"])
            daily[day]["low"] = min(daily[day]["low"], bar["low"])
            daily[day]["close"] = bar["close"]
            daily[day]["volume"] += bar["volume"]

    return [KBar(**v) for v in sorted(daily.values(), key=lambda x: x["ts"])]


@router.get("/kline/{stock_id}", response_model=KlineResponse)
async def get_kline(
    stock_id: str,
    interval: str = Query(default="1D", description="K線間距：1D（日線）或 1m（分線）"),
    days: int = Query(default=60, ge=1, le=365, description="往前取幾個日曆天"),
):
    if not manager.initialized:
        raise HTTPException(503, detail="Service not ready")

    try:
        contract = manager.api.Contracts.Stocks[stock_id]
    except (KeyError, AttributeError):
        raise HTTPException(404, detail=f"Stock {stock_id} not found")

    end = date.today()
    start = end - timedelta(days=days)

    def _fetch():
        return manager.api.kbars(
            contract=contract,
            start=str(start),
            end=str(end),
        )

    try:
        kbars = await asyncio.to_thread(_fetch)
    except Exception as e:
        raise HTTPException(503, detail=f"Failed to fetch kbars: {e}")

    raw = [
        {"ts": ts, "open": o, "high": h, "low": l, "close": c, "volume": v}
        for ts, o, h, l, c, v in zip(
            kbars.ts, kbars.Open, kbars.High, kbars.Low, kbars.Close, kbars.Volume
        )
    ]

    if interval.upper() == "1D":
        data = _aggregate_daily(raw)
    else:
        data = [
            KBar(
                ts=datetime.fromtimestamp(bar["ts"] / 1e9).isoformat(),
                open=bar["open"],
                high=bar["high"],
                low=bar["low"],
                close=bar["close"],
                volume=bar["volume"],
            )
            for bar in raw
        ]

    return KlineResponse(code=stock_id, interval=interval, data=data)
