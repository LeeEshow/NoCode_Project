"""FinMind API service — 台股基本面 + 三大法人籌碼資料源。

免費版：600 req/day；FINMIND_TOKEN 未設定時使用匿名限額。
所有函式失敗一律回傳 None / []，不拋錯。
"""
import logging
import math
import time
from datetime import date, timedelta, datetime, timezone

import requests
from core.settings import get_settings
from google.cloud.firestore_v1.base_query import FieldFilter

logger = logging.getLogger(__name__)
FINMIND_BASE = "https://api.finmindtrade.com/api/v4/data"


# ─── 工具函式 ──────────────────────────────────────────────────────────────────

def _recent(days: int) -> str:
    """回傳 N 天前的日期字串 YYYY-MM-DD"""
    return (date.today() - timedelta(days=days)).strftime("%Y-%m-%d")


def _f(v, default=None):
    """安全轉 float：None / NaN / Inf → default"""
    if v is None:
        return default
    try:
        f = float(v)
        return default if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return default


# ─── 核心 HTTP 呼叫 ────────────────────────────────────────────────────────────

def _fm_get(dataset: str, stock_id: str, start_date: str, **kwargs) -> list[dict]:
    """呼叫 FinMind API 單一 dataset，失敗回空 list（不拋錯）"""
    token = get_settings().finmind_token
    params: dict = {
        "dataset":    dataset,
        "data_id":    stock_id,
        "start_date": start_date,
        **kwargs,
    }
    if token:
        params["token"] = token
    try:
        res = requests.get(FINMIND_BASE, params=params, timeout=15)
        res.raise_for_status()
        payload = res.json()
        if payload.get("status") != 200:
            logger.warning(
                "FinMind %s/%s: status=%s msg=%s",
                dataset, stock_id, payload.get("status"), payload.get("msg"),
            )
            return []
        return payload.get("data") or []
    except Exception as exc:
        logger.warning("FinMind %s/%s error: %s", dataset, stock_id, exc)
        return []


# ─── 個別 Dataset 取值 ─────────────────────────────────────────────────────────

def fetch_per(stock_id: str) -> dict | None:
    """TaiwanStockPER → 最新一筆 {PER, PBR, date}"""
    rows = _fm_get("TaiwanStockPER", stock_id, _recent(15))
    if not rows:
        return None
    return sorted(rows, key=lambda r: r.get("date", ""))[-1]


def fetch_dividend(stock_id: str) -> dict | None:
    """TaiwanStockDividend → 最新一筆。

    FinMind 欄位名：
    - 現金股利：CashEarningsDistribution
    - 除息交易日：CashExDividendTradingDate
    """
    rows = _fm_get("TaiwanStockDividend", stock_id, _recent(365 * 3))
    if not rows:
        return None
    return sorted(rows, key=lambda r: r.get("date", ""))[-1]


def fetch_financial(stock_id: str) -> dict | None:
    """TaiwanStockFinancialStatements → 最新季報 pivot dict。

    每列格式：{date, stock_id, type, value, origin_name}
    取最大 date 的所有列，以 type 為 key、value 為值合併回 dict。
    """
    rows = _fm_get("TaiwanStockFinancialStatements", stock_id, _recent(365 * 2))
    if not rows:
        return None
    latest_date = max(r.get("date", "") for r in rows)
    latest_rows = [r for r in rows if r.get("date") == latest_date]
    result: dict = {"date": latest_date}
    for r in latest_rows:
        key = r.get("type") or r.get("origin_name") or ""
        if key:
            result[key] = _f(r.get("value"))
    return result if len(result) > 1 else None


def fetch_month_revenue(stock_id: str) -> dict | None:
    """TaiwanStockMonthRevenue → {revenue, yoy} 最新月份 YoY(%)"""
    rows = _fm_get("TaiwanStockMonthRevenue", stock_id, _recent(400))
    if len(rows) < 2:
        return None
    rows_sorted = sorted(rows, key=lambda r: r.get("date", ""))
    latest = rows_sorted[-1]
    m = latest.get("revenue_month")
    y = latest.get("revenue_year")
    if not m or not y:
        return None
    prev_row = next(
        (r for r in reversed(rows_sorted[:-1])
         if r.get("revenue_month") == m and r.get("revenue_year") == y - 1),
        None,
    )
    rev_now  = _f(latest.get("revenue"), 0.0)
    rev_prev = _f(prev_row.get("revenue") if prev_row else None)
    yoy = round((rev_now - rev_prev) / rev_prev * 100, 2) if rev_prev else None
    return {"revenue": rev_now, "yoy": yoy}


