# 雲端部署文件

> 最後更新：2026-06-03  
> 目前架構：Azure Static Web Apps（前端）+ **GCE e2-micro（後端，現役）**  
> 後端已於 2026-06-03 從 Azure App Service B1 遷移至 Google Compute Engine（M11）。

---

## 部署進度

| 項目 | 狀態 |
|------|------|
| **GCE VM `fintarck-backend`（asia-east1-b）** | ✅ 現役主後端 |
| **Duck DNS `eshowfintarck.duckdns.org` → `35.201.176.69`** | ✅ |
| **Nginx + Let's Encrypt SSL（HTTPS 443）** | ✅ |
| **systemd `fastapi.service` 常駐** | ✅ |
| **Cloud Run `fintarck-proxy`（公司防火牆穿透）** | ✅ 已部署 |
| **前端 `.env.production` 切換至 Cloud Run URL** | ✅ |
| **`deploy-python-backend.yml` GCE SSH 部署** | ✅ 已完成 |
| **`daily-snapshot.yml` URL 寫死 + CRON_SECRET** | ✅ |
| **`restart-python-backend.yml` 刪除** | ✅ |
| Azure App Service `finance-backend-py` | ⚠️ 已停用（GCE 穩定後刪除） |
| Azure Static Web Apps 前端 | ✅ 正常運行 |
| 前端 Easy Auth（Microsoft 帳號） | ✅ |
| 每日快照排程（`daily-snapshot.yml`） | ✅ |

---

## 一、系統架構（現役）

```
使用者瀏覽器（含公司網路）
  └─ Azure Static Web Apps（免費）
       ├─ Easy Auth（Microsoft 帳號登入）
       └─ React 19 前端（Vite build 靜態檔）
            └─ API 呼叫 → https://fintarck-proxy-1077248196503.asia-east1.run.app/api/v1

Cloud Run `fintarck-proxy`（asia-east1，免費額度）
  └─ Nginx reverse proxy → http://35.201.176.69:8000

GCE e2-micro（asia-east1-b，~$7 USD/月）
  ├─ IP：35.201.176.69（Static External IP）
  ├─ Domain：eshowfintarck.duckdns.org（Duck DNS 免費，指向上述 IP）
  ├─ Nginx（443 HTTPS / 80 → redirect）→ proxy_pass → 127.0.0.1:8000
  ├─ port 8000 對外開放（GCE 防火牆 allow-uvicorn-8000）
  └─ systemd fastapi.service → uvicorn main:app --port 8000
       └─ Python FastAPI 後端（M1–M11 全部功能）

Firebase Firestore（Spark 免費方案）
  └─ 同 Google 網路，延遲 ~1–5ms（相較 Azure 跨雲 20–50ms 大幅改善）

GitHub Actions
  ├─ deploy-python-backend.yml  → Back-End/python-backend/** 變更時 SSH 部署至 GCE
  ├─ azure-static-web-apps-*.yml → Front-End/frontend/** 變更時自動部署前端
  └─ daily-snapshot.yml         → 每日 14:00（台灣時間）快照 + FinMind 同步
```

### 費用摘要

| 服務 | 方案 | 月費 |
|------|------|------|
| GCE e2-micro | 隨需付費 | ~$7 USD |
| Cloud Run proxy | 免費額度（200 萬次/月） | $0 |
| Azure Static Web Apps | Free | $0 |
| Firebase Firestore | Spark（免費） | $0 |
| **合計** | | **~$7 USD / 月** |

### 實際服務 URL

| 服務 | URL |
|------|-----|
| 前端（Azure SWA） | `https://gray-bay-05c35e200.7.azurestaticapps.net` |
| 後端（Cloud Run Proxy） | `https://fintarck-proxy-1077248196503.asia-east1.run.app` |
| 後端（GCE 直連，家用/非公司） | `https://eshowfintarck.duckdns.org` |
| 後端 API | `https://fintarck-proxy-1077248196503.asia-east1.run.app/api/v1` |
| MCP Server | `https://fintarck-proxy-1077248196503.asia-east1.run.app/api/v1/mcp?key=<MCP_ACCESS_KEY>` |

