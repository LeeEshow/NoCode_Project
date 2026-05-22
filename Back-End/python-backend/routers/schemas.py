from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, field_validator


# ── 共用工具 ───────────────────────────────────────────────────────────────────

def success(data) -> dict:
    return {"success": True, "data": data}


# ── Holdings ───────────────────────────────────────────────────────────────────

class HoldingTagDTO(BaseModel):
    id: str
    tagName: str
    weightRatio: float


class HoldingDTO(BaseModel):
    stockId: str
    stockName: Optional[str] = None
    sharesHeld: float
    avgCost: float
    totalCost: float
    realizedProfit: float
    costMethod: str
    updatedAt: str
    sortIndex: int
    currentPrice: Optional[float] = None
    change: Optional[float] = None
    changePercent: Optional[float] = None
    tags: List[HoldingTagDTO] = []


class CreateHoldingPayload(BaseModel):
    stockId: str
    stockName: Optional[str] = None
    sharesHeld: float
    avgCost: float
    totalCost: float
    realizedProfit: float
    costMethod: str = "preserve_method"


class ReorderPayload(BaseModel):
    order: List[str]


class RecalculatePayload(BaseModel):
    holdings: List[CreateHoldingPayload]


# ── Asset Tags ─────────────────────────────────────────────────────────────────

class CreateAssetTagPayload(BaseModel):
    tagName: str
    weightRatio: float

    @field_validator("weightRatio")
    @classmethod
    def weight_range(cls, v: float) -> float:
        if v <= 0 or v > 100:
            raise ValueError("weightRatio 必須為 0 < value ≤ 100")
        return v


class UpdateAssetTagPayload(BaseModel):
    weightRatio: float

    @field_validator("weightRatio")
    @classmethod
    def weight_range(cls, v: float) -> float:
        if v <= 0 or v > 100:
            raise ValueError("weightRatio 必須為 0 < value ≤ 100")
        return v


# ── Watchlist ──────────────────────────────────────────────────────────────────

class WatchlistDTO(BaseModel):
    stockId: str
    stockName: str
    targetPrice: float
    note: str
    createdAt: str
    updatedAt: str
    sortIndex: int


class CreateWatchlistPayload(BaseModel):
    stockId: str
    stockName: Optional[str] = None
    targetPrice: float
    note: Optional[str] = None


class UpdateWatchlistPayload(BaseModel):
    targetPrice: Optional[float] = None
    note: Optional[str] = None


# ── Transactions ───────────────────────────────────────────────────────────────

class TransactionDTO(BaseModel):
    id: str
    stockId: str
    type: Literal["buy", "sell"]
    date: str
    shares: float
    pricePerShare: float
    fee: float
    note: str
    createdAt: str


class CreateTransactionPayload(BaseModel):
    stockId: str
    type: Literal["buy", "sell"]
    date: str
    shares: float
    pricePerShare: float
    fee: float
    note: Optional[str] = None


class UpdateTransactionPayload(BaseModel):
    stockId: Optional[str] = None
    type: Optional[Literal["buy", "sell"]] = None
    date: Optional[str] = None
    shares: Optional[float] = None
    pricePerShare: Optional[float] = None
    fee: Optional[float] = None
    note: Optional[str] = None


# ── Foreign Assets ─────────────────────────────────────────────────────────────

ALLOWED_CURRENCIES = ["USD", "JPY", "EUR", "CNY", "HKD", "GBP", "AUD", "SGD"]


class ForeignAssetDTO(BaseModel):
    id: str
    type: Literal["活存", "定存", "債券"]
    name: str
    currency: str
    amount: float
    interestRate: float
    maturityDate: Optional[str]
    useManualRate: bool
    manualRate: float
    updatedAt: str
    liveRate: Optional[float] = None


class CreateForeignAssetPayload(BaseModel):
    type: Literal["活存", "定存", "債券"]
    name: str = ""
    currency: str
    amount: float
    interestRate: float
    maturityDate: Optional[str] = None
    useManualRate: bool = False
    manualRate: float = 0.0


class UpdateForeignAssetPayload(BaseModel):
    type: Optional[Literal["活存", "定存", "債券"]] = None
    name: Optional[str] = None
    currency: Optional[str] = None
    amount: Optional[float] = None
    interestRate: Optional[float] = None
    maturityDate: Optional[str] = None
    useManualRate: Optional[bool] = None
    manualRate: Optional[float] = None


