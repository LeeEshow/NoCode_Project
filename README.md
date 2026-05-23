# 個人理財雲端系統

個人化的投資組合管理平台，整合台股即時報價、資產追蹤、風險量化與再平衡建議，部署於 Azure 雲端。

---

## 功能概覽

### 🤖 AI 每日投資報告（Phase 5）
- 每日盤後自動生成 AI 分析報告（Claude Sonnet）
- 整合持股現況、風險狀態、市場指數、績效快照
- 點擊 PanelHeader 的 AI 圖示按鈕，以 Modal 彈窗顯示當日報告

### 📊 台股總覽
- 持股庫存管理（均價、未實現損益、報酬率）
- 即時股價輪詢（盤中 5 秒更新）
- 交易紀錄（買進 / 賣出，自動計算均價與成本）
- K 線圖、法人籌碼、基本面資料
- 關注清單（拖拉排序）
- 市場指數橫列（加權指數、台指期、費半、NASDAQ 等）

### ⚖️ 風險再平衡模組
- **Tag 標籤系統**：自訂風險分類標籤（如「半導體」、「高股息」），設定目標配置比例
- **風險量化**：`Risk_total = √(wᵀ × Σ × w)`，整合動態風險係數與相關性矩陣
- **市場狀態切換**：正常 / Risk-On / Risk-Off / 流動性枯竭，自動調整各 Tag 風險係數
- **再平衡建議**：依 ADV 流動性過濾，生成每股具體買賣數量建議
- **相關性矩陣**：手動或自動計算 Tag 間 Pearson ρ

### 💰 其他資產
- 外幣持倉（即時匯率 / 手動匯率切換，自動換算台幣）
- 債券管理
- 海外股票追蹤

### 📈 績效報告
- 每日資產快照（股票現值 / 外幣 / 現金 / 已實現損益）
- 歷史趨勢折線圖（雙段比較）
- 年化報酬率計算

### 📅 年度計畫
- 投入資本、再投入設定
- 整年預估報酬率試算

---

## 技術架構

```
使用者瀏覽器
  └─ Azure Static Web Apps（前端，Free）
       ├─ Easy Auth（Microsoft 帳號登入）
       └─ React 19 + TypeScript + Vite

Azure App Service Plan B1（Linux，~$13 USD/月）
  └─ finance-backend-py → Python FastAPI（API /api/v1/*）
                          整合 Shioaji WebSocket + Yahoo Finance fallback
                          MCP Server（SSE + JSON-RPC 2.0）

Firebase Firestore（Spark 免費方案）

GitHub Actions
  ├─ deploy-python-backend.yml   → 推送 Back-End/python-backend/** 自動部署後端
  ├─ azure-static-web-apps-*.yml → 推送 Front-End/frontend/** 自動部署前端
  ├─ daily-snapshot.yml          → 每日 14:00（台灣時間）自動快照
  └─ daily-ai-report.yml         → 每日 AI 投資報告生成（Phase 5，待實作）
```

### 前端（`Front-End/frontend/`）

| 技術 | 版本 | 用途 |
|------|------|------|
| React | 19 Canary | UI 框架 |
| TypeScript | 6.0 | 型別安全 |
| Vite | 8.0 | 建置工具 |
| React Router | 7 | 路由 |
| Zustand | 5 | 跨頁全域狀態 |
| ECharts | 5 | K 線、折線、長條圖 |
| Radix UI | - | Headless UI 元件（Dialog / Slider / Select / Tooltip） |
| dnd-kit | - | 拖拉排序 |
| Axios | - | HTTP 客戶端 |

架構採 **MVVM**（Model / ViewModel / View），所有商務計算於前端 ViewModel（Custom Hook）執行，後端為純資料存取層。

### 後端（`Back-End/python-backend/`）

| 技術 | 版本 | 用途 |
|------|------|------|
| Python | 3.14 | 執行環境 |
| FastAPI | - | Web 框架 |
| Uvicorn | - | ASGI 伺服器 |
| Firebase Admin SDK | - | Firestore 存取 |
| 永豐金 Shioaji | 1.3.x | 台股即時報價 SDK（選用） |

報價來源切換策略：盤中優先走 Shioaji WebSocket，盤外 fallback Yahoo Finance；Circuit Breaker 自動偵測異常（失敗 3 次 → 冷卻 60 秒）。**未設定 `SJ_API_KEY` 時全程使用 Yahoo Finance（Yahoo-only 模式），無需 Shioaji 帳號。**

另內建 **MCP Server**（`/api/v1/mcp/sse` + `/api/v1/mcp/message`），提供 8 個 AI Tool 供外部 AI Agent 存取理財資料。

---

## 專案結構