---

## 二、GCE 後端部署（現役）

### VM 資訊

| 項目 | 值 |
|------|-----|
| VM 名稱 | `fintarck-backend` |
| 機器類型 | e2-micro（2 vCPU 共用，1GB RAM） |
| 可用區 | asia-east1-b（台灣） |
| OS | Ubuntu 22.04 LTS |
| 外部 IP | `35.201.176.69`（Static） |
| 內部 IP | `10.140.0.2`（nic0） |
| Domain | `eshowfintarck.duckdns.org`（Duck DNS） |
| GCP Project ID | `project-235e3c4b-e334-41b4-847` |

### 環境變數（`/app/Back-End/python-backend/.env`）

| 名稱 | 說明 |
|------|------|
| `FIRESTORE_PROJECT_ID` | `nocode-finance` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | serviceAccountKey.json 完整 JSON（base64 或單行） |
| `SJ_API_KEY` | 永豐金 API Key |
| `SJ_SECRET_KEY` | 永豐金 Secret Key |
| `MCP_ACCESS_KEY` | MCP Server 存取金鑰 |
| `CRON_SECRET` | 每日排程呼叫驗證 token |
| `ALLOWED_ORIGINS` | `https://gray-bay-05c35e200.7.azurestaticapps.net,https://fintarck-proxy-1077248196503.asia-east1.run.app` |
| `PORT` | `8000` |

### systemd 服務（`/etc/systemd/system/fastapi.service`）

