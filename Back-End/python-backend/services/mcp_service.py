import asyncio
import json
from datetime import datetime, timezone
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db
from services.yahoo_finance import get_indices, get_history_range
from services.quote_service import get_quote


# ─── camelCase 轉換工具 ────────────────────────────────────────────────────────

def _to_camel(key: str) -> str:
    parts = key.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _convert_keys(obj):
    """遞迴將 dict key 由 snake_case 轉 camelCase"""
    if isinstance(obj, dict):
        return {_to_camel(k): _convert_keys(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_keys(i) for i in obj]
    return obj


def _text(data) -> dict:
    return {
        "content": [
            {"type": "text", "text": json.dumps(data, ensure_ascii=False, default=str)}
        ]
    }


# ─── Tool 定義清單 ─────────────────────────────────────────────────────────────

MCP_TOOLS = [
    {
        "name": "get_holdings",
        "description": "取得庫存持股清單，包含代號、名稱、持股數、平均成本、現值（currentPrice/currentValue 即時注入）。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_watchlist",
        "description": "取得自選股清單，包含股票代號、名稱、目標價、備註。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_market_indices",
        "description": "取得台股大盤、加權指數、台指期及主要海外指數的即時／收盤資料。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_stock_quote",
        "description": "取得指定股票的即時／收盤報價，包含現價、漲跌幅、成交量。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_id": {"type": "string", "description": "股票代號，例如 2330"},
            },
            "required": ["stock_id"],
        },
    },
    {
        "name": "get_snapshots",
        "description": "取得每日資產快照歷史，支援日期範圍（start_date/end_date）或年份篩選，預設最新 30 筆。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "year":       {"type": "integer", "description": "篩選年份，例如 2025（選填）"},
                "start_date": {"type": "string",  "description": "起始日 YYYY-MM-DD（選填）"},
                "end_date":   {"type": "string",  "description": "結束日 YYYY-MM-DD（選填）"},
                "limit":      {"type": "integer", "description": "最多回傳筆數（選填；日期範圍預設 365，無範圍預設 30）"},
            },
            "required": [],
        },
    },
    {
        "name": "get_tags",
        "description": "取得所有 Tag 標籤定義，包含名稱、基礎風險、動態風險、目標配置、市場狀態 Preset。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_rebalance_rules",
        "description": "取得再平衡規則設定，包含基礎偏離門檻、波動係數、流動性上限等參數。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_foreign_assets",
        "description": "取得外幣及債券資產清單，包含貨幣、金額、利率、到期日。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_asset_tags",
        "description": "取得個股 Tag 配置清單（多對多），包含股票代號、Tag 名稱及持倉比例 weightRatio。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_tag_correlation_matrix",
        "description": "取得 Tag 相關性矩陣，包含所有 Tag 配對的相關係數 ρ 及上次更新時間。用於矩陣風險公式 Risk_total = √(wᵀΣw)。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_transactions",
        "description": "取得交易紀錄（買進/賣出），可篩選單一個股，依交易日期升冪排列。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_id": {"type": "string", "description": "股票代號（選填，不填回傳全部）"},
            },
            "required": [],
        },
    },
    {
        "name": "get_stock_history",
        "description": "取得個股歷史 K 線資料（OHLCV），支援起訖日期與週期（1d/1wk/1mo），預設近 180 日日線。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_id":   {"type": "string", "description": "股票代號（必填）"},
                "start_date": {"type": "string", "description": "起始日 YYYY-MM-DD（選填）"},
                "end_date":   {"type": "string", "description": "結束日 YYYY-MM-DD（選填）"},
                "interval":   {"type": "string", "description": "'1d' | '1wk' | '1mo'（選填，預設 '1d'）"},
            },
            "required": ["stock_id"],
        },
    },
    {
        "name": "get_stock_chip",
        "description": "取得個股三大法人買賣超資料（單位：張），來源為 Firestore（由 FinMind 每日同步）。支援 limit 參數，預設 20，上限 60。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_id": {"type": "string",  "description": "股票代號（必填）"},
                "limit":    {"type": "integer", "description": "回傳筆數（選填，預設 20，上限 60）"},
            },
            "required": ["stock_id"],
        },
    },
    {
        "name": "get_rebalance_snapshots",
        "description": "取得歷次再平衡建議快照，包含計算參數與個股買賣建議，依建立時間降冪。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "回傳筆數（選填，預設 5，上限 20）"},
            },
            "required": [],
        },
    },
    {
        "name": "get_portfolio_tag_analysis",
        "description": "計算投組各 Tag 的已配置比例（actualWeight）、目標比例（targetWeight）、偏差與個股貢獻度。用於再平衡決策分析。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_stock_fundamental",
        "description": (
            "取得個股基本面資料，來源為 Firestore（由 FinMind 每日同步），涵蓋："
            "評價（peRatio/pbRatio/eps/bookValue）、"
            "股利（dividendYield/dividendRate/payoutRatio/exDividendDate）、"
            "獲利能力（grossMargin/operatingMargin/netMargin/roe）、"
            "規模成長（marketCap/revenue/revenueGrowth）、"
            "風險波動（fiftyTwoWeekHigh/fiftyTwoWeekLow/beta）。"
            "資料未同步時回傳 {stockId, updatedAt: null}。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_id": {"type": "string", "description": "股票代號，例如 2330"},
            },
            "required": ["stock_id"],
        },
    },
    {
        "name": "query_stock_fundamental",
        "description": (
            "即時從 FinMind API 查詢任意個股基本面（不限庫存持股，直接向 FinMind 發起請求）。"
            "涵蓋評價（peRatio/pbRatio/eps/bookValue）、"
            "股利（dividendYield/dividendRate/payoutRatio/exDividendDate）、"
            "獲利能力（grossMargin/operatingMargin/netMargin）、"
            "規模成長（marketCap/revenue/revenueGrowth）、"
            "風險波動（fiftyTwoWeekHigh/fiftyTwoWeekLow/beta）。"
            "注意：直接呼叫 FinMind API，耗時約 3-10 秒，結果為最新資料（非快取）。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_id": {"type": "string", "description": "股票代號，例如 2330"},
            },
            "required": ["stock_id"],
        },
    },
    {
        "name": "query_stock_chip",
        "description": (
            "即時從 FinMind API 查詢任意個股三大法人買賣超（不限庫存持股，直接向 FinMind 發起請求）。"
            "回傳 [{date, foreign, trust, dealer}]（單位：張），依日期升冪。"
            "注意：直接呼叫 FinMind API，結果為最新資料（非快取）。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_id":   {"type": "string",  "description": "股票代號，例如 2330（必填）"},
                "start_date": {"type": "string",  "description": "起始日 YYYY-MM-DD（選填，預設近 30 日）"},
                "limit":      {"type": "integer", "description": "最多回傳筆數（選填，預設 20，上限 60）"},
            },
            "required": ["stock_id"],
        },
    },
    # ── M9：Tag 寫入工具 ─────────────────────────────────────────────────────────
    {
        "name": "update_tag",
        "description": (
            "修改 Tag 的基礎風險係數、目標配比、偏離方向管制、同質集中度上限。"
            "預設 dry_run=true（預覽 before/after diff，不寫入）；"
            "確認後以 dry_run=false 實際寫入並自動重算 dynamicRisk。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "tag_id":              {"type": "string",          "description": "Tag 唯一識別碼（必填）"},
                "base_risk":           {"type": "number",          "description": "基礎風險係數 0.0–1.0（選填）"},
                "target_weight":       {"type": ["number", "null"],"description": "目標配比 0.0–1.0，null = 不設目標（選填）"},
                "direction":           {"type": "string",          "description": "both | upper_only | lower_only（選填）"},
                "concentration_limit": {"type": ["number", "null"],"description": "同質 Tag 集中度上限 0.0–1.0（選填）"},
                "dry_run":             {"type": "boolean",         "description": "預設 true（預覽模式）"},
            },
            "required": ["tag_id"],
        },
    },
    {
        "name": "set_asset_tags",
        "description": (
            "以 idempotent PUT 方式設定某支股票的完整 Tag 配置清單。"
            "AI 一次給出所有 Tag 及其 weight_ratio（整數，總和必須 == 100）；"
            "後端 diff 後以 Firestore batch write 原子性寫入（新增 / 更新 / 刪除）。"
            "預設 dry_run=true（預覽）；確認後以 dry_run=false 套用。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_code": {"type": "string", "description": "持股代碼，例如 '2330'（必填）"},
                "tags": {
                    "type": "array",
                    "description": "完整 Tag 配置清單（必填，不可為空）",
                    "items": {
                        "type": "object",
                        "properties": {
                            "tag_name":     {"type": "string",  "description": "Tag 名稱（必須存在於 tags collection）"},
                            "weight_ratio": {"type": "integer", "description": "配比百分比整數 1–100"},
                        },
                        "required": ["tag_name", "weight_ratio"],
                    },
                },
                "dry_run": {"type": "boolean", "description": "預設 true（預覽模式）"},
            },
            "required": ["stock_code", "tags"],
        },
    },
    # ── M10/M13：交易策略工具 ──────────────────────────────────────────────────────
    {
        "name": "save_trading_strategy",
        "description": (
            "AI 分析後建立或覆寫指定個股的交易策略（singleton-per-stock，覆寫不堆疊）。"
            "dismissed 強制重置為 false；created_at 由後端自動填入 UTC+8 現在時間。"
            "riskRewardRatio 由後端自動計算，AI 不需填入。summary ≤100字。"
            "使用 tranches[] 描述多批次進場腳本（最多 4 批，sizeRatio 合計須 = 1.0）。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_code":             {"type": "string", "description": "股票代號（必填）"},
                "stock_name":             {"type": "string", "description": "股票名稱（必填）"},
                "trade_type":             {"type": "string", "description": "entry|add|reduce|exit|watch（必填）"},
                "reference_price":        {"type": "number", "description": "分析當下市價（必填）"},
                "stop_loss_price":        {"type": "number", "description": "停損價（必填）"},
                "target_price_low":       {"type": "number", "description": "停利區間下緣（必填）"},
                "target_price_high":      {"type": "number", "description": "停利區間上緣（必填）"},
                "tranches": {
                    "type": "array",
                    "description": "多批次進場腳本，最多 4 批，sizeRatio 合計須 = 1.0（watch 類型除外）",
                    "items": {
                        "type": "object",
                        "properties": {
                            "batch":             {"type": "integer", "description": "批次序號，從 1 開始"},
                            "price_low":         {"type": "number",  "description": "進場區間下緣"},
                            "price_high":        {"type": "number",  "description": "進場區間上緣"},
                            "size_ratio":        {"type": "number",  "description": "佔總部位比例 0.0–1.0"},
                            "shares":            {"type": "integer", "description": "AI 建議股數（entry/add 由 AI 估算；reduce/exit = round(持股數 × sizeRatio)；watch 填 0）"},
                            "trigger_condition": {"type": "string",  "description": "此批次觸發條件（人讀文字）"},
                            "trigger_rules": {
                                "type": "array",
                                "description": "機器可評估的結構化條件（選填）",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "type":   {"type": "string",  "description": "price_in_range|price_above|price_below|price_above_ma|chip_dealer_buy|chip_foreign_buy|chip_trust_buy|manual"},
                                        "value":  {"type": "number",  "description": "price_above/price_below 使用"},
                                        "period": {"type": "integer", "description": "MA 週期或籌碼連續天數"},
                                    },
                                    "required": ["type"],
                                },
                            },
                            "status": {"type": "string", "description": "pending|triggered|skipped"},
                        },
                        "required": ["batch", "price_low", "price_high", "size_ratio", "shares", "trigger_condition"],
                    },
                },
                "trigger_condition":       {"type": "string", "description": "整體進場觸發條件（必填）"},
                "invalidation_condition":  {"type": "string", "description": "策略失效條件（必填）"},
                "confidence":              {"type": "string", "description": "high|medium|low（必填）"},
                "timeframe":               {"type": "string", "description": "short|medium|long（必填）"},
                "summary":                 {"type": "string", "description": "AI 簡述（≤100字，必填）"},
                "expires_at":              {"type": "string", "description": "到期日 ISO datetime（選填）"},
                "trigger_price":           {"type": "number", "description": "（deprecated）觸發價，改用 tranches"},
            },
            "required": [
                "stock_code", "stock_name", "trade_type", "reference_price",
                "stop_loss_price", "target_price_low", "target_price_high",
                "confidence", "timeframe", "summary",
                "trigger_condition", "invalidation_condition",
            ],
        },
    },
    {
        "name": "get_trading_strategy",
        "description": "取得指定個股的現有交易策略。無資料時回傳 {stockCode, strategy: null}。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_code": {"type": "string", "description": "股票代號（必填）"},
            },
            "required": ["stock_code"],
        },
    },
]