```
NoCode_Project/
├── Front-End/
│   └── frontend/              # React 前端
│       └── src/
│           ├── api/           # Axios 設定
│           ├── types/         # DTO / Domain 型別
│           ├── models/        # API 呼叫
│           ├── viewmodels/    # 邏輯層（Custom Hooks）
│           ├── stores/        # Zustand 全域狀態
│           ├── utils/         # 純函式工具
│           └── views/         # 元件 / 頁面
├── Back-End/
│   ├── python-backend/        # Python FastAPI 主後端（現役）
│   │   ├── main.py
│   │   ├── routers/
│   │   ├── services/
│   │   ├── utils/
│   │   └── tests/             # pytest 測試套件（121 tests）
│   ├── backend/               # ⚠️ 待清理：Node.js Express（已下線）
│   └── Shioaji_API/           # ⚠️ 待清理：舊 Shioaji 微服務（已整合進 python-backend）
├── Docs/                      # 架構文件
└── .github/workflows/         # GitHub Actions CI/CD
```

---

## 本地開發

### 前置需求

- Python 3.14+
- Node.js 22+（前端）
- Firebase 專案（Firestore 已啟用）
- 永豐金證券帳號（Shioaji API Key，可選）

### 後端（Python FastAPI）

```bash
cd Back-End/python-backend
cp .env.example .env
# 填入 FIRESTORE_PROJECT_ID 與 GOOGLE_APPLICATION_CREDENTIALS
# 選填：SJ_API_KEY / SJ_SECRET_KEY（未設定則全程 Yahoo Finance）

py -3.14 -m uvicorn main:app --reload --port 8000   # 開發模式（熱重載）
py -3.14 -m pytest tests/ -v                        # 測試套件
```

### 前端

```bash
cd Front-End/frontend
npm install

# 建立 .env（可選，預設指向 localhost:8000）
echo "VITE_API_BASE_URL=http://localhost:8000/api/v1" > .env

npm run dev        # 開發伺服器（port 5173）
```

### 常用指令

```bash
# 前端
npm run build      # 型別檢查 + Vite 打包
npm run lint       # ESLint
npx tsc --noEmit   # 僅型別檢查

# 後端
py -3.14 -m pytest tests/ -v                  # 全部測試（121 tests）
py -3.14 -m pytest tests/test_m6_mcp.py       # 單模組測試
```

---

## 環境變數

### 後端（`Back-End/python-backend/.env`）

| 變數 | 說明 |
|------|------|
| `FIRESTORE_PROJECT_ID` | Firebase 專案 ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service Account JSON 路徑（本機） |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Service Account JSON（base64，Azure 部署） |
| `PORT` | 監聽 port（預設 `8000`） |
| `SKIP_AUTH` | `true` = 跳過 Azure EasyAuth（本機開發用） |
| `SJ_API_KEY` | 永豐金 API Key（**選填**；未設定則全程使用 Yahoo Finance） |
| `SJ_SECRET_KEY` | 永豐金 Secret Key（**選填**） |
| `MCP_ACCESS_KEY` | MCP Server API Key（**選填**；未設定則 MCP 端點不需驗證） |

---

## 部署（Azure）

完整部署步驟、環境變數設定、CI/CD 設定與常見除錯紀錄詳見 [`Docs/Azure-Deployment.md`](Docs/Azure-Deployment.md)。

| 服務 | 方案 | 月費 |
|------|------|------|
| Azure Static Web Apps | Free | $0 |
| Azure App Service Plan B1 | Linux B1 | ~$13 USD |
| Firebase Firestore | Spark（免費） | $0 |

**CI/CD**：推送至 `main` 分支自動觸發對應 GitHub Actions workflow 部署。

### Yahoo-only 模式（無永豐金帳號）

不需設定 `SJ_API_KEY` / `SJ_SECRET_KEY`，後端即自動切換為 Yahoo Finance 模式，功能完整可用。詳細步驟見 [`Docs/Azure-Deployment.md`](Docs/Azure-Deployment.md)。

---

## 文件

| 文件 | 說明 |
|------|------|
| [`Docs/Azure-Deployment.md`](Docs/Azure-Deployment.md) | Azure 部署完整紀錄（架構、參數、除錯） |
| [`Docs/REQUIREMENTS.md`](Docs/REQUIREMENTS.md) | 功能規劃與設計決策 |
| [`Docs/Backend-Node.md`](Docs/Backend-Node.md) | 舊 Node.js 後端架構（已下線，供歷史參考） |
| [`Docs/Frontend-React.md`](Docs/Frontend-React.md) | 前端 MVVM 架構設計原則 |
| [`Front-End/CLAUDE.md`](Front-End/CLAUDE.md) | 前端開發規範（供 AI 輔助開發） |
| [`Back-End/CLAUDE.md`](Back-End/CLAUDE.md) | 後端開發規範（供 AI 輔助開發） |
