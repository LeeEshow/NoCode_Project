# 個人理財雲端系統 — 前端開發任務清單

> 參考文件：Front-End\CLAUDE.md

**指派後端開發**：遇到以下情況，請把後端開發需求寫入 D:\Project\NoCode_Project\Back-End\Task_Backend.md 任務清單的最後段
> 1. 前端設計變更，影響後端API資料結構
> 2. 新增功能需後端開發新API
> 3. 前端發現API資訊異常，需要後端排錯時

---

## 待辦

---

### M15 關注清單自訂分組 ✅ 完成（2026-06-12）

**設計目的**
關注清單隨時間累積，項目混雜難以管理。新增自訂分組功能，讓用戶能建立「ETF」、「個股」等分組並將 item 歸類，Table 依分組分段顯示（可展開/收折），拖拉排序支援跨組移動（item 自動更新所屬分組）。

**異動檔案與做法**

1. **`types/index.ts`**
   - `WatchlistItemDTO` 加 `group?: string`（`undefined` = 未分組）
   - `CreateWatchlistPayload` 加 `group?: string`
   - 新增 `UpdateWatchlistPayload`（含 `group?`、`targetPrice?`、`note?`），與 `CreateWatchlistPayload` 分開，避免型別混用

2. **`models/watchlistModel.ts`**
   - `toWatchlistDTO()` mapping 加 `group: raw.group ?? undefined`
   - `updateWatchlistItem()` payload 改用 `UpdateWatchlistPayload`

3. **`viewmodels/useWatchlistViewModel.ts`**
   - State 加 `collapsedGroups: Set<string>`（預設全展開）
   - 新增 `toggleGroupCollapse(groupName: string)` 方法
   - `addItem` / `updateItem` 接受 `group` 欄位，傳給後端
   - 新增 `renameGroup(oldName: string, newName: string)`：批次 `updateItem` 所有同組 item（樂觀更新，API 失敗靜默）
   - 新增 `deleteGroup(groupName: string)`：批次將同組 item 的 `group` 設為 `undefined`（移至未分組）
   - `reorder()` 跨組拖拉時，判斷 drop 目標 group 與 source group 不同則額外呼叫 `updateItem` 更新 `group` 欄位

4. **`views/pages/stock/WatchlistTable.tsx`**
   - `onToggleGroup` / `onRenameGroup` / `onDeleteGroup` 加入 props
   - 渲染前先將 items 依 group 分組（未分組歸入 `"未分組"` bucket，顯示於最後）
   - 每個分組渲染一個 section header row（`<tr>` colspan 全欄）：左側組名 + 項目數，右側重新命名 / 刪除組別 icon 按鈕 + 收折 `expand_more/expand_less` icon
   - `collapsedGroups` 包含此組名時，跳過渲染該組所有 row（DnD 容器仍掛載，避免 sensor 異常）
   - 跨組拖拉：`onDragEnd` 判斷 `overId` 屬於哪個 group，與 `activeId` 的 group 不同時呼叫 `onReorderWithGroup` 並帶入目標 group

5. **`views/pages/stock/WatchlistModal.tsx`**
   - 新增「分組」欄位（`SelectInput`）：選項從現有 item 的 group 去重後產生，含「未分組」與「＋ 新增分組…」
   - 選「＋ 新增分組…」時切換為 `TextInput` 讓用戶輸入新組名
   - `onSubmit` payload 包含 `group`

6. **`views/pages/StockOverviewPage.tsx`**
   - 傳遞 `collapsedGroups`、`onToggleGroup`、`onRenameGroup`、`onDeleteGroup` 給 `WatchlistTable`
   - `handleWlSubmit` 帶入 `group` 欄位

**驗收條件**
- 可新增分組（透過 Modal）、重新命名、刪除組別（item 移至未分組）
- 分組 section header 可展開/收折
- 拖拉同組內排序正常；跨組拖拉後 item group 欄位正確更新
- 頁面重整後分組結構還原（資料來自後端）

---

### M16 關注清單小卡切換 ✅ 完成（2026-06-12）

**設計目的**
提供小卡（Card）視圖作為 Table 的輕量替代，讓用戶可快速瀏覽價格與漲跌，設計參照市場指數 `mir-card`（深色 panel、monospace 數值、漲跌色）。切換偏好存 localStorage，不因頁面重整消失。

**異動檔案與做法**

1. **新增 `views/pages/stock/WatchlistCardGrid.tsx`**
   - props：`items: WatchlistItemDTO[]`、`groupOrder: string[]`、`collapsedGroups: Set<string>`（分組收折狀態與 M15 共用）
   - 每張卡片結構（寬 130px，參照 `mir-card`）：
     ```
     ┌──────────────────┐
     │ 2330  台積電...  │  ← code (bold, --text) + name (truncated, --label, text-sm)
     │ 1,050.00         │  ← 即時報價 (monospace, text-xl, --text-value)
     │ ▲ +15  +1.45%    │  ← 漲跌額 + 漲跌% (text-xs, txt-up/txt-down)
     └──────────────────┘
     ```
   - 名稱截斷：CSS `text-overflow: ellipsis`，不用 JS 截字
   - 依分組分段：每組前顯示組名 label（`--label` 色，小字），`"未分組"` 組無 label
   - 無點擊展開行為（純展示）

2. **新增 `views/pages/stock/WatchlistCardGrid.css`**
   - `.wl-card-section` + `.wl-card-group-label`（分組名稱，small muted）
   - `.wl-card-grid`：`display: flex; flex-wrap: wrap; gap: 6px`
   - `.wl-card`：參照 `.mir-card`（`background: var(--panel)`、`border: 1px solid var(--border)`、`border-radius: var(--radius-lg)`、`padding: 9px 12px`、`flex: 0 0 130px`、`min-height: 72px`）
   - `.wl-card-code`、`.wl-card-name`、`.wl-card-price`、`.wl-card-change`

3. **`views/pages/StockOverviewPage.tsx`**
   - 加 `wlViewMode` state（`'table' | 'card'`），初始值從 `localStorage.getItem('wl-view-mode')` 讀取（try-catch）
   - 切換時寫回 localStorage
   - Watchlist section header 右側加兩個 `.btn-icon`（`table_rows` / `grid_view` icon），active 狀態用 `--accent` 色區分
   - `wlViewMode === 'card'` 時 render `<WatchlistCardGrid>`，否則 render `<WatchlistTable>`
   - 小卡模式隱藏「新增」以外的 header actions（拖拉/reorder 不適用卡片模式）

**驗收條件**
- 切換按鈕正常，active 狀態視覺區分明確
- 小卡漲跌色（`txt-up` / `txt-down`）正確
- 名稱過長自動截斷顯示 `…`
- 分組 label 正確分段（`"未分組"` 組不顯示 label）
- 偏好存 localStorage，重整後維持上次選擇