# ─── Tool 實作 ─────────────────────────────────────────────────────────────────

async def _get_holdings() -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("holdings").get()]

    holdings = await loop.run_in_executor(None, _read)

    async def _fetch_price(h):
        sid = h.get("stockId") or h.get("id", "")
        if not sid:
            return None, None
        try:
            q = await get_quote(sid)
            price = q.get("price")
            shares = float(h.get("sharesHeld", 0) or 0)
            value = round(shares * price, 2) if price else None
            return price, value
        except Exception:
            return None, None

    results = await asyncio.gather(*[_fetch_price(h) for h in holdings])
    for h, (price, value) in zip(holdings, results):
        h["currentPrice"] = price
        h["currentValue"] = value

    return _text(holdings)


async def _get_watchlist() -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("watchlist").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_market_indices() -> dict:
    loop = asyncio.get_running_loop()
    return _text(await loop.run_in_executor(None, get_indices))


async def _get_stock_quote(stock_id: str) -> dict:
    return _text(await get_quote(stock_id))


async def _get_snapshots(year: int | None, limit: int, start_date: str | None, end_date: str | None) -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        if start_date or end_date:
            from_date = start_date or "2000-01-01"
            to_date   = end_date   or "9999-12-31"
        elif year:
            from_date = f"{year}-01-01"
            to_date   = f"{year}-12-31"
        else:
            from_date = "2000-01-01"
            to_date   = "9999-12-31"
        docs = (
            db.collection("daily_snapshots")
            .where(filter=FieldFilter("date", ">=", from_date))
            .where(filter=FieldFilter("date", "<=", to_date))
            .order_by("date", direction="DESCENDING")
            .limit(limit)
            .get()
        )
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in docs]

    return _text(await loop.run_in_executor(None, _read))