def fetch_chip(stock_id: str, start_date: str) -> list[dict]:
    """TaiwanStockInstitutionalInvestorsBuySell → [{date, foreign, trust, dealer}]（張）

    FinMind name 英文對應：
    - 外資：Foreign_Investor + Foreign_Dealer_Self
    - 投信：Investment_Trust
    - 自營商：Dealer_self + Dealer_Hedging
    buy/sell 單位為股（股），除以 1000 換算為張。
    """
    rows = _fm_get("TaiwanStockInstitutionalInvestorsBuySell", stock_id, start_date)
    if not rows:
        return []
    day_map: dict[str, dict] = {}
    for r in rows:
        d = str(r.get("date", ""))[:10]
        if not d:
            continue
        if d not in day_map:
            day_map[d] = {"date": d, "foreign": 0, "trust": 0, "dealer": 0}
        buy  = int(_f(r.get("buy"),  0) or 0)
        sell = int(_f(r.get("sell"), 0) or 0)
        net  = buy - sell
        name = r.get("name", "")
        if name in ("Foreign_Investor", "Foreign_Dealer_Self"):
            day_map[d]["foreign"] += round(net / 1000)
        elif name == "Investment_Trust":
            day_map[d]["trust"]   += round(net / 1000)
        elif name in ("Dealer_self", "Dealer_Hedging"):
            day_map[d]["dealer"]  += round(net / 1000)
    return sorted(day_map.values(), key=lambda x: x["date"])


def fetch_stock_info(stock_id: str) -> dict | None:
    """TaiwanStockInfo → {stock_name, type, ...}"""
    rows = _fm_get("TaiwanStockInfo", stock_id, "2000-01-01")
    if not rows:
        return None
    # API 可能回傳全市場；找符合代號的那筆
    match = next(
        (r for r in rows if str(r.get("stock_id", "")).strip() == stock_id),
        rows[0],
    )
    return match


# ─── 基本面組合（供 finmind_sync router 與 MCP tool 共用） ─────────────────────

