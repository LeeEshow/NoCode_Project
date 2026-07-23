# 雲端部署文件

> 最後更新：2026-07-23  
> 架構：Azure Static Web Apps（前端）+ Cloud Run Proxy + GCE e2-micro（後端）

---

## 一、系統架構

```
使用者瀏覽器
  └─ Azure Static Web Apps（免費，Easy Auth Microsoft 帳號）
       └─ React 前端 → https://fintarck-proxy-1077248196503.asia-east1.run.app/api/v1

Cloud Run `fintarck-proxy`（asia-east1，免費額度）
  └─ Nginx reverse proxy → http://35.201.176.69:8000

GCE e2-micro `fintarck-backend`（asia-east1-b，~$7 USD/月）
  └─ systemd fastapi.service → uvicorn main:app --port 8000

Firebase Firestore（Spark 免費方案，同 Google 網路延遲 ~1–5ms）

GitHub Actions
  ├─ deploy-python-backend.yml  → Back-End/python-backend/** 變更 SSH 部署至 GCE
  ├─ azure-static-web-apps-*.yml → Front-End/frontend/** 變更自動部署前端
  └─ daily-snapshot.yml         → 每日 14:00（台灣時間）快照 + FinMind 同步
```

| 服務 | 月費 |
|------|------|
| GCE e2-micro | ~$7 USD |
| Cloud Run proxy、Azure SWA、Firestore | $0（免費額度） |

### 實際服務 URL

| 服務 | URL |
|------|-----|
| 前端 | `https://gray-bay-05c35e200.7.azurestaticapps.net` |
| 後端 API | `https://fintarck-proxy-1077248196503.asia-east1.run.app/api/v1` |
| MCP Server | `https://fintarck-proxy-1077248196503.asia-east1.run.app/api/v1/mcp?key=<MCP_ACCESS_KEY>` |

---

## 二、GCE 後端

| 項目 | 值 |
|------|-----|
| VM | `fintarck-backend`，e2-micro，asia-east1-b |
| OS | Ubuntu 22.04 LTS |
| 外部 IP | `35.201.176.69`（Static） |
| GCP Project | `project-235e3c4b-e334-41b4-847` |

**常用指令：**

```bash
sudo systemctl restart fastapi
journalctl -u fastapi -f          # 即時 log
journalctl -u fastapi -n 100      # 最近 100 行
curl http://localhost:8000/api/v1/health
```

**SSH 連入（Cloud Shell）：**

```bash
gcloud compute ssh fintarck-backend --zone=asia-east1-b
```

**環境變數（`/app/Back-End/python-backend/.env`）：**

| 名稱 | 說明 |
|------|------|
| `FIRESTORE_PROJECT_ID` | `nocode-finance` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | serviceAccountKey.json 完整 JSON（base64） |
| `SJ_API_KEY` / `SJ_SECRET_KEY` | 永豐金 API（選填；未設定則 Yahoo Finance 模式） |
| `MCP_ACCESS_KEY` | MCP Server 存取金鑰 |
| `CRON_SECRET` | 每日排程 X-Cron-Token 驗證 |
| `ALLOWED_ORIGINS` | `https://gray-bay-05c35e200.7.azurestaticapps.net,https://fintarck-proxy-*.run.app` |
| `PORT` | `8000` |

---

## 三、前端部署

> CI/CD：`azure-static-web-apps-gray-bay-05c35e200.yml`（推送 `Front-End/frontend/**` 觸發）

- `Front-End/frontend/.env.production` 直接維護 `VITE_API_BASE_URL`，**不**透過 GitHub Actions 環境變數注入（空 Secret 會蓋掉 `.env.production`）
- `skip_app_build: true`：SWA 直接取用 Vite 打包後的 `dist/`
- Easy Auth 設定於 `public/staticwebapp.config.json`，未登入自動導向 Microsoft 登入

---

## 四、GitHub Actions CI/CD

### GitHub Secrets

| Secret | 用途 |
|--------|------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN_...` | 前端 SWA 部署 |
| `CRON_SECRET` | 每日快照 X-Cron-Token 驗證 |
| `GCE_HOST` | `35.201.176.69` |
| `GCE_USER` | `h6f9wtxchb` |
| `GCE_SSH_KEY` | SSH ed25519 private key |

> SSH 公鑰透過 `gcloud compute instances add-metadata` 加入 instance metadata（不直接寫 `authorized_keys`，否則被 GCP metadata 同步覆蓋）。

### 後端部署（`deploy-python-backend.yml`）

觸發：`Back-End/python-backend/**` push 到 main，或手動 `workflow_dispatch`。  
流程：SSH 進 GCE → `git pull` → `pip install -r requirements.txt` → `sudo systemctl restart fastapi` → 確認服務狀態。

### 每日快照（`daily-snapshot.yml`）

台灣時間 14:00（UTC 06:00）依序呼叫：

1. `POST /api/v1/snapshots/record`（快照 + 後台風險重算）
2. `POST /api/v1/finmind/sync`（基本面 + 三大法人）

Backend URL 讀 `${{ secrets.BACKEND_URL }}`，以 `X-Cron-Token: ${{ secrets.CRON_SECRET }}` 驗證。

---

## 五、Cloud Run Proxy

```
公司瀏覽器 → https://fintarck-proxy-*.asia-east1.run.app（443）
           → Cloud Run（Nginx reverse proxy）
           → http://35.201.176.69:8000
```

GCE 防火牆須開放 `tcp:8000`（規則：`allow-uvicorn-8000`）。Nginx 關鍵設定：`proxy_pass http://35.201.176.69:8000`、`proxy_read_timeout 86400`（SSE 長連線）。

**重新部署（Cloud Shell）：**

```bash
cd ~/fintarck-proxy
gcloud run deploy fintarck-proxy --source . --region asia-east1 --allow-unauthenticated --port 8080
```

---

## 六、已知問題紀錄

| # | 症狀 | 根因 | 解法 |
|---|------|------|------|
| 1 | 瀏覽器 Mixed Content 14 個錯誤 | `@router.get("/")` 觸發 307 redirect → Azure SSL 終止後變 http | 所有 router 根路由改為 `@router.get("")` |
| 2 | 所有 API 回 401 | `main.py` 讀 `SKIP_AUTH`，Azure 設的是 `EASY_AUTH_BYPASS` | Azure 環境變數改名 `SKIP_AUTH` |
| 3 | `ImportError: GLIBC_2.33 not found` | GitHub Actions 預編譯 .so 需要較新 glibc，Azure 容器版本舊 | `SCM_DO_BUILD_DURING_DEPLOYMENT=true` |
| 4 | Shioaji WebSocket 持續斷線 | Azure SNAT 殭屍連線 + B1 thread pool 耗盡 | 遷移至 GCE（e2-micro + 標準 Linux TCP stack） |
| 5 | 前端部署後 API URL 空白 | workflow Build step 空 Secret 蓋掉 `.env.production` | 移除 workflow 的 `VITE_API_BASE_URL` 環境變數注入 |
| 6 | Cloud Run 504 Gateway Timeout | nginx 打 GCE port 80（301 redirect）；port 8000 未開放 | 新增防火牆規則 `allow-uvicorn-8000`；nginx 改打 `:8000` |
| 7 | SSH handshake failed | 直接寫 `authorized_keys` 被 GCP metadata 同步覆蓋 | 改用 `gcloud compute instances add-metadata` |

---

> Azure App Service 後端（`finance-backend-py`）於 2026-06-03 停用，已遷至 GCE。相關 Azure 設定保留於 git history。