async def _get_tags() -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("tags").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_rebalance_rules() -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        doc = db.collection("rebalance_rules").document("main").get()
        return _convert_keys(doc.to_dict()) if doc.exists else {}

    return _text(await loop.run_in_executor(None, _read))


async def _get_foreign_assets() -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("foreign_assets").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_asset_tags() -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("asset_tags").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_tag_correlation_matrix() -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        doc = db.collection("tag_correlation_matrix").document("main").get()
        if not doc.exists:
            return {
                "lastUpdated": datetime.now(tz=timezone.utc).isoformat(),
                "entries": [],
                "previousEntries": None,
            }
        return _convert_keys(doc.to_dict())

    return _text(await loop.run_in_executor(None, _read))


async def _get_transactions(stock_id: str | None) -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        q = db.collection("transactions")
        if stock_id:
            q = q.where(filter=FieldFilter("stock_id", "==", stock_id))
        q = q.order_by("date", direction="ASCENDING")
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in q.get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_stock_history(stock_id: str, start_date: str | None, end_date: str | None, interval: str) -> dict:
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, get_history_range, stock_id, start_date, end_date, interval)
    return _text(data)


async def _get_stock_chip(stock_id: str, limit: int = 20) -> dict:
    """讀取 Firestore stock_chip/{stockId}/records（由 FinMind 每日同步寫入）"""
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        docs = (
            db.collection("stock_chip")
            .document(stock_id)
            .collection("records")
            .order_by("date", direction="DESCENDING")
            .limit(limit)
            .get()
        )
        rows = []
        for doc in docs:
            d = doc.to_dict()
            rows.append({
                "stockId": stock_id,
                "date":    d.get("date", ""),
                "foreign": d.get("foreign", 0),
                "trust":   d.get("trust",   0),
                "dealer":  d.get("dealer",  0),
            })
        rows.reverse()   # 升冪（舊→新）
        return rows

    return _text(await loop.run_in_executor(None, _read))


