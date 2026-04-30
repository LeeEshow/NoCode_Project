# 個人理財雲端系統 — 後端開發任務清單

> 版本：1.1（2026-04-30）
> 參考文件：Back-End\CLAUDE.md

---

## 待辦

### Bug 回報（前端發現 API 異常）

#### B-03 `GET /market/indices` — 台指期 `change` / `changePercent` 回傳 null

**發現日期：** 2026-04-29  
**狀態：** ✅ 已修正（2026-04-30）

**根本原因：**  
`TickFOPv1`（期貨 tick）不含 `price_chg` / `pct_chg` 欄位（僅股票 tick 有）。
啟動訂閱時未儲存前日結算價，導致 tick 快取的 `change` / `change_percent` 始終為 null。

**修正內容（`Shioaji_API/src/shioaji_api/core/manager.py`）：**
- `__init__` 新增 `_txf_reference: Optional[float] = None`
- `_subscribe_startup_contracts` 訂閱 TXF 合約時同步儲存 `contract.reference`（前日結算價）
- `on_fop_tick` callback 改為用 `price - reference` 計算 `change` / `change_percent`

---

> 暫無其他 Bug 待辦
