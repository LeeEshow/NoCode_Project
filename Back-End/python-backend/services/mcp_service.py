import asyncio
import json
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db
from services.yahoo_finance import get_indices, get_quote

MCP_TOOLS = [
    {
        "name": "get_holdings",
        "description": "取得庫存持股清單，包含股票代號、持股數量、平均成本、已實現損益等。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_watchlist",
        "description": "取得自選股（關注清單），包含股票代號、名稱、目標價、備註。",
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
        "description": "取得每日資產快照歷史，可指定年份或筆數上限（預設最新 30 筆）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "year":  {"type": "integer", "description": "篩選年份，例如 2025（選填）"},
                "limit": {"type": "integer", "description": "最多回傳筆數，預設 30（選填）"},
            },
            "required": [],
        },
    },
    {
        "name": "get_tags",
        "description": "取得所有標籤定義及其基礎風險值、動態風險值與市場狀態 Preset。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_rebalance_rules",
        "description": "取得再平衡規則設定，包含閾值、波動係數、流動性上限等參數。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_foreign_assets",
        "description": "取得外幣及債券資產清單，包含貨幣、金額與換算台幣後的市值。",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
]


def _text(data) -> dict:
    return {
        "content": [
            {"type": "text", "text": json.dumps(data, ensure_ascii=False, default=str)}
        ]
    }


async def _get_holdings() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [{"id": doc.id, **doc.to_dict()} for doc in db.collection("holdings").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_watchlist() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [{"id": doc.id, **doc.to_dict()} for doc in db.collection("watchlist").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_market_indices() -> dict:
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_indices)
    return _text(data)


async def _get_stock_quote(stock_id: str) -> dict:
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_quote, stock_id)
    return _text(data)


async def _get_snapshots(year: int | None, limit: int) -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        from_date = f"{year}-01-01" if year else "2000-01-01"
        to_date   = f"{year}-12-31" if year else "9999-12-31"
        docs = (
            db.collection("daily_snapshots")
            .where(filter=FieldFilter("date", ">=", from_date))
            .where(filter=FieldFilter("date", "<=", to_date))
            .order_by("date", direction="DESCENDING")
            .limit(limit)
            .get()
        )
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]

    return _text(await loop.run_in_executor(None, _read))


async def _get_tags() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [{"id": doc.id, **doc.to_dict()} for doc in db.collection("tags").get()]

    return _text(await loop.run_in_executor(None, _read))


async def _get_rebalance_rules() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        doc = db.collection("rebalance_rules").document("main").get()
        return doc.to_dict() if doc.exists else {}

    return _text(await loop.run_in_executor(None, _read))


async def _get_foreign_assets() -> dict:
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        return [{"id": doc.id, **doc.to_dict()} for doc in db.collection("foreign_assets").get()]

    return _text(await loop.run_in_executor(None, _read))


async def call_tool(name: str, arguments: dict) -> dict:
    if name == "get_holdings":
        return await _get_holdings()
    if name == "get_watchlist":
        return await _get_watchlist()
    if name == "get_market_indices":
        return await _get_market_indices()
    if name == "get_stock_quote":
        stock_id = str(arguments.get("stock_id", "")).strip()
        if not stock_id:
            return _text({"error": "stock_id 為必填"})
        return await _get_stock_quote(stock_id)
    if name == "get_snapshots":
        year = arguments.get("year")
        limit = min(int(arguments.get("limit", 30)), 365)
        return await _get_snapshots(year, limit)
    if name == "get_tags":
        return await _get_tags()
    if name == "get_rebalance_rules":
        return await _get_rebalance_rules()
    if name == "get_foreign_assets":
        return await _get_foreign_assets()
    return _text({"error": f"未知工具：{name}"})