async def _get_stock_fundamental(stock_id: str) -> dict:
    """讀取 Firestore stock_fundamentals/{stockId}（由 FinMind 每日同步寫入）"""
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        doc = db.collection("stock_fundamentals").document(stock_id).get()
        if not doc.exists:
            return {"stockId": stock_id, "updatedAt": None}
        return _convert_keys(doc.to_dict())

    return _text(await loop.run_in_executor(None, _read))


async def _query_stock_fundamental(stock_id: str) -> dict:
    """直接呼叫 FinMind API 查詢基本面（任意股票，非 Firestore 快取）"""
    loop = asyncio.get_running_loop()
    from services.finmind import build_stock_fundamental
    data = await loop.run_in_executor(None, build_stock_fundamental, stock_id)
    return _text(_convert_keys(data))


async def _query_stock_chip(stock_id: str, start_date: str | None, limit: int) -> dict:
    """直接呼叫 FinMind API 查詢三大法人（任意股票，非 Firestore 快取）"""
    loop = asyncio.get_running_loop()
    from services.finmind import fetch_chip, _recent
    effective_start = start_date or _recent(30)
    rows = await loop.run_in_executor(None, fetch_chip, stock_id, effective_start)
    return _text(rows[:limit])


async def _get_rebalance_snapshots(limit: int) -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        db = get_db()
        docs = (
            db.collection("rebalance_snapshots")
            .order_by("created_at", direction="DESCENDING")
            .limit(limit)
            .get()
        )
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in docs]

    return _text(await loop.run_in_executor(None, _read))


async def _get_portfolio_tag_analysis() -> dict:
    loop = asyncio.get_running_loop()

    def _read_all():
        db = get_db()
        holdings   = [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("holdings").get()]
        asset_tags = [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("asset_tags").get()]
        tags       = [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("tags").get()]
        return holdings, asset_tags, tags

    holdings, asset_tags, tags = await loop.run_in_executor(None, _read_all)

    # 並行取各持股報價
    async def _fetch_price(h):
        sid = h.get("stockId") or h.get("id", "")
        if not sid:
            return sid, None
        try:
            q = await get_quote(sid)
            return sid, q.get("price")
        except Exception:
            return sid, None

    price_map = {sid: p for sid, p in await asyncio.gather(*[_fetch_price(h) for h in holdings]) if p is not None}

    # 各持股市值
    holding_values: dict[str, dict] = {}
    for h in holdings:
        sid    = h.get("stockId") or h.get("id", "")
        price  = price_map.get(sid)
        shares = float(h.get("sharesHeld", 0) or 0)
        if sid and price and shares > 0:
            holding_values[sid] = {"stockName": h.get("stockName") or sid, "value": shares * price}

    total_value = sum(v["value"] for v in holding_values.values())
    if total_value <= 0:
        return _text({"totalValue": 0.0, "tags": []})

    # asset_tags 映射：{stockCode: [{tagName, weightRatio}]}
    stock_tag_map: dict[str, list] = {}
    for at in asset_tags:
        sc = at.get("stockCode", "")
        if sc:
            stock_tag_map.setdefault(sc, []).append({
                "tagName":     at.get("tagName", ""),
                "weightRatio": float(at.get("weightRatio", 0) or 0),
            })

    # tags 映射
    tag_info = {t.get("name", ""): t for t in tags}

    # 累積各 Tag 配置
    tag_accum: dict[str, dict] = {}
    for sc, hv in holding_values.items():
        for st in stock_tag_map.get(sc, []):
            tag_name     = st["tagName"]
            weight_ratio = st["weightRatio"]
            contribution = (hv["value"] * weight_ratio) / total_value
            if tag_name not in tag_accum:
                tag_accum[tag_name] = {"actualWeight": 0.0, "holdings": []}
            tag_accum[tag_name]["actualWeight"] += contribution
            tag_accum[tag_name]["holdings"].append({
                "stockCode":    sc,
                "stockName":    hv["stockName"],
                "weightRatio":  weight_ratio,
                "contribution": round(contribution, 6),
            })

    result_tags = []
    for tag_name, td in tag_accum.items():
        info   = tag_info.get(tag_name, {})
        target = info.get("targetWeight")
        actual = round(td["actualWeight"], 6)
        result_tags.append({
            "tagName":      tag_name,
            "targetWeight": target,
            "actualWeight": actual,
            "deviation":    round(actual - target, 6) if target is not None else None,
            "baseRisk":     info.get("baseRisk"),
            "dynamicRisk":  info.get("dynamicRisk"),
            "holdings":     sorted(td["holdings"], key=lambda x: x["contribution"], reverse=True),
        })

    result_tags.sort(key=lambda x: x["actualWeight"], reverse=True)
    return _text({"totalValue": round(total_value, 2), "tags": result_tags})


