# 個人理財雲端系統 — 前端

React 19 + TypeScript + Vite 前端，部署於 Azure Static Web Apps。

## 技術棧

| 技術 | 版本 | 用途 |
|------|------|------|
| React | 19 Canary | UI 框架 |
| TypeScript | 6.0 | 型別安全 |
| Vite | 8.0 | 建置工具 |
| React Router | 7 | 路由 |
| Zustand | 5 | 跨頁全域狀態 |
| ECharts | 5 | K 線、折線、長條圖 |
| Radix UI | - | Headless UI（Dialog / Slider / Select / Tooltip） |
| dnd-kit | - | 拖拉排序 |
| Axios | - | HTTP 客戶端 |

## 快速開始

```bash
cd Front-End/frontend
npm install

# 建立 .env（預設已指向 localhost:8000）
echo "VITE_API_BASE_URL=http://localhost:8000/api/v1" > .env

npm run dev        # 開發伺服器（port 5173）
```

## 常用指令

```bash
npm run dev        # 開發伺服器（port 5173，被佔用自動遞增）
npm run build      # tsc -b && vite build
npm run lint       # ESLint
npm run format     # Prettier（src/**/*.{ts,tsx}）
npm run preview    # 預覽 build 產出（需先 build）
npx tsc --noEmit   # 僅型別檢查
```

**安裝新套件**（需加 `--legacy-peer-deps`，因 react@canary peer dep 問題）：
```bash
npm install <package> --legacy-peer-deps
```

## 環境變數

| 變數 | 說明 |
|------|------|
| `VITE_API_BASE_URL` | 後端 API base URL（預設 `http://localhost:8000/api/v1`） |

- 開發：建立 `.env` 設定（不版控）
- 正式：設定於 `.env.production`（版控，指向 Azure App Service URL）

## 架構

採 **MVVM** 分層：

```
src/
├── api/axios.ts       # Axios 單例（baseURL / timeout / 錯誤攔截）
├── types/index.ts     # 全域 DTO 型別（唯一真實來源）
├── models/            # 純 API 呼叫函式
├── viewmodels/        # React hooks（state + CRUD）
├── stores/            # Zustand 跨頁全域 store
├── utils/             # 純函式工具
└── views/
    ├── layout/        # MainLayout、SideNav、SettingsModal
    ├── pages/         # 各頁面元件
    └── components/    # 跨頁面共用元件
```

詳細開發規範見 [`../CLAUDE.md`](../CLAUDE.md)。

## 部署

推送 `Front-End/frontend/**` 至 `main` 分支，自動觸發 GitHub Actions：
1. `npm ci` → `npm run build`（在 Actions 環境中執行）
2. 上傳 `dist/` 至 Azure Static Web Apps（`skip_app_build: true`）

正式環境 URL：`https://gray-bay-05c35e200.7.azurestaticapps.net`