def build_stock_fundamental(stock_id: str) -> dict:
    """呼叫 FinMind + Yahoo v8，組合 StockProfile（snake_case 供 Firestore 寫入 / MCP 轉換）。

    回傳 snake_case dict；呼叫端若需 camelCase 請自行套 _convert_keys()。
    """
    from services.yahoo_finance import _yf_chart, resolve_symbol  # 延遲 import 避免循環

    now_iso = datetime.now(tz=timezone.utc).isoformat()

    per_data  = fetch_per(stock_id)
    div_data  = fetch_dividend(stock_id)
    fin_data  = fetch_financial(stock_id)
    rev_data  = fetch_month_revenue(stock_id)
    info_data = fetch_stock_info(stock_id)

    pe_ratio = _f(per_data.get("PER")) if per_data else None
    pb_ratio = _f(per_data.get("PBR")) if per_data else None

    eps        = _f(fin_data.get("EPS"))             if fin_data else None
    revenue_q  = _f(fin_data.get("Revenue"))          if fin_data else None
    gross_p    = _f(fin_data.get("GrossProfit"))      if fin_data else None
    op_income  = _f(fin_data.get("OperatingIncome"))  if fin_data else None
    net_income = _f(fin_data.get("IncomeAfterTaxes")) if fin_data else None

    gross_margin     = round(gross_p   / revenue_q * 100, 2) if gross_p   and revenue_q else None
    operating_margin = round(op_income / revenue_q * 100, 2) if op_income and revenue_q else None
    net_margin       = round(net_income/ revenue_q * 100, 2) if net_income and revenue_q else None
    roe = None  # FinMind 損益表無 Equity 欄位

    div_rate  = _f(div_data.get("CashEarningsDistribution")) if div_data else None
    ex_div_dt = div_data.get("CashExDividendTradingDate")    if div_data else None

    rev_growth  = _f(rev_data.get("yoy"))     if rev_data else None
    revenue_mon = _f(rev_data.get("revenue")) if rev_data else None
    revenue_final = revenue_mon if revenue_mon is not None else revenue_q

    name   = (info_data.get("stock_name") or info_data.get("name") or stock_id) if info_data else stock_id
    market = (info_data.get("type") or "") if info_data else ""

    market_cap = fifty_two_high = fifty_two_low = beta = book_value = dividend_yield = None
    try:
        symbol = resolve_symbol(stock_id)
        data   = _yf_chart(symbol, "1d", "1y")
        meta   = data.get("meta", {})
        market_cap     = _f(meta.get("marketCap"))
        fifty_two_high = _f(meta.get("fiftyTwoWeekHigh"))
        fifty_two_low  = _f(meta.get("fiftyTwoWeekLow"))
        beta           = _f(meta.get("beta"))
        price = _f(meta.get("regularMarketPrice"))
        if price and pb_ratio and pb_ratio > 0:
            book_value = round(price / pb_ratio, 2)
        if div_rate and price and price > 0:
            dividend_yield = round(div_rate / price * 100, 2)
    except Exception as exc:
        logger.warning("Yahoo v8 補充資料取失敗 %s: %s", stock_id, exc)

    payout_ratio = round(div_rate / eps * 100, 2) if div_rate and eps and eps != 0 else None

    return {
        "stock_id":            stock_id,
        "name":                name,
        "market":              market,
        "pe_ratio":            pe_ratio,
        "pb_ratio":            pb_ratio,
        "eps":                 eps,
        "book_value":          book_value,
        "dividend_yield":      dividend_yield,
        "dividend_rate":       div_rate,
        "payout_ratio":        payout_ratio,
        "ex_dividend_date":    ex_div_dt,
        "gross_margin":        gross_margin,
        "operating_margin":    operating_margin,
        "net_margin":          net_margin,
        "roe":                 roe,
        "market_cap":          market_cap,
        "revenue":             revenue_final,
        "revenue_growth":      rev_growth,
        "fifty_two_week_high": fifty_two_high,
        "fifty_two_week_low":  fifty_two_low,
        "beta":                beta,
        "updated_at":          now_iso,
    }


# ─── 批次同步到 Firestore（供 finmind_sync router 與 snapshot 背景任務共用） ──────

def sync_stocks_finmind(db, stock_ids: list[str], chip_days: int = 45) -> dict:
    """同步指定股票清單的基本面 + 三大法人籌碼至 Firestore。

    - 每股間隔 200ms 避免 FinMind rate limit
    - 個別股票失敗不中斷整批，記錄 errors 後繼續
    - chip_days：回補籌碼的天數範圍（預設 45 天）

    回傳 {"synced": int, "errors": [...]}
    """
    chip_start = (date.today() - timedelta(days=chip_days)).strftime("%Y-%m-%d")
    synced = 0
    errors: list[dict] = []

    for sid in stock_ids:
        try:
            # 1. 基本面 → stock_fundamentals/{stockId}
            fund = build_stock_fundamental(sid)
            db.collection("stock_fundamentals").document(sid).set(fund, merge=False)

            # 2. 籌碼 → stock_chip/{stockId}/records/{date}（整批覆蓋 chip_days 日）
            chip_rows = fetch_chip(sid, chip_start)
            chip_ref = (
                db.collection("stock_chip")
                .document(sid)
                .collection("records")
            )
            for row in chip_rows:
                chip_ref.document(row["date"]).set(
                    {
                        "date":       row["date"],
                        "foreign":    row["foreign"],
                        "trust":      row["trust"],
                        "dealer":     row["dealer"],
                        "updated_at": datetime.now(tz=timezone.utc).isoformat(),
                    },
                    merge=True,
                )

            synced += 1
            time.sleep(0.2)
        except Exception as exc:
            logger.error("FinMind sync 失敗 %s: %s", sid, exc)
            errors.append({"stockId": sid, "error": str(exc)})

    return {"synced": synced, "errors": errors}


# ─── M13：觸發條件自動評估 ──────────────────────────────────────────────────────

