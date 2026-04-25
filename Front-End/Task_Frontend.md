# 個人理財雲端系統 — 前端開發任務清單

> 參考文件：Front-End\CLAUDE.md

**指派後端開發**：遇到以下情況，請把後端開發需求寫入 D:\Project\NoCode_Project\Back-End\Task_Backend.md 任務清單的最後段
> 1. 前端設計變更，影響後端API資料結構
> 2. 新增功能需後端開發新API
> 3. 前端發現API資訊異常，需要後端排錯時

---

## Phase 5：績效報告（`/report`）

### P5-01：快照歷史表格強化

- [ ] 支援手動新增 / 編輯快照（Modal 表單）
- [ ] 快照刪除確認
- [ ] 摘要卡片加入**外幣資產**欄（目前只有累計投入、股票現值、活存、整體報酬率）

---

## Phase 6：設定頁（`/settings`）

> 目前 SettingsPage 為空殼佔位

- [ ] P6-01：個人資訊設定（暱稱、幣別偏好）
- [ ] P6-02：API 連線狀態顯示
- [ ] P6-03：資料匯出（CSV）

---

## Phase 7：外幣 & 債券資產（`/assets`）

> AssetsPage 基本架構已建立，持續精修

- [ ] P7-01：債券資產 Tab（bondModel + BondTable + BondModal）
- [ ] P7-02：資產總覽 Tab — 所有資產類別合計卡片 + 圓餅圖佔比
- [ ] P7-03：外幣匯率自動刷新（每 5 分鐘 polling 或 WebSocket）

---

## Phase 8：使用者偏好設定（對應後端 F-02）

> 後端完成 `GET/PUT /api/v1/preferences` 後實作；過渡期以 localStorage 暫存。

### P8-01：建立偏好 Model

- [ ] 新增 `src/types/index.ts` — `UserPreferences` 介面
  ```ts
  interface UserPreferences {
    chart: {
      showK: boolean; showMA5: boolean; showMA20: boolean;
      showMA60: boolean; showVolume: boolean;
    };
  }
  ```
- [ ] 新增 `src/models/preferencesModel.ts`
  - `fetchPreferences(): Promise<UserPreferences>`
  - `updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences>`

### P8-02：建立偏好 ViewModel

- [ ] 新增 `src/viewmodels/usePreferencesViewModel.ts`
  - 初始載入時呼叫 `fetchPreferences()`
  - `setPref(patch)` — 更新 local state，debounce 500ms 後呼叫 `updatePreferences()`
  - 過渡期：後端未就緒時 fallback 至 localStorage（key: `user_preferences`）

### P8-03：整合 KLineChart

- [ ] `KLineChart.tsx` 的 5 個 toggle state（`visK/MA5/MA20/MA60/Vol`）改從 `usePreferencesViewModel` 讀取
- [ ] 每次 toggle 時呼叫 `setPref({ chart: { ... } })`
- [ ] `StockOverviewPage` 透過 props 傳入偏好，或在 KLineChart 內部直接 `usePreferencesViewModel()`

---

## 跨頁共用待辦

- [ ] 空白狀態（Empty State）：持股/關注清單/快照歷史為空時顯示引導文字
- [ ] 行動裝置響應式佈局調整（SideNav collapse、Table 水平捲動）