# ── Plans ──────────────────────────────────────────────────────────────────────

class PlanConfigDTO(BaseModel):
    annualInvest: float
    rBase: float
    inflation: Literal["low", "base", "high"]
    kRisk: float
    startYear: int
    overrides: Dict[str, float]
    currentYearReinvest: float
    updatedAt: str


class UpdatePlanConfigPayload(BaseModel):
    annualInvest: Optional[float] = None
    rBase: Optional[float] = None
    inflation: Optional[Literal["low", "base", "high"]] = None
    kRisk: Optional[float] = None
    startYear: Optional[int] = None
    overrides: Optional[Dict[str, float]] = None
    currentYearReinvest: Optional[float] = None


# ── Tags ───────────────────────────────────────────────────────────────────────

MarketStateName = Literal["neutral", "risk-on", "risk-off", "liquidity-dry"]


class MarketStatePresets(BaseModel):
    riskOn:       Optional[float] = None
    riskOff:      Optional[float] = None
    liquidityDry: Optional[float] = None


class TagDTO(BaseModel):
    id: str
    name: str
    baseRisk: float
    dynamicRisk: float
    targetWeight: Optional[float] = None
    fallbackBehavior: str
    marketStatePresets: Optional[MarketStatePresets] = None
    triggerDirection: Literal["both", "upper_only", "lower_only"]


class CreateTagPayload(BaseModel):
    name: str
    baseRisk: float
    targetWeight: Optional[float] = None
    fallbackBehavior: Optional[Literal["hold", "exclude"]] = None
    marketStatePresets: Optional[MarketStatePresets] = None
    triggerDirection: Optional[Literal["both", "upper_only", "lower_only"]] = None


class UpdateTagPayload(BaseModel):
    name: Optional[str] = None
    baseRisk: Optional[float] = None
    targetWeight: Optional[float] = None
    fallbackBehavior: Optional[Literal["hold", "exclude"]] = None
    marketStatePresets: Optional[MarketStatePresets] = None
    triggerDirection: Optional[Literal["both", "upper_only", "lower_only"]] = None


class RecalculateDynamicRiskPayload(BaseModel):
    marketState: MarketStateName


# ── Market State ───────────────────────────────────────────────────────────────

class MarketStateDTO(BaseModel):
    current: MarketStateName


class UpdateMarketStatePayload(BaseModel):
    state: MarketStateName


# ── Tag Correlation Matrix ─────────────────────────────────────────────────────

class CorrelationEntry(BaseModel):
    tagA: str
    tagB: str
    rho: float

    @field_validator("rho")
    @classmethod
    def rho_range(cls, v: float) -> float:
        if v < -1.0 or v > 1.0:
            raise ValueError("rho 必須在 -1.0 ~ 1.0 之間")
        return v


class TagCorrelationMatrixDTO(BaseModel):
    lastUpdated: str
    entries: List[CorrelationEntry]
    previousEntries: Optional[List[CorrelationEntry]] = None


class UpdateCorrelationMatrixPayload(BaseModel):
    entries: List[CorrelationEntry]


# ── Rebalance Rules ────────────────────────────────────────────────────────────

class RebalanceRuleDTO(BaseModel):
    baseThreshold: float
    volatilityFactor: float
    liquidityCapRatio: float
    advLookbackDays: int
    concentrationLimit: float


class UpdateRebalanceRulePayload(BaseModel):
    baseThreshold: float
    volatilityFactor: float
    liquidityCapRatio: float
    advLookbackDays: Optional[int] = None
    concentrationLimit: Optional[float] = None


# ── Rebalance Snapshots ────────────────────────────────────────────────────────

class SnapshotParams(BaseModel):
    totalAsset: float
    baseThreshold: float
    liquidityCapRatio: float
    marketState: MarketStateName


class SnapshotSuggestion(BaseModel):
    stockCode: str
    stockName: str
    action: Literal["buy", "sell", "hold"]
    shares: float
    estimatedAmount: float
    isLiquidityLimited: bool


class RebalanceSnapshotDTO(BaseModel):
    id: str
    createdAt: str
    params: SnapshotParams
    suggestions: List[SnapshotSuggestion]


class CreateRebalanceSnapshotPayload(BaseModel):
    params: SnapshotParams
    suggestions: List[SnapshotSuggestion]
