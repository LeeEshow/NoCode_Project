"""動態風險重算服務（忠實對應 Node.js tagRiskService.ts）"""
from __future__ import annotations
from core.executors import get_executor
from services.firestore import get_db
from services.yahoo_finance import get_history_closes


# ─── 數學工具 ──────────────────────────────────────────────────────────────────

def _pop_std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5


def _daily_returns(closes: list[float]) -> list[float]:
    out = []
    for i in range(1, len(closes)):
        if closes[i - 1] > 0:
            out.append((closes[i] - closes[i - 1]) / closes[i - 1])
    return out


def _clamp(v: float) -> float:
    return max(0.0, min(3.0, v))


def _r2(v: float) -> float:
    return round(v, 2)


# ─── 核心計算 ──────────────────────────────────────────────────────────────────

def recalculate_dynamic_risk(market_state: str) -> dict:
    db = get_db()

    # 讀取 tags / asset_tags / holdings
    tags_snap      = db.collection("tags").order_by("name").get()
    asset_tags_snap = db.collection("asset_tags").get()
    holdings_snap  = db.collection("holdings").get()

    tags = []
    for doc in tags_snap:
        d = doc.to_dict()
        msp_raw = d.get("market_state_presets")
        msp = None
        if msp_raw:
            msp = {
                "riskOn":       msp_raw.get("risk_on"),
                "riskOff":      msp_raw.get("risk_off"),
                "liquidityDry": msp_raw.get("liquidity_dry"),
            }
        tags.append({
            "id":       doc.id,
            "name":     d.get("name"),
            "baseRisk": d.get("base_risk", 0),
            "marketStatePresets": msp,
        })

    # 活躍持股 set（sharesHeld > 0）
    active_set = {
        doc.to_dict().get("stock_id", doc.id)
        for doc in holdings_snap
        if (doc.to_dict().get("shares_held") or 0) > 0
    }

    # tagName → [{stockCode, weightRatio}]
    tag_holdings_map: dict[str, list[dict]] = {}
    for doc in asset_tags_snap:
        d = doc.to_dict()
        stock_code = d.get("stock_code", "")
        if stock_code not in active_set:
            continue
        tag_name = d.get("tag_name", "")
        lst = tag_holdings_map.setdefault(tag_name, [])
        lst.append({"stockCode": stock_code, "weightRatio": d.get("weight_ratio", 0)})

    # 收集需要歷史資料的股票
    needed = set()
    for items in tag_holdings_map.values():
        for item in items:
            needed.add(item["stockCode"])

    # 並行取得 90 日收盤價（使用共用 executor）
    closes_map: dict[str, list[float]] = {}
    if needed:
        executor = get_executor()
        futures = {executor.submit(get_history_closes, sc): sc for sc in needed}
        for fut, sc in futures.items():
            try:
                closes = fut.result()
                if closes:
                    closes_map[sc] = closes
            except Exception:
                pass

    # 計算各 Tag 的 vol_ratio → presets → dynamicRisk
    updates = []
    skipped = 0

    for tag in tags:
        holdings = tag_holdings_map.get(tag["name"], [])
        if not holdings:
            skipped += 1
            continue

        stock_series = []
        for item in holdings:
            closes = closes_map.get(item["stockCode"])
            if not closes or len(closes) < 2:
                continue
            stock_series.append({
                "returns": _daily_returns(closes),
                "weight":  item["weightRatio"] / 100,
            })

        if not stock_series:
            skipped += 1
            continue

        min_len = min(len(s["returns"]) for s in stock_series)
        tag_returns = []
        for i in range(min_len):
            r = sum(s["weight"] * s["returns"][i] for s in stock_series)
            tag_returns.append(r)

        vol_ratio = 1.0
        if len(tag_returns) >= 20:
            recent_vol = _pop_std(tag_returns[-20:])
            base_vol   = _pop_std(tag_returns)
            if base_vol > 0:
                vol_ratio = recent_vol / base_vol

        base_risk    = tag["baseRisk"]
        risk_on      = _r2(_clamp(base_risk * 1.3 * vol_ratio))
        risk_off     = _r2(_clamp(base_risk * 1.8 * vol_ratio))
        liquidity_dry = _r2(_clamp(base_risk * 2.5 * vol_ratio))

        if market_state == "risk-on":
            dynamic_risk = risk_on
        elif market_state == "risk-off":
            dynamic_risk = risk_off
        elif market_state == "liquidity-dry":
            dynamic_risk = liquidity_dry
        else:
            dynamic_risk = _r2(_clamp(base_risk * vol_ratio))

        updates.append({
            "id":          tag["id"],
            "dynamicRisk": dynamic_risk,
            "marketStatePresets": {
                "riskOn":       risk_on,
                "riskOff":      risk_off,
                "liquidityDry": liquidity_dry,
            },
        })

    if updates:
        batch = db.batch()
        for u in updates:
            ref = db.collection("tags").document(u["id"])
            batch.update(ref, {
                "dynamic_risk": u["dynamicRisk"],
                "market_state_presets": {
                    "risk_on":       u["marketStatePresets"]["riskOn"],
                    "risk_off":      u["marketStatePresets"]["riskOff"],
                    "liquidity_dry": u["marketStatePresets"]["liquidityDry"],
                },
            })
        batch.commit()

    return {"updatedCount": len(updates), "skippedCount": skipped}