```ini
[Unit]
Description=FastAPI Backend
After=network.target

[Service]
Type=simple
User=h6f9wtxchb
WorkingDirectory=/app/Back-End/python-backend
Environment="PATH=/app/Back-End/python-backend/.venv/bin"
EnvironmentFile=/app/Back-End/python-backend/.env
ExecStart=/app/Back-End/python-backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

常用指令：

```bash
sudo systemctl status fastapi
sudo systemctl restart fastapi
sudo systemctl stop fastapi
journalctl -u fastapi -f          # 即時 log
journalctl -u fastapi -n 100      # 最近 100 行
```

### Nginx 設定（`/etc/nginx/sites-available/fastapi`）

```nginx
server {
    listen 80;
    server_name eshowfintarck.duckdns.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name eshowfintarck.duckdns.org;

    ssl_certificate /etc/ssl/eshowfintarck/fullchain.pem;
    ssl_certificate_key /etc/ssl/eshowfintarck/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

SSL 由 Certbot 自動管理（`certbot --nginx -d eshowfintarck.duckdns.org`）。

### 健康檢查

```bash
# 透過 Cloud Run proxy
curl https://fintarck-proxy-1077248196503.asia-east1.run.app/health

# 直連 GCE（非公司網路）
curl https://eshowfintarck.duckdns.org/health
```

---

## 三、前端部署參數

> URL：`https://gray-bay-05c35e200.7.azurestaticapps.net`  
> CI/CD：`.github/workflows/azure-static-web-apps-gray-bay-05c35e200.yml`（推送 `Front-End/frontend/**` 觸發）

**Vite 環境變數**（`Front-End/frontend/.env.production`）

| 名稱 | 值 |
|------|-----|
| `VITE_API_BASE_URL` | `https://fintarck-proxy-1077248196503.asia-east1.run.app/api/v1` |

> ⚠️ **不使用 GitHub Actions Variables 注入**：曾嘗試在 Build 步驟以環境變數覆寫，但會與 `.env.production` 衝突。正確做法是直接維護 `.env.production`，workflow 中的 `skip_app_build: true` 讓 SWA 直接取用 Vite 打包後的 `dist/`。

**Easy Auth**（Microsoft 帳號）

已設定於 `Front-End/frontend/public/staticwebapp.config.json`：未登入的使用者自動導向 Microsoft 登入頁。

---

## 四、GitHub Actions CI/CD

### GitHub Secrets 一覽

| Secret 名稱 | 用途 |
|-------------|------|
| `AZURE_STATIC_WEB_APPS_API_TOKE...` | 前端 SWA 部署（保留） |
| `CRON_SECRET` | 每日快照 X-Cron-Token 驗證 |
| `GCE_HOST` | `35.201.176.69` |
| `GCE_USER` | `h6f9wtxchb` |
| `GCE_SSH_KEY` | SSH ed25519 private key（`~/.ssh/github_actions`） |

> SSH 公鑰已透過 GCP instance metadata 加入（`gcloud compute instances add-metadata`），不直接寫 `authorized_keys`。

### 後端部署（`deploy-python-backend.yml`）✅

觸發條件：`Back-End/python-backend/**` 有變更 push 到 main，或手動 `workflow_dispatch`。

```yaml
- name: Deploy to GCE via SSH
  uses: appleboy/ssh-action@v1.0.3
  with:
    host: ${{ secrets.GCE_HOST }}
    username: ${{ secrets.GCE_USER }}
    key: ${{ secrets.GCE_SSH_KEY }}
    script: |
      cd /app/Back-End/python-backend
      git pull origin main
      source .venv/bin/activate
      pip install -r requirements.txt --quiet
      sudo systemctl restart fastapi
      sleep 3
      sudo systemctl is-active fastapi
```

### 每日快照排程（`daily-snapshot.yml`）✅

每天 **14:00 台灣時間**（UTC 06:00），依序呼叫：

1. `POST /api/v1/snapshots/record`
2. `POST /api/v1/finmind/sync`（基本面 + 三大法人）

Backend URL 寫死於 workflow `env` 區塊（`https://eshowfintarck.duckdns.org`），`CRON_SECRET` 仍讀 Secret。

---

## 五、Cloud Run Proxy（公司防火牆穿透）

**架構：**

```
公司瀏覽器
  → https://fintarck-proxy-1077248196503.asia-east1.run.app  （Google 官方域名，443）
  → Cloud Run（Nginx reverse proxy）
  → http://35.201.176.69:8000                                （GCE 後端）
```

Cloud Run 免費額度：**200 萬次請求 / 月**，個人使用不超過。

**GCE 防火牆規則**（已建立）：

| 規則名稱 | Protocol/Port | 說明 |
|---------|---------------|------|
| `default-allow-http` | tcp:80 | Nginx HTTP |
| `default-allow-https` | tcp:443 | Nginx HTTPS |
| `default-allow-ssh` | tcp:22 | SSH 管理 |
| `allow-uvicorn-8000` | tcp:8000 | Cloud Run → uvicorn 直連 |

**Cloud Run nginx.conf：**

```nginx
server {
    listen 8080;
    server_name _;

    location / {
        proxy_pass http://35.201.176.69:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

**重新部署（若需更新 proxy 設定）：**

```bash
# 在 Cloud Shell 執行
cd ~/fintarck-proxy
# 修改 nginx.conf 後
gcloud run deploy fintarck-proxy \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --port 8080
```

---

## 六、GCE 後端除錯

### SSH 連入

```bash
# GCP Console → VM 執行個體 → SSH 按鈕（瀏覽器 SSH）
# 或 Cloud Shell：
gcloud compute ssh fintarck-backend --zone=asia-east1-b
```

### 常用診斷指令

```bash
# 查看即時 log
journalctl -u fastapi -f

# 查看 Nginx 錯誤 log
sudo tail -f /var/log/nginx/error.log

# 確認 port 監聽狀態
sudo ss -tlnp | grep -E '80|443|8000'

# 確認 Nginx 設定正確
sudo nginx -t

# 憑證到期時間
sudo certbot certificates
```

---

## 七、Azure 設定（歷史參考）

> Azure App Service 後端已於 2026-06-03 停用，以下為歷史設定紀錄，保留作回退參考。

### 資源資訊

| 項目 | 狀態 |
|------|------|
| 資源群組 `finance-app-rg`（Southeast Asia） | ✅ 保留中 |
| App Service Plan B1 Linux | ✅ 保留中 |
| Web App `finance-backend-py`（Python 3.11） | ⚠️ 已停用（GCE 穩定 1 週後刪除） |
| Web App `finance-backend`（Node 22） | ⚠️ 已下線（待刪除） |
| Web App `finance-shioaji`（Python 3.11） | ⚠️ 已下線（待刪除） |

### 遷移至 GCE 的原因

| 問題 | 說明 |
|------|------|
| **SNAT 殭屍連線** | App Service 共用 NAT 層靜默關閉閒置 TCP，Shioaji WebSocket 持續斷線。Standard tier VNet Integration（可解）需 ~$73/月 |
| **B1 資源限制** | 1 vCore 在 Shioaji callback thread 與 asyncio event loop 競爭時 thread pool 耗盡 |
| **跨雲 Firestore 延遲** | Azure → Firestore 延遲 ~20–50ms；GCE → Firestore ~1–5ms（同 Google 網路） |

---

## 八、已知問題除錯紀錄

### ❶ Mixed Content（FastAPI 路由尾斜線）

**症狀**：瀏覽器 14 個 Mixed Content 錯誤，API 請求被阻擋  
**根因**：`@router.get("/")` 觸發 FastAPI 307 redirect → Azure SSL 終止後變 `http://` redirect  
**解法**：所有 router 根路由改為 `@router.get("")`（空字串）

---

### ❷ EasyAuth 環境變數名稱不一致

**症狀**：所有 API 回傳 401  
**根因**：`main.py` 讀 `SKIP_AUTH`，但 Azure 設定的是舊名 `EASY_AUTH_BYPASS`  
**解法**：Azure Portal 環境變數改名為 `SKIP_AUTH`

---

### ❸ Python native extension glibc 不相容（Azure）

**症狀**：`ImportError: GLIBC_2.33 not found`  
**根因**：GitHub Actions Ubuntu 預編譯的 `.so` 需要 GLIBC_2.33，Azure 容器版本較舊  
**解法**：`SCM_DO_BUILD_DURING_DEPLOYMENT=true`，讓 Oryx 在 Azure 容器內 pip install

---

### ❹ Azure App Service B1 thread pool 耗盡

**症狀**：Shioaji WebSocket 連線在 Azure 持續不穩定，thread pool 耗盡  
**根因**：SNAT 殭屍連線 + asyncio event loop 與 Shioaji callback thread 競爭  
**解法**：遷移至 GCE（M11），使用標準 Linux TCP stack，問題消失

---

### ❺ `VITE_API_BASE_URL` 被 GitHub Actions 空 Secret 覆蓋

**症狀**：前端部署後 API 呼叫失敗（URL 空白）  
**根因**：workflow 的 Build step 有 `env: VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}`，Secret 未設定時傳入空字串蓋掉 `.env.production`  
**解法**：移除 workflow 中的 `VITE_API_BASE_URL` 環境變數注入，直接維護 `.env.production`

---

### ❻ Cloud Run 504 Gateway Time-out

**症狀**：Cloud Run proxy 回傳 504  
**根因**：nginx.conf 打 GCE port 80，但 port 80 只做 301 redirect；port 8000 未對外開放  
**解法**：GCE 防火牆新增 `allow-uvicorn-8000`（tcp:8000）；nginx.conf 改打 `35.201.176.69:8000`

---

### ❼ GitHub Actions SSH 認證失敗

**症狀**：`ssh: handshake failed: unable to authenticate`  
**根因**：直接寫 `authorized_keys` 被 GCP metadata 同步覆蓋  
**解法**：改用 `gcloud compute instances add-metadata` 將公鑰加入 instance metadata