# ─── M9 handlers ──────────────────────────────────────────────────────────────

_VALID_DIRS = {"both", "upper_only", "lower_only"}


async def _update_tag(arguments: dict) -> dict:
    tag_id = str(arguments.get("tag_id", "")).strip()
    if not tag_id:
        return _text({"error": "tag_id 為必填"})

    dry_run = bool(arguments.get("dry_run", True))

    has_base_risk          = "base_risk"          in arguments
    has_target_weight      = "target_weight"      in arguments
    has_direction          = "direction"          in arguments
    has_conc_limit         = "concentration_limit" in arguments

    base_risk    = arguments.get("base_risk")
    target_weight = arguments.get("target_weight")
    direction    = arguments.get("direction")
    conc_limit   = arguments.get("concentration_limit")

    # Range validation
    if has_base_risk and base_risk is not None:
        if not isinstance(base_risk, (int, float)) or not (0.0 <= float(base_risk) <= 1.0):
            return _text({"error": "base_risk must be between 0.0 and 1.0"})
        base_risk = float(base_risk)
    if has_target_weight and target_weight is not None:
        if not isinstance(target_weight, (int, float)) or not (0.0 <= float(target_weight) <= 1.0):
            return _text({"error": "target_weight must be between 0.0 and 1.0"})
        target_weight = float(target_weight)
    if has_conc_limit and conc_limit is not None:
        if not isinstance(conc_limit, (int, float)) or not (0.0 <= float(conc_limit) <= 1.0):
            return _text({"error": "concentration_limit must be between 0.0 and 1.0"})
        conc_limit = float(conc_limit)
    if has_direction and direction is not None:
        if direction not in _VALID_DIRS:
            return _text({"error": "direction must be one of: both, upper_only, lower_only"})

    loop = asyncio.get_running_loop()

    def _run():
        db = get_db()
        ref = db.collection("tags").document(tag_id)
        doc = ref.get()
        if not doc.exists:
            return {"_not_found": True}

        d = doc.to_dict()
        tag_name = d.get("name", "")
        changes: dict = {}
        no_change: list = []
        patch: dict = {}

        if has_base_risk and base_risk is not None:
            old = d.get("base_risk", 0)
            if old != base_risk:
                changes["baseRisk"] = {"before": old, "after": base_risk}
                patch["base_risk"] = base_risk
            else:
                no_change.append("baseRisk")

        if has_target_weight:
            old = d.get("target_weight")
            if old != target_weight:
                changes["targetWeight"] = {"before": old, "after": target_weight}
                patch["target_weight"] = target_weight
            else:
                no_change.append("targetWeight")

        if has_direction and direction is not None:
            old = d.get("trigger_direction", "both")
            if old != direction:
                changes["direction"] = {"before": old, "after": direction}
                patch["trigger_direction"] = direction
            else:
                no_change.append("direction")

        if has_conc_limit:
            old = d.get("concentration_limit")
            if old != conc_limit:
                changes["concentrationLimit"] = {"before": old, "after": conc_limit}
                patch["concentration_limit"] = conc_limit
            else:
                no_change.append("concentrationLimit")

        if dry_run:
            return {
                "dryRun": True,
                "tagId": tag_id,
                "tagName": tag_name,
                "changes": changes,
                "noChange": no_change,
                "message": "預覽模式，未寫入。確認後以 dry_run=false 重新呼叫以套用變更。",
            }

        if patch:
            ref.update(patch)

        return {
            "dryRun": False,
            "tagId": tag_id,
            "tagName": tag_name,
            "applied": {k: v["after"] for k, v in changes.items()},
            "_do_recalc": True,
        }

    result = await loop.run_in_executor(None, _run)

    if result.get("_not_found"):
        return _text({"error": f"Tag not found: {tag_id}"})

    if not dry_run and result.pop("_do_recalc", False):
        def _recalc():
            from services.tag_risk_service import recalculate_dynamic_risk
            db2 = get_db()
            ms_doc = db2.collection("market_state").document("main").get()
            mstate = ms_doc.to_dict().get("current", "neutral") if ms_doc.exists else "neutral"
            recalculate_dynamic_risk(mstate)
        await loop.run_in_executor(None, _recalc)
        result["message"] = "已更新，dynamicRisk 已重算。"

    return _text(result)


