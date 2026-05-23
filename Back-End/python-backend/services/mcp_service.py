import asyncio
import json
from datetime import datetime, timezone
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db
from services.yahoo_finance import get_indices, get_quote, get_chip, get_history_range


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
        "description": "取得個股三大法人近 20 個交易日買賣超資料（單位：張），來源為 TWSE T86。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "stock_id": {"type": "string", "description": "股票代號（必填）"},
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
]


# ─── Tool 實作 ─────────────────────────────────────────────────────────────────

async def _get_holdings() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("holdings").get()]

    holdings = await loop.run_in_executor(None, _read)

    async def _fetch_price(h):
        sid = h.get("stockId") or h.get("id", "")
        if not sid:
            return None, None
        try:
            q = await loop.run_in_executor(None, get_quote, sid)
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
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("watchlist").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_market_indices() -> dict:
    loop = asyncio.get_event_loop()
    return _text(await loop.run_in_executor(None, get_indices))


async def _get_stock_quote(stock_id: str) -> dict:
    loop = asyncio.get_event_loop()
    return _text(await loop.run_in_executor(None, get_quote, stock_id))


async def _get_snapshots(year: int | None, limit: int, start_date: str | None, end_date: str | None) -> dict:
    loop = asyncio.get_event_loop()

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
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("tags").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_rebalance_rules() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        doc = db.collection("rebalance_rules").document("main").get()
        return _convert_keys(doc.to_dict()) if doc.exists else {}

    return _text(await loop.run_in_executor(None, _read))


async def _get_foreign_assets() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("foreign_assets").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_asset_tags() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in db.collection("asset_tags").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_tag_correlation_matrix() -> dict:
    loop = asyncio.get_event_loop()

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
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        q = db.collection("transactions")
        if stock_id:
            q = q.where(filter=FieldFilter("stock_id", "==", stock_id))
        q = q.order_by("date", direction="ASCENDING")
        return [_convert_keys({"id": doc.id, **doc.to_dict()}) for doc in q.get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_stock_history(stock_id: str, start_date: str | None, end_date: str | None, interval: str) -> dict:
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_history_range, stock_id, start_date, end_date, interval)
    return _text(data)


async def _get_stock_chip(stock_id: str) -> dict:
    loop = asyncio.get_event_loop()
    return _text(await loop.run_in_executor(None, get_chip, stock_id))


async def _get_rebalance_snapshots(limit: int) -> dict:
    loop = asyncio.get_event_loop()

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
    loop = asyncio.get_event_loop()

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
            q = await loop.run_in_executor(None, get_quote, sid)
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
        return await _get_stock_chip(sid)
    if name == "get_rebalance_snapshots":
        limit = min(int(arguments.get("limit", 5)), 20)
        return await _get_rebalance_snapshots(limit)
    if name == "get_portfolio_tag_analysis":
        return await _get_portfolio_tag_analysis()
    return _text({"error": f"未知工具：{name}"})
