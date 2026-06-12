# 個人理財雲端系統

個人投資組合管理平台，整合台股即時報價、風險量化、再平衡決策、外幣資產管理（含匯率/Duration 曝險分析）與長期投報計畫追蹤，部署於 Google Cloud。

---

## 功能概覽

### 📊 台股總覽
- 持股庫存管理（均價、未實現損益、報酬率）
- 即時股價輪詢（盤中 5 秒更新）
- 交易紀錄（買進 / 賣出，自動計算均價與成本）
- K 線圖、法人籌碼、基本面資料
- **AI 交易策略**：多批次分批進場設計（tranches）、價格 / 籌碼觸發規則自動評估、停利設定與風險回報比自動計算
- 關注清單（拖拉排序、**自訂分組**、**小卡 / 表格視圖切換**）
- 市場指數橫列（加權指數、台指期、費半、NASDAQ 等）

### ⚖️ 風險再平衡模組
- **Tag 標籤系統**：自訂風險分類標籤（如「半導體」、「高股息」），設定目標配置比例
- **風險量化**：`Risk_total = √(wᵀ × Σ × w)`，整合動態風險係數與相關性矩陣
- **市場狀態切換**：正常 / Risk-On / Risk-Off / 流動性枯竭，自動調整各 Tag 風險係數；VIX 每日自動偵測建議狀態
- **再平衡建議**：依 ADV 流動性過濾，生成每股具體買賣數量建議；No-Trade Band 分層（觀察區 / 交易區）避免過度交易；成本效益評估標籤（建議交易 / 可觀察 / 效益不足）
- **相關性矩陣**：手動或自動計算 Tag 間 Pearson ρ
- **RiskPanel Tab 1（標籤配置）**：
  - Portfolio Beta（使用大盤日K歷史回歸，≥60 天快照顯示）
  - 因子曝險摘要（各 Tag actualWeight 排序橫條圖）
- **RiskPanel Tab 2（壓力測試）**：5 種情境預設（市場崩盤、半導體循環、流動性枯竭、台幣升值、升息），Hover 顯示各 Tag 衝擊係數與公式
- **下行風險 Tab**：最大回撤（MDD）顯示距高點跌幅與恢復天數；VaR 95% / CVaR 95% 以歷史模擬法估算極端損失金額

### 💰 其他資產
- 外幣持倉（即時匯率 / 手動匯率切換，自動換算台幣）
- 債券管理（含到期年限）
- 海外股票追蹤
- **匯率曝險分析**：per-currency 台幣佔比、±1% 匯率衝擊金額（PanelHeader 外幣曝險比徽章）
- **債券利率敏感度**：加權存續期間（Modified Duration 代理法，`years_to_maturity × 0.8`）、升降息 1% 估算損益

### 📈 績效報告
- 每日資產快照（股票現值 / 外幣 / 現金 / 已實現損益）
- 歷史趨勢折線圖（雙段比較）
- 年化報酬率計算

### 📅 年度計畫
- 投入資本、再投入設定、30 年複利試算表
- **今年進度追蹤**：以去年實際資產為起點線性插值，即時比較目前資產與計畫進度（進度比 + 差距萬元）
- **30年所需報酬估算**：`(第30年目標 ÷ 現值)^(1/剩餘年數) - 1`，判斷目標在計畫設定報酬率內是否可達

---

## 技術架構