async def _set_asset_tags(arguments: dict) -> dict:
    stock_code  = str(arguments.get("stock_code", "")).strip()
    tags_input  = arguments.get("tags", [])
    dry_run     = bool(arguments.get("dry_run", True))

    if not stock_code:
        return _text({"error": "stock_code 為必填"})
    if not isinstance(tags_input, list) or len(tags_input) == 0:
        return _text({"error": "tags 陣列不可為空"})

    # Validate each item
    for t in tags_input:
        wr = t.get("weight_ratio")
        if isinstance(wr, bool) or not isinstance(wr, int) or not (1 <= wr <= 100):
            return _text({"error": "weight_ratio 必須為 1–100 的整數"})

    # Check duplicate tag_names
    tag_names = [t.get("tag_name", "") for t in tags_input]
    if len(tag_names) != len(set(tag_names)):
        return _text({"error": "tags 內有重複的 tag_name"})

    # Validate sum
    total_weight = sum(t.get("weight_ratio", 0) for t in tags_input)
    if total_weight != 100:
        return _text({
            "error": "sum(weight_ratio) 必須等於 100",
            "totalWeightRatio": total_weight,
            "diff": total_weight - 100,
        })

    loop = asyncio.get_running_loop()

    def _run():
        db = get_db()

        # 1. stock_code 必須存在於 holdings
        if not db.collection("holdings").document(stock_code).get().exists:
            return {"_not_found": True, "_msg": f"stock_code not found in holdings: {stock_code}"}

        # 2. 所有 tag_name 必須存在於 tags
        missing = []
        for tn in tag_names:
            snap = db.collection("tags").where(
                filter=FieldFilter("name", "==", tn)
            ).limit(1).get()
            if not list(snap):
                missing.append(tn)
        if missing:
            return {"_missing_tags": missing}

        # 3. 取現有 asset_tags（此股票）
        current_docs = db.collection("asset_tags").where(
            filter=FieldFilter("stock_code", "==", stock_code)
        ).get()
        current_map = {
            doc.to_dict()["tag_name"]: {
                "doc_id": doc.id,
                "weight_ratio": doc.to_dict()["weight_ratio"],
            }
            for doc in current_docs
        }

        input_map = {t["tag_name"]: t["weight_ratio"] for t in tags_input}

        # 4. Diff
        added, updated, removed, unchanged = [], [], [], []
        for tn, wr in input_map.items():
            if tn not in current_map:
                added.append({"tagName": tn, "weightRatio": wr})
            elif current_map[tn]["weight_ratio"] != wr:
                updated.append({"tagName": tn, "before": current_map[tn]["weight_ratio"], "after": wr})
            else:
                unchanged.append({"tagName": tn, "weightRatio": wr})
        for tn, info in current_map.items():
            if tn not in input_map:
                removed.append({"tagName": tn, "weightRatio": info["weight_ratio"]})

        diff = {"added": added, "updated": updated, "removed": removed, "unchanged": unchanged}

        if dry_run:
            return {
                "dryRun": True,
                "stockCode": stock_code,
                "totalWeightRatio": 100,
                "diff": diff,
                "message": "預覽模式，總配比 100%，可套用。",
            }

        # dry_run=false：Firestore batch write
        batch = db.batch()
        for item in added:
            ref = db.collection("asset_tags").document()
            batch.set(ref, {
                "stock_code": stock_code,
                "tag_name": item["tagName"],
                "weight_ratio": item["weightRatio"],
            })
        for item in updated:
            doc_id = current_map[item["tagName"]]["doc_id"]
            batch.update(db.collection("asset_tags").document(doc_id), {"weight_ratio": item["after"]})
        for item in removed:
            doc_id = current_map[item["tagName"]]["doc_id"]
            batch.delete(db.collection("asset_tags").document(doc_id))
        batch.commit()

        result_tags = [{"tagName": tn, "weightRatio": wr} for tn, wr in input_map.items()]
        return {
            "dryRun": False,
            "stockCode": stock_code,
            "totalWeightRatio": 100,
            "diff": diff,
            "tags": result_tags,
            "message": "已套用，Tag 配置更新完成。",
        }

    result = await loop.run_in_executor(None, _run)

    if result.get("_not_found"):
        return _text({"error": result["_msg"]})
    if result.get("_missing_tags"):
        return _text({"error": f"Tag(s) not found: {', '.join(result['_missing_tags'])}"})

    return _text(result)


# ─── M10/M13 handlers ────────────────────────────────────────────────────────

_VALID_TRADE_TYPES = {"entry", "add", "reduce", "exit", "stop_loss", "take_profit", "watch"}
_VALID_CONFIDENCE  = {"high", "medium", "low"}
_VALID_TIMEFRAME   = {"short", "medium", "long"}
_CHIP_RULE_TYPES   = frozenset({"chip_dealer_buy", "chip_foreign_buy", "chip_trust_buy"})


def _compute_risk_reward(trade_type: str, ref_price: float, stop_loss, tgt_low) -> float | None:
    """M-1: 計算風報比，語義不適用或數值異常時回 None"""
    if trade_type in ("watch", "exit"):
        return None
    if stop_loss is None or tgt_low is None:
        return None
    denom = ref_price - float(stop_loss)
    if denom <= 0:
        return None
    if float(tgt_low) <= ref_price:
        return None
    return round((float(tgt_low) - ref_price) / denom, 2)


