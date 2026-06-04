"""
FinTarck Azure Functions — NDC 指標爬蟲
每天 UTC 02:00（台灣時間 10:00）執行，抓取：
  - 景氣對策信號（景氣燈號）
  - 採購經理人指數（PMI）
結果寫入 Firestore collection: market_indicators
"""
import base64
import json
import logging
import os
import re
from datetime import datetime, timezone

import requests
import azure.functions as func
import firebase_admin
from firebase_admin import credentials, firestore

app = func.FunctionApp()

# ─── Firebase 初始化（singleton）─────────────────────────────────────────────

_firebase_app = None

def _init_firebase():
    global _firebase_app
    if _firebase_app:
        return
    sa_b64 = os.environ.get("FIREBASE_SA_BASE64")
    if not sa_b64:
        raise RuntimeError("FIREBASE_SA_BASE64 environment variable is not set")
    sa_dict = json.loads(base64.b64decode(sa_b64).decode("utf-8"))
    cred = credentials.Certificate(sa_dict)
    _firebase_app = firebase_admin.initialize_app(cred)


# ─── NDC 通用爬蟲（CSRF + POST）─────────────────────────────────────────────

def _scrape_ndc(page_url: str, api_url: str) -> dict | None:
    """取 CSRF token 後 POST 到 NDC API，失敗回傳 None"""
    session = requests.Session()
    browser_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    }
    try:
        page = session.get(page_url, headers=browser_headers, timeout=20)
        if page.status_code != 200:
            logging.error("NDC page %s → HTTP %s", page_url, page.status_code)
            return None

        csrf_m = re.search(r'csrf-token"\s+content="([^"]+)"', page.text)
        if not csrf_m:
            logging.error("NDC page %s: CSRF token not found", page_url)
            return None
        csrf = csrf_m.group(1)

        api_res = session.post(
            api_url,
            headers={
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": csrf,
                "Referer": page_url,
                "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
            },
            json={},
            timeout=20,
        )
        if api_res.status_code != 200:
            logging.error("NDC API %s → HTTP %s", api_url, api_res.status_code)
            return None

        return api_res.json()

    except Exception as exc:
        logging.error("NDC scrape error (%s): %s", api_url, exc)
        return None


# ─── 景氣燈號 parser ──────────────────────────────────────────────────────────

def _parse_business_cycle(payload: dict) -> dict | None:
    line_obj = payload.get("line", {})
    sr5 = next((v for v in line_obj.values() if v.get("code") == "SR0005"), None)
    if not sr5:
        logging.error("景氣燈號: SR0005 not found in payload")
        return None

    valid_data = [d for d in sr5.get("data", []) if d.get("y") is not None]
    if not valid_data:
        logging.error("景氣燈號: no valid data points")
        return None

    latest  = valid_data[-1]
    raw_x   = str(latest["x"])
    period  = f"{raw_x[:4]}-{raw_x[4:6]}" if len(raw_x) == 6 else raw_x
    score   = float(latest["y"])

    def _to_light(s: float) -> tuple[str, str]:
        if s >= 38: return "red",          "紅燈"
        if s >= 32: return "yellow-red",   "黃紅燈"
        if s >= 23: return "green",        "綠燈"
        if s >= 17: return "yellow-blue",  "黃藍燈"
        return         "blue",         "藍燈"

    light, label = _to_light(score)
    return {"period": period, "score": score, "light": light, "lightLabel": label}


# ─── PMI parser（第一次執行後補完）──────────────────────────────────────────

def _parse_pmi(payload: dict) -> dict | None:
    # TODO: 待第一次執行後確認 payload 結構，目前先回傳 None
    # 第一次執行時，raw payload 已存入 Firestore market_indicators/pmi_debug
    logging.info("PMI raw keys: %s", list(payload.keys()))
    return None


# ─── Timer Trigger（每天 UTC 02:00）────────────────────────────────────────

@app.timer_trigger(
    schedule="0 0 2 * * *",
    arg_name="timer",
    run_on_startup=False,
    use_monitor=True,
)
def scrape_indicators(timer: func.TimerRequest) -> None:
    if timer.past_due:
        logging.warning("Timer is past due")

    _init_firebase()
    db  = firestore.client()
    now = datetime.now(timezone.utc).isoformat()
    col = db.collection("market_indicators")

    # ── 景氣燈號 ──
    bc_payload = _scrape_ndc(
        "https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1",
        "https://index.ndc.gov.tw/n/json/data/eco/indicators",
    )
    if bc_payload:
        result = _parse_business_cycle(bc_payload)
        if result:
            col.document("business_cycle").set({**result, "updatedAt": now})
            logging.info("景氣燈號 OK: %s %s (%.0f分)", result["period"], result["lightLabel"], result["score"])
        else:
            logging.error("景氣燈號: parse failed")
    else:
        logging.error("景氣燈號: scrape failed")

    # ── PMI ──
    pmi_payload = _scrape_ndc(
        "https://index.ndc.gov.tw/n/en/PMI",
        "https://index.ndc.gov.tw/n/json/PMI",
    )
    if pmi_payload:
        # 第一次先存 debug 原始資料，確認結構後補 parser
        col.document("pmi_debug").set({
            "raw":       json.dumps(pmi_payload, ensure_ascii=False)[:10000],
            "updatedAt": now,
        })
        result = _parse_pmi(pmi_payload)
        if result:
            col.document("pmi").set({**result, "updatedAt": now})
            logging.info("PMI OK: %s", result)
        else:
            logging.info("PMI: raw data saved to pmi_debug, parser pending")
    else:
        logging.error("PMI: scrape failed")