_CHIP_FIELD_MAP = {
    "chip_dealer_buy":  "dealer",
    "chip_foreign_buy": "foreign",
    "chip_trust_buy":   "trust",
}


def _eval_tranche_status(tranche: dict) -> dict:
    """H-3: chip_* 全 true + manual 全 true → triggered（在 Firestore snake_case dict 上操作）"""
    rules    = tranche.get("trigger_rules") or []
    statuses = tranche.get("rule_statuses") or {}

    chip_rules   = [r for r in rules if r.get("type") in _CHIP_FIELD_MAP]
    manual_rules = [r for r in rules if r.get("type") == "manual"]

    if not chip_rules and not manual_rules:
        return tranche

    for r in chip_rules:
        if statuses.get(r["type"]) is not True:
            return tranche

    for _ in manual_rules:
        if statuses.get("manual") is not True:
            return tranche

    return {**tranche, "status": "triggered"}


def evaluate_trigger_rules(db) -> dict:
    """評估所有 active/triggered 策略的 chip_* 觸發條件，batch write 結果回 Firestore。

    - 只評估 chip_dealer_buy / chip_foreign_buy / chip_trust_buy（後端每日評估）
    - price_* 和 manual 由前端或使用者確認，本函式跳過
    - 各策略失敗不中斷整批
    回傳 {"evaluated": int, "errors": [...]}
    """
    today      = date.today().isoformat()
    evaluated  = 0
    errors: list[dict] = []

    try:
        strategies = db.collection("trading_strategies").where(
            filter=FieldFilter("status", "in", ["active", "triggered"])
        ).get()
    except Exception as exc:
        logger.error("evaluate_trigger_rules: 讀取策略失敗: %s", exc)
        return {"evaluated": 0, "errors": [{"error": str(exc)}]}

    for sdoc in strategies:
        try:
            d          = sdoc.to_dict()
            stock_code = d.get("stock_code") or sdoc.id
            tranches   = list(d.get("tranches") or [])
            if not tranches:
                continue

            evaluated_at = datetime.now(timezone.utc).isoformat()
            changed      = False

            for i, tranche in enumerate(tranches):
                rules      = tranche.get("trigger_rules") or []
                chip_rules = [r for r in rules if r.get("type") in _CHIP_FIELD_MAP]
                if not chip_rules:
                    continue

                rule_statuses  = dict(tranche.get("rule_statuses") or {})
                tranche_changed = False

                for rule in chip_rules:
                    rtype  = rule.get("type")
                    field  = _CHIP_FIELD_MAP[rtype]
                    period = max(int(rule.get("period") or 1), 1)

                    chip_docs = (
                        db.collection("stock_chip")
                        .document(stock_code)
                        .collection("records")
                        .order_by("date", direction="DESCENDING")
                        .limit(period)
                        .get()
                    )
                    rows   = [doc.to_dict() for doc in chip_docs]
                    result = len(rows) == period and all(row.get(field, 0) > 0 for row in rows)

                    if rule_statuses.get(rtype) != result:
                        rule_statuses[rtype] = result
                        tranche_changed      = True

                if tranche_changed:
                    updated = {**tranche, "rule_statuses": rule_statuses, "rule_evaluated_at": evaluated_at}
                    tranches[i] = _eval_tranche_status(updated)
                    changed     = True

            if not changed:
                continue

            # 重新計算 strategy.status（H-3）
            current    = d.get("status", "active")
            dismissed  = d.get("dismissed", False)
            expires_at = d.get("expires_at")

            if dismissed:
                new_status = "dismissed"
            elif expires_at and str(expires_at)[:10] < today and current in ("active", "triggered"):
                new_status = "expired"
            elif current == "active" and any(t.get("status") == "triggered" for t in tranches):
                new_status = "triggered"
            else:
                new_status = current

            db.collection("trading_strategies").document(sdoc.id).update({
                "tranches": tranches,
                "status":   new_status,
            })
            evaluated += 1

        except Exception as exc:
            logger.error("evaluate_trigger_rules 失敗 %s: %s", sdoc.id, exc)
            errors.append({"stockCode": sdoc.id, "error": str(exc)})

    return {"evaluated": evaluated, "errors": errors}