async def _save_trading_strategy(arguments: dict) -> dict:
    from datetime import datetime, timezone, timedelta

    stock_code             = str(arguments.get("stock_code", "")).strip()
    stock_name             = str(arguments.get("stock_name", "")).strip()
    trade_type             = str(arguments.get("trade_type", "")).strip()
    reference_price        = arguments.get("reference_price")
    stop_loss_price        = arguments.get("stop_loss_price")
    target_price_low       = arguments.get("target_price_low")
    target_price_high      = arguments.get("target_price_high")
    confidence             = str(arguments.get("confidence", "")).strip()
    timeframe              = str(arguments.get("timeframe", "")).strip()
    summary                = str(arguments.get("summary", "")).strip()
    trigger_condition      = str(arguments.get("trigger_condition") or "")
    invalidation_condition = str(arguments.get("invalidation_condition") or "")
    expires_at             = arguments.get("expires_at")
    tranches_input         = arguments.get("tranches")       # 新格式
    trigger_price          = arguments.get("trigger_price")  # deprecated，向後相容

    # ── 基本驗證 ──────────────────────────────────────────────────────────────
    if not stock_code:
        return _text({"error": "stock_code 為必填"})
    if not stock_name:
        return _text({"error": "stock_name 為必填"})
    if trade_type not in _VALID_TRADE_TYPES:
        return _text({"error": "trade_type 必須為 entry|add|reduce|exit|stop_loss|take_profit|watch"})
    if reference_price is None:
        return _text({"error": "reference_price 為必填"})
    if confidence not in _VALID_CONFIDENCE:
        return _text({"error": "confidence 必須為 high|medium|low"})
    if timeframe not in _VALID_TIMEFRAME:
        return _text({"error": "timeframe 必須為 short|medium|long"})
    if not summary:
        return _text({"error": "summary 為必填"})
    if len(summary) > 100:
        return _text({"error": "summary 不可超過 100 字"})
    if tranches_input is None and trigger_price is None:
        return _text({"error": "tranches 或 trigger_price（deprecated）至少需提供一項"})

    reference_price = float(reference_price)

    # ── 建立 Firestore tranches ───────────────────────────────────────────────
    if tranches_input is not None:
        if not isinstance(tranches_input, list) or len(tranches_input) < 1:
            return _text({"error": "tranches 至少需 1 筆"})
        if len(tranches_input) > 4:
            return _text({"error": "tranches 最多 4 批"})
        if target_price_high is not None and target_price_low is not None:
            if float(target_price_high) < float(target_price_low):
                return _text({"error": "target_price_high 必須 >= target_price_low"})
        if trade_type != "watch":
            size_sum = sum(float(t.get("size_ratio", 0)) for t in tranches_input)
            if not (0.99 <= size_sum <= 1.01):
                return _text({
                    "error": "所有 tranches 的 size_ratio 合計必須為 1.0（允許 ±0.01）",
                    "sum":   round(size_sum, 4),
                })

        tranches_fs = []
        for t in tranches_input:
            rules = t.get("trigger_rules") or []
            # 只初始化 chip_* 和 manual 的 rule_statuses；price 類不存 Firestore（H-2）
            rule_statuses: dict = {}
            for r in rules:
                rtype = r.get("type", "")
                if rtype in _CHIP_RULE_TYPES or rtype == "manual":
                    rule_statuses[rtype] = None  # 初始 null，等批次評估
            # 過濾 triggerRules 只保留允許欄位
            clean_rules = []
            for r in rules:
                entry: dict = {"type": r["type"]}
                if "value" in r:
                    entry["value"] = r["value"]
                if "period" in r:
                    entry["period"] = r["period"]
                clean_rules.append(entry)
            tranches_fs.append({
                "batch":             int(t.get("batch", 1)),
                "price_low":         float(t.get("price_low", 0)),
                "price_high":        float(t.get("price_high", 0)),
                "size_ratio":        float(t.get("size_ratio", 0)),
                "shares":            int(t.get("shares", 0)),
                "trigger_condition": str(t.get("trigger_condition", "")),
                "trigger_rules":     clean_rules,
                "rule_statuses":     rule_statuses,
                "rule_evaluated_at": None,
                "status":            str(t.get("status", "pending")),
            })
    else:
        # Backward compat：trigger_price → tranches[0]
        tranches_fs = [{
            "batch":             1,
            "price_low":         float(trigger_price),
            "price_high":        float(trigger_price),
            "size_ratio":        1.0,
            "shares":            0,
            "trigger_condition": "",
            "trigger_rules":     [],
            "rule_statuses":     {},
            "rule_evaluated_at": None,
            "status":            "pending",
        }]

    risk_reward_ratio = _compute_risk_reward(trade_type, reference_price, stop_loss_price, target_price_low)

    tz_taipei  = timezone(timedelta(hours=8))
    created_at = datetime.now(tz=tz_taipei).isoformat()

    doc_data = {
        "stock_code":             stock_code,
        "stock_name":             stock_name,
        "trade_type":             trade_type,
        "tranches":               tranches_fs,
        "reference_price":        reference_price,
        "stop_loss_price":        float(stop_loss_price)   if stop_loss_price   is not None else None,
        "target_price_low":       float(target_price_low)  if target_price_low  is not None else None,
        "target_price_high":      float(target_price_high) if target_price_high is not None else None,
        "risk_reward_ratio":      risk_reward_ratio,
        "trigger_condition":      trigger_condition,
        "invalidation_condition": invalidation_condition,
        "confidence":             confidence,
        "timeframe":              timeframe,
        "summary":                summary,
        "status":                 "active",
        "dismissed":              False,
        "created_at":             created_at,
        "expires_at":             expires_at,
        # 保留 trigger_price 供舊版 Firestore 讀取（向後相容）
        "trigger_price":          float(trigger_price) if trigger_price is not None else None,
    }

    loop = asyncio.get_running_loop()

    def _write():
        from routers.trading_strategies import _to_dto  # 延遲 import，避免循環
        get_db().collection("trading_strategies").document(stock_code).set(doc_data)
        return _to_dto(stock_code, doc_data)

    return _text(await loop.run_in_executor(None, _write))


