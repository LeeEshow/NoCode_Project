# 個人理財雲端系統 — 後端開發任務清單

> 版本：1.0（2026-04-22）
> 參考文件：Back-End\CLAUDE.md

---

## 已完成項目

| ID | 說明 |
|----|------|
| P1-01 | Yahoo Finance 工具函式整合（axios 封裝，node-cache TTL 60s） |
| P1-02 | `GET /market/indices` — 台股 / 台指期 / NASDAQ / S&P500 / 道瓊 / SOX |
| P1-03 | `GET /market/export-indicator` — 台灣景氣燈號（NDC，TTL 3600s） |
| P1-04 | `GET /stocks/search?q=` — 股票搜尋 |
| P3B-01～04 | `ForeignAsset` Model + Controller + 路由；舊 foreign-currencies / bonds 標記 @deprecated |
| P4B-01～06 | `DailySnapshot` / `PlanConfig` Model + Controller + 路由 |
| E-01 | 台指期盤中/夜盤 null 值處理（`Promise.allSettled` 靜默處理） |
| E-02 | `holdings` 回應加入 `stockName` 欄位 |
| E-03 | 台指期資料回傳 null → 改爬 Yahoo Finance TW SSR HTML（`WTX&`），實測 `{ price: 39766, change: 544, changePercent: 1.39 }` |
| E-04 | 景氣燈號回傳空值 → NDC 為 AngularJS SPA，改為先 GET 取 CSRF token，再 POST `/n/json/data/eco/indicators` 解析 `SR0005` |

---

## 待辦

### F-02：使用者偏好設定持久化

**背景：** 前端需記錄使用者的操作習慣（如圖表顯示元素、未來其他 UI 狀態），需後端以單份 document 儲存，支援跨裝置同步。

#### 資料結構

```ts
interface UserPreferences {
  chart: {
    showK:      boolean;  // K線
    showMA5:    boolean;  // MA5
    showMA20:   boolean;  // MA20
    showMA60:   boolean;  // MA60
    showVolume: boolean;  // 成交量
  };
  // 保留擴充空間，未來可加入其他偏好欄位
}
```

#### 實作項目

1. 新增 Firestore collection `preferences`，文件 ID 固定為 `default`（單使用者）

2. 新增路由 `GET /api/v1/preferences`
   - 回傳當前偏好；若尚無資料，回傳預設值（所有欄位為 `true`）

3. 新增路由 `PUT /api/v1/preferences`
   - Request body：`Partial<UserPreferences>`（支援部分更新，merge 合併）
   - 回傳更新後的完整偏好物件

> 前端過渡期以 localStorage 暫存，後端完成後替換為 API 呼叫。