```
使用者瀏覽器
  └─ Azure Static Web Apps（前端，Free）
       ├─ Easy Auth（Microsoft 帳號登入）
       └─ React 19 + TypeScript + Vite
            └─ API 呼叫 → https://fintarck-proxy-1077248196503.asia-east1.run.app/api/v1

Cloud Run `fintarck-proxy`（asia-east1，免費額度）
  └─ Nginx reverse proxy → GCE backend :8000

GCE e2-small `fintarck-backend`（asia-east1-b，~$13.65 USD/月）
  └─ Python FastAPI（API /api/v1/*）
       整合 Shioaji WebSocket + Yahoo Finance fallback
       MCP Server（Streamable HTTP + SSE，22 Tools）

Firebase Firestore（Spark 免費方案）

GitHub Actions
  ├─ deploy-python-backend.yml   → 推送 Back-End/python-backend/** SSH 部署至 GCE
  ├─ azure-static-web-apps-*.yml → 推送 Front-End/frontend/** 自動部署前端
  └─ daily-snapshot.yml          → 每日 14:00（台灣時間）自動快照 + FinMind 同步
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
| View Transitions API | - | 頁面切換動畫（ECGLoader + Overlay） |

架構採 **MVVM**（Model / ViewModel / View），所有商務計算於前端 ViewModel（Custom Hook）執行，後端為純資料存取層。

### 後端（`Back-End/python-backend/`）

| 技術 | 版本 | 用途 |
|------|------|------|
| Python | 3.14 | 執行環境 |
| FastAPI | - | Web 框架 |
| Uvicorn | - | ASGI 伺服器 |
| Firebase Admin SDK | - | Firestore 存取 |
| 永豐金 Shioaji | 1.5.0 | 台股即時報價 SDK（選用） |

報價來源切換策略：盤中優先走 Shioaji WebSocket，盤外 fallback Yahoo Finance；Circuit Breaker 自動偵測異常（失敗 3 次 → 冷卻 60 秒）。**未設定 `SJ_API_KEY` 時全程使用 Yahoo Finance（Yahoo-only 模式），無需 Shioaji 帳號。**

另內建 **MCP Server**（`/api/v1/mcp`，Streamable HTTP + SSE 雙傳輸），提供 22 個 AI Tool 供外部 AI Agent 存取理財資料。

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
│   └── python-backend/        # Python FastAPI 主後端
│       ├── main.py
│       ├── routers/
│       ├── services/
│       ├── utils/
│       └── tests/             # pytest 測試套件
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
npx tsc -p tsconfig.app.json --noEmit   # 僅型別檢查

# 後端
py -3.14 -m pytest tests/ -v                  # 全部測試
py -3.14 -m pytest tests/test_m6_mcp.py       # 單模組測試
```

---

## 環境變數

### 後端（`Back-End/python-backend/.env`）

| 變數 | 說明 |
|------|------|
| `FIRESTORE_PROJECT_ID` | Firebase 專案 ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service Account JSON 路徑（本機） |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Service Account JSON（base64，GCE / CI 部署用） |
| `PORT` | 監聽 port（預設 `8000`） |
| `SKIP_AUTH` | `true` = 跳過 EasyAuth 驗證（本機開發用） |
| `SJ_API_KEY` | 永豐金 API Key（**選填**；未設定則全程使用 Yahoo Finance） |
| `SJ_SECRET_KEY` | 永豐金 Secret Key（**選填**） |
| `MCP_ACCESS_KEY` | MCP Server API Key（**選填**；未設定則 MCP 端點不需驗證） |

---

## 部署

完整部署步驟、環境變數設定、CI/CD 設定與常見除錯紀錄詳見 [`Docs/Cloud-Deployment.md`](Docs/Cloud-Deployment.md)。

| 服務 | 方案 | 月費 |
|------|------|------|
| GCE e2-small（後端） | 隨需付費 | ~$13.65 USD |
| Cloud Run Proxy | 免費額度 | $0 |
| Azure Static Web Apps（前端） | Free | $0 |
| Firebase Firestore | Spark（免費） | $0 |

**CI/CD**：推送至 `main` 分支自動觸發對應 GitHub Actions workflow 部署。

### Yahoo-only 模式（無永豐金帳號）

不需設定 `SJ_API_KEY` / `SJ_SECRET_KEY`，後端即自動切換為 Yahoo Finance 模式，功能完整可用。詳細步驟見 [`Docs/Cloud-Deployment.md`](Docs/Cloud-Deployment.md)。

---

## 文件

| 文件 | 說明 |
|------|------|
| [`Docs/Cloud-Deployment.md`](Docs/Cloud-Deployment.md) | 雲端部署完整紀錄（GCE / Cloud Run / Azure SWA 架構、參數、除錯） |
| [`Docs/REQUIREMENTS.md`](Docs/REQUIREMENTS.md) | 功能規劃與設計決策 |
| [`Docs/Backend-Node.md`](Docs/Backend-Node.md) | 舊 Node.js 後端架構（歷史存檔，實際服務已移除） |
| [`Docs/Frontend-React.md`](Docs/Frontend-React.md) | 前端 MVVM 架構設計原則 |
| [`Front-End/CLAUDE.md`](Front-End/CLAUDE.md) | 前端開發規範（供 AI 輔助開發） |
| [`Back-End/CLAUDE.md`](Back-End/CLAUDE.md) | 後端開發規範（供 AI 輔助開發） |