async def _get_trading_strategy(stock_code: str) -> dict:
    loop = asyncio.get_running_loop()

    def _read():
        from routers.trading_strategies import _to_dto  # 延遲 import，rule_statuses key 不做 camelCase
        doc = get_db().collection("trading_strategies").document(stock_code).get()
        if not doc.exists:
            return {"stockCode": stock_code, "strategy": None}
        return {"stockCode": stock_code, "strategy": _to_dto(doc.id, doc.to_dict())}

    return _text(await loop.run_in_executor(None, _read))


# ─── Dispatch ─────────────────────────────────────────────────────────────────

async def call_tool(name: str, arguments: dict) -> dict:
    if name == "get_holdings":
        return await _get_holdings()
    if name == "get_watchlist":
        return await _get_watchlist()
    if name == "get_market_indices":
        return await _get_market_indices()
    if name == "get_stock_quote":
        sid = str(arguments.get("stock_id", "")).strip()
        if not sid:
            return _text({"error": "stock_id 為必填"})
        return await _get_stock_quote(sid)
    if name == "get_snapshots":
        year       = arguments.get("year")
        start_date = arguments.get("start_date")
        end_date   = arguments.get("end_date")
        has_range  = bool(start_date or end_date)
        limit = min(int(arguments.get("limit", 365 if has_range else 30)), 365)
        return await _get_snapshots(year, limit, start_date, end_date)
    if name == "get_tags":
        return await _get_tags()
    if name == "get_rebalance_rules":
        return await _get_rebalance_rules()
    if name == "get_foreign_assets":
        return await _get_foreign_assets()
    if name == "get_asset_tags":
        return await _get_asset_tags()
    if name == "get_tag_correlation_matrix":
        return await _get_tag_correlation_matrix()
    if name == "get_transactions":
        sid = str(arguments.get("stock_id", "")).strip() or None
        return await _get_transactions(sid)
    if name == "get_stock_history":
        sid = str(arguments.get("stock_id", "")).strip()
        if not sid:
            return _text({"error": "stock_id 為必填"})
        return await _get_stock_history(
            sid,
            start_date=arguments.get("start_date"),
            end_date=arguments.get("end_date"),
            interval=str(arguments.get("interval", "1d")),
        )
    if name == "get_stock_chip":
        sid = str(arguments.get("stock_id", "")).strip()
        if not sid:
            return _text({"error": "stock_id 為必填"})
        limit = min(int(arguments.get("limit", 20)), 60)
        return await _get_stock_chip(sid, limit)
    if name == "get_rebalance_snapshots":
        limit = min(int(arguments.get("limit", 5)), 20)
        return await _get_rebalance_snapshots(limit)
    if name == "get_portfolio_tag_analysis":
        return await _get_portfolio_tag_analysis()
    if name == "get_stock_fundamental":
        sid = str(arguments.get("stock_id", "")).strip()
        if not sid:
            return _text({"error": "stock_id 為必填"})
        return await _get_stock_fundamental(sid)
    if name == "query_stock_fundamental":
        sid = str(arguments.get("stock_id", "")).strip()
        if not sid:
            return _text({"error": "stock_id 為必填"})
        return await _query_stock_fundamental(sid)
    if name == "query_stock_chip":
        sid = str(arguments.get("stock_id", "")).strip()
        if not sid:
            return _text({"error": "stock_id 為必填"})
        limit = min(int(arguments.get("limit", 20)), 60)
        return await _query_stock_chip(sid, arguments.get("start_date"), limit)
    # ── M9
    if name == "update_tag":
        return await _update_tag(arguments)
    if name == "set_asset_tags":
        return await _set_asset_tags(arguments)
    # ── M10
    if name == "save_trading_strategy":
        return await _save_trading_strategy(arguments)
    if name == "get_trading_strategy":
        sid = str(arguments.get("stock_code", "")).strip()
        if not sid:
            return _text({"error": "stock_code 為必填"})
        return await _get_trading_strategy(sid)
    return _text({"error": f"未知工具：{name}"})
