from typing import Optional
from pydantic import BaseModel


class QuoteResponse(BaseModel):
    code: str
    price: float
    open: float
    high: float
    low: float
    volume: int
    change: Optional[float] = None
    change_percent: Optional[float] = None
    timestamp: str
    source: str = "snapshot"


class IndexResponse(BaseModel):
    code: str
    price: float
    open: float
    high: float
    low: float
    volume: int
    change: Optional[float] = None
    change_percent: Optional[float] = None
    timestamp: str
    source: str = "snapshot"


class StockItem(BaseModel):
    code: str
    name: str
    exchange: str


class StocksResponse(BaseModel):
    data: list[StockItem]
    total: int


class KBar(BaseModel):
    ts: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class KlineResponse(BaseModel):
    code: str
    interval: str
    data: list[KBar]


class HealthResponse(BaseModel):
    status: str
    connected: bool
    initialized: bool
    subscribed_stocks: int
    cached_quotes: int
    cached_futures: int
