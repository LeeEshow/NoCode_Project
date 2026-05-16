# 個人理財雲端系統

個人化的投資組合管理平台，整合台股即時報價、資產追蹤、風險量化與再平衡建議，部署於 Azure 雲端。

---

## 功能概覽

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
  └─ Azure Static Web Apps（前端）
       ├─ Easy Auth（Microsoft 帳號登入）
       └─ React 19 + TypeScript + Vite

Azure App Service Plan B1（Linux）
  ├─ finance-backend    → Node.js Express（API /api/v1/*）
  └─ finance-shioaji    → Python FastAPI + 永豐金 Shioaji SDK

Firebase Firestore（資料庫）

GitHub Actions
  ├─ deploy-backend.yml          → 後端自動部署
  ├─ deploy-shioaji.yml          → Python 服務自動部署
  ├─ azure-static-web-apps-*.yml → 前端自動部署
  └─ daily-snapshot.yml          → 每日 14:00（台灣時間）自動快照
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

### 後端（`Back-End/backend/`）

| 技術 | 版本 | 用途 |
|------|------|------|
| Node.js | 22 | 執行環境 |
| Express | - | Web 框架 |
| TypeScript | - | 型別安全 |
| Firebase Admin SDK | - | Firestore 存取 |
| node-cache | - | 即時報價短快取 |
| Axios | - | 呼叫 Yahoo Finance / Shioaji |

資料來源切換策略：盤中優先走 Shioaji（WebSocket 即時報價），盤外 fallback Yahoo Finance；Circuit Breaker 自動偵測服務異常。

### Python 微服務（`Back-End/Shioaji_API/`）

| 技術 | 版本 | 用途 |
|------|------|------|
| Python | 3.11 | 執行環境 |
| FastAPI | - | Web 框架 |
| Uvicorn | - | ASGI 伺服器 |
| 永豐金 Shioaji | 1.3.x | 台股即時報價 SDK |

提供個股報價、加權指數、台指期近月報價及 K 線資料，透過 WebSocket 保持持續連線。

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
│   ├── backend/               # Node.js 主後端
│   │   └── src/
│   │       ├── controllers/
│   │       ├── models/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── middleware/
│   │       └── global/
│   └── Shioaji_API/           # Python 微服務
│       └── src/shioaji_api/
│           ├── core/          # 設定 / ShioajiManager
│           └── routers/
├── Docs/                      # 架構文件
└── .github/workflows/         # GitHub Actions CI/CD
```

---

## 本地開發

### 前置需求

- Node.js 22+
- Python 3.11+
- Firebase 專案（Firestore 已啟用）
- 永豐金證券帳號（Shioaji API Key，可選）

### 後端（Node.js）

```bash
cd Back-End/backend
cp .env.example .env
# 填入 FIRESTORE_PROJECT_ID 與 GOOGLE_APPLICATION_CREDENTIALS

npm install
npm run dev        # 開發模式（熱重載，port 3001）
```

### Python 微服務

```bash
cd Back-End/Shioaji_API
pip install -r requirements.txt

# 建立 .env
echo "SJ_API_KEY=your_api_key" > .env
echo "SJ_SECRET_KEY=your_secret_key" >> .env

uvicorn main:app --port 8000
```

> 無 Shioaji API Key 時，後端會自動 fallback 至 Yahoo Finance，功能不受影響。

### 前端

```bash
cd Front-End/frontend
npm install

# 建立 .env（可選，預設指向 localhost:3001）
echo "VITE_API_BASE_URL=http://localhost:3001/api/v1" > .env

npm run dev        # 開發伺服器（port 5173）
```

### 常用指令

```bash
# 前端
npm run build      # 型別檢查 + Vite 打包
npm run lint       # ESLint
npx tsc --noEmit   # 僅型別檢查

# 後端
npm run build      # 編譯 TypeScript → dist/
npm run lint
```

---

## 環境變數

### 後端（`Back-End/backend/.env`）

| 變數 | 說明 |
|------|------|
| `FIRESTORE_PROJECT_ID` | Firebase 專案 ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service Account JSON 路徑（本機） |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Service Account JSON 內容（Azure 部署） |
| `PORT` | 監聽 port（預設 `3001`） |
| `SHIOAJI_API_URL` | Python 微服務 URL（預設 `http://localhost:8000`） |

### Python 微服務（`Back-End/Shioaji_API/.env`）

| 變數 | 說明 |
|------|------|
| `SJ_API_KEY` | 永豐金 API Key |
| `SJ_SECRET_KEY` | 永豐金 Secret Key |

---

## 部署（Azure）

詳見 [`Docs/Azure-Deployment.md`](Docs/Azure-Deployment.md)。

| 服務 | 方案 | 月費 |
|------|------|------|
| Azure Static Web Apps | Free | $0 |
| Azure App Service Plan B1 | Linux B1 | ~$13 USD |
| Firebase Firestore | Spark（免費） | $0 |

**CI/CD**：推送至 `main` 分支自動觸發對應 GitHub Actions workflow 部署。

---

## 文件

| 文件 | 說明 |
|------|------|
| [`Docs/Azure-Deployment.md`](Docs/Azure-Deployment.md) | Azure 部署完整紀錄（架構、參數、除錯） |
| [`Docs/REQUIREMENTS.md`](Docs/REQUIREMENTS.md) | 功能規劃與設計決策 |
| [`Docs/Backend-Node.md`](Docs/Backend-Node.md) | 後端架構設計原則 |
| [`Docs/Frontend-Reat.md`](Docs/Frontend-Reat.md) | 前端 MVVM 架構設計原則 |
| [`Front-End/CLAUDE.md`](Front-End/CLAUDE.md) | 前端開發規範（供 AI 輔助開發） |
| [`Back-End/CLAUDE.md`](Back-End/CLAUDE.md) | 後端開發規範（供 AI 輔助開發） |
