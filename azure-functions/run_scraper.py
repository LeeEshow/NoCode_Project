"""
NDC 指標爬蟲 — 獨立執行版（供 GitHub Actions cron 使用）

環境變數：
    FIREBASE_SA_BASE64: Firebase Service Account JSON 的 Base64 字串

執行：
    python run_scraper.py
"""
import base64
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone

import requests
import firebase_admin
from firebase_admin import credentials, firestore

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


# ─── Firebase 初始化 ──────────────────────────────────────────────────────────

def _init_firebase():
    sa_b64 = os.environ.get("FIREBASE_SA_BASE64")
    if not sa_b64:
        logging.error("FIREBASE_SA_BASE64 not set")
        sys.exit(1)
    sa_dict = json.loads(base64.b64decode(sa_b64).decode("utf-8"))
    cred = credentials.Certificate(sa_dict)
    firebase_admin.initialize_app(cred)


# ─── NDC 通用爬蟲 ─────────────────────────────────────────────────────────────

def _scrape_ndc(page_url: str, api_url: str) -> dict | None:
    session = requests.Session()
    browser_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    }
    try:
        page = session.get(page_url, headers=browser_headers, timeout=20)
        if page.status_code != 200:
            logging.error("NDC page %s -> HTTP %s", page_url, page.status_code)
            return None
        csrf_m = re.search(r'csrf-token"\s+content="([^"]+)"', page.text)
        if not csrf_m:
            logging.error("CSRF token not found: %s", page_url)
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
            logging.error("NDC API %s -> HTTP %s", api_url, api_res.status_code)
            return None
        return api_res.json()
    except Exception as exc:
        logging.error("NDC scrape error (%s): %s", api_url, exc)
        return None


# ─── Parsers ──────────────────────────────────────────────────────────────────

def _parse_business_cycle(payload: dict) -> dict | None:
    line_obj = payload.get("line", {})
    sr5 = next((v for v in line_obj.values() if v.get("code") == "SR0005"), None)
    if not sr5:
        logging.error("景氣燈號: SR0005 not found")
        return None
    valid_data = [d for d in sr5.get("data", []) if d.get("y") is not None]
    if not valid_data:
        logging.error("景氣燈號: no valid data points")
        return None
    latest = valid_data[-1]
    raw_x  = str(latest["x"])
    period = f"{raw_x[:4]}-{raw_x[4:6]}" if len(raw_x) == 6 else raw_x
    score  = float(latest["y"])

    def _to_light(s):
        if s >= 38: return "red",         "紅燈"
        if s >= 32: return "yellow-red",  "黃紅燈"
        if s >= 23: return "green",       "綠燈"
        if s >= 17: return "yellow-blue", "黃藍燈"
        return             "blue",        "藍燈"

    light, label = _to_light(score)
    return {"period": period, "score": score, "light": light, "lightLabel": label}


def _parse_pmi(payload: dict) -> dict | None:
    try:
        main_code = payload.get("big")
        right     = payload.get("right", {})
        next_pub  = payload.get("next")
        if not main_code or main_code not in right:
            return None
        data = right[main_code].get("d", [])
        if not data:
            return None
        latest  = data[-1]
        raw_m   = str(latest["m"])
        period  = f"{raw_m[:4]}-{raw_m[4:6]}" if len(raw_m) == 6 else raw_m
        pmi     = float(latest["n"])
        sub_indices = []
        for series in sorted(right.values(), key=lambda v: v.get("sort", 99)):
            d = series.get("d", [])
            if not d:
                continue
            last = d[-1]
            sub_indices.append({
                "name":  series.get("lang", "").strip(),
                "value": float(last["n"]),
            })
        return {"period": period, "pmi": pmi, "nextPublish": next_pub, "subIndices": sub_indices}
    except Exception as exc:
        logging.error("PMI parse error: %s", exc)
        return None


# ─── 主程式 ───────────────────────────────────────────────────────────────────

def main():
    _init_firebase()
    db  = firestore.client()
    now = datetime.now(timezone.utc).isoformat()
    col = db.collection("market_indicators")
    success = True

    # 景氣燈號
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
            success = False
    else:
        logging.error("景氣燈號: scrape failed")
        success = False

    # PMI
    pmi_payload = _scrape_ndc(
        "https://index.ndc.gov.tw/n/en/PMI",
        "https://index.ndc.gov.tw/n/json/PMI",
    )
    if pmi_payload:
        result = _parse_pmi(pmi_payload)
        if result:
            col.document("pmi").set({**result, "updatedAt": now})
            logging.info("PMI OK: %s %.1f", result["period"], result["pmi"])
        else:
            logging.error("PMI: parse failed")
            success = False
    else:
        logging.error("PMI: scrape failed")
        success = False

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
