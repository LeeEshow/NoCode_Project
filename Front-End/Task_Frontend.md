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

> 前端已完成（2026-04-26），過渡期以 localStorage 暫存；後端完成 `GET/PUT /api/v1/preferences` 後自動接上，無需改前端。

- [x] P8-01：`UserPreferences` 型別 + `preferencesModel.ts`
- [x] P8-02：`usePreferencesViewModel.ts`（debounce 500ms 寫入，localStorage fallback）
- [x] P8-03：`KLineChart` 5 個 toggle 整合偏好 ViewModel，狀態跨 session 持久化

---

## 跨頁共用待辦

- [ ] 空白狀態（Empty State）：持股/關注清單/快照歷史為空時顯示引導文字
- [ ] 行動裝置響應式佈局調整（SideNav collapse、Table 水平捲動）

---
