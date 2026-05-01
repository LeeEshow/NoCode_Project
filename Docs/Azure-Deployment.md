# Azure 部署文件

> 最後更新：2026-05-01  
> 架構：Azure Static Web Apps（前端）+ Azure App Service Plan B1（後端雙服務）

---

## 部署進度

| 項目 | 狀態 |
|------|------|
| 資源群組 `finance-app-rg`（Southeast Asia） | ✅ |
| App Service Plan B1 Linux | ✅ |
| Web App `finance-backend`（Node 22） | ✅ 正常運行 |
| Web App `finance-shioaji`（Python 3.11） | ✅ 正常運行 |
| Node.js CI/CD（`deploy-backend.yml`） | ✅ |
| Python CI/CD（`deploy-shioaji.yml`） | ✅ |
| Azure Static Web Apps 前端 | ✅ 正常運行 |
| 前端 CORS 設定 | ✅ 正常（cors() 無限制） |

---

## 一、部署規劃 / 架構

### 系統架構

```
使用者瀏覽器
  └─ Azure Static Web Apps（免費）
       └─ React 前端（Vite build 靜態檔）

Azure App Service Plan B1（~$13 USD/月）
  ├─ Web App: finance-backend   → Node.js Express（/api/v1/*）
  └─ Web App: finance-shioaji   → Python FastAPI + Shioaji

Firebase Firestore（保留現有，不遷移）
```

### 費用摘要

| 服務 | 方案 | 月費 |
|------|------|------|
| Azure Static Web Apps | Free | $0 |
| Azure App Service Plan B1 | Linux B1 | ~$13 USD |
| Firebase Firestore | Spark（免費） | $0 |
| **合計** | | **~$13 USD / 月** |

### 實際服務 URL

> ⚠️ Azure App Service 2025 以後建立的預設網域格式為 `{app-name}-{suffix}.{region}-01.azurewebsites.net`，舊格式 `{app-name}.azurewebsites.net` 無效。  
> 實際 URL 在 **Azure Portal → Web App → 概觀 → 預設網域** 查看。

| 服務 | URL |
|------|-----|
| finance-backend | `https://finance-backend-hzhvcpckemgedaeq.southeastasia-01.azurewebsites.net` |
| finance-shioaji | `https://finance-shioaji-bucre4ccehejfvcf.southeastasia-01.azurewebsites.net` |
| finance-frontend | `https://gray-bay-05c35e200.7.azurestaticapps.net` |

### 健康檢查

```bash
curl https://finance-backend-hzhvcpckemgedaeq.southeastasia-01.azurewebsites.net/health
curl https://finance-shioaji-bucre4ccehejfvcf.southeastasia-01.azurewebsites.net/health
# 前端
# 瀏覽 https://gray-bay-05c35e200.7.azurestaticapps.net
```

---

## 二、後端部署參數

### 2-1 finance-backend（Node.js）

**GitHub Actions Secret**

| Secret 名稱 | 說明 |
|-------------|------|
| `AZURE_BACKEND_PUBLISH_PROFILE` | Azure Portal → finance-backend → 概觀 → 下載發行設定檔 |

**環境變數**（Portal → finance-backend → 設定 → 環境變數）

| 名稱 | 值 |
|------|-----|
| `PORT` | `8080` |
| `FIRESTORE_PROJECT_ID` | `nocode-finance` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | serviceAccountKey.json 完整 JSON 內容（單行） |
| `SHIOAJI_API_URL` | `https://finance-shioaji-bucre4ccehejfvcf.southeastasia-01.azurewebsites.net` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` |
| `ApplicationInsightsAgent_EXTENSION_VERSION` | `disabled` |

**啟動命令**（Portal → 設定 → 組態 → 一般設定）

```
node dist/index.js
```

**CI/CD 打包方式**（`deploy-backend.yml`）

只打包 `dist/` + `node_modules/` + `package.json`，排除 `src/` 與 `tsconfig.json`，防止 Oryx 重新 build 覆蓋 `dist/`：

```yaml
- name: Package deployment artifact
  run: |
    mkdir deploy_pkg
    cp -r Back-End/backend/dist deploy_pkg/
    cp -r Back-End/backend/node_modules deploy_pkg/
    cp Back-End/backend/package.json deploy_pkg/
    cd deploy_pkg && zip -r ../deploy.zip .
```

---

### 2-2 finance-shioaji（Python）

**GitHub Actions Secret**

| Secret 名稱 | 說明 |
|-------------|------|
| `AZURE_SHIOAJI_PUBLISH_PROFILE` | Azure Portal → finance-shioaji → 概觀 → 下載發行設定檔 |

**環境變數**（Portal → finance-shioaji → 設定 → 環境變數）

| 名稱 | 值 |
|------|-----|
| `SJ_API_KEY` | 永豐金 API Key |
| `SJ_SECRET_KEY` | 永豐金 Secret Key |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
| `WEBSITES_PORT` | `8000` |

> ⚠️ **`WEBSITES_PORT` 必須設 `8000`，不能用 `8080`**  
> `finance-backend` 與 `finance-shioaji` 共用同一個 App Service Plan 主機，Node.js 佔用了 port 8080。  
> 若 Python 也設 8080，Azure warmup probe 會打到 Node.js 拿到 404，導致 Python 容器無限重啟。

**啟動命令**（Portal → 設定 → 組態 → 一般設定）

```
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**CI/CD 部署方式**（`deploy-shioaji.yml`）

直接上傳原始碼，由 Azure Oryx 在容器內安裝套件（確保 native extension 使用正確的 glibc）：

```yaml
- uses: actions/checkout@v4
- name: Deploy to Azure Web App
  uses: azure/webapps-deploy@v3
  with:
    app-name: finance-shioaji
    publish-profile: ${{ secrets.AZURE_SHIOAJI_PUBLISH_PROFILE }}
    package: Back-End/Shioaji_API
```

> `SCM_DO_BUILD_DURING_DEPLOYMENT=true` 讓 Oryx 在 Azure 容器內跑 `pip install`，  
> 避免在 GitHub Actions（Ubuntu）預裝套件後 native extension 的 glibc 版本與 Azure 容器不相容。

**Always On**（Portal → 設定 → 組態 → 一般設定）

需開啟，因為 Shioaji 帳號登入有次數限制，需保持常連線。

---

## 三、後端除錯與注意事項

### SSH 診斷說明

Azure App Service 有兩種 SSH 入口，行為不同：

| 入口 | 連到哪裡 | 用途 |
|------|---------|------|
| Azure Portal → 開發工具 → SSH | **App 容器**（可測 localhost） | 診斷 app 本身 |
| `{app}.scm.azurewebsites.net/webssh/host` | **SCM/Kudu 容器** | 看 log、看部署狀態 |

兩個容器共用 `/home/LogFiles/`，但網路隔離。從 Kudu SSH 執行 `curl localhost:8080` 不會打到 App。

**診斷用 log 路徑**

```bash
# App 輸出（stdout/stderr，uvicorn log、Python traceback）
cat /home/LogFiles/YYYY_MM_DD_*_default_docker.log | tail -100

# 容器編排 log（啟動/停止/probe 超時）
cat /home/LogFiles/YYYY_MM_DD_*_docker.log | tail -100

# Oryx 建置 log（pip install 過程）
cat /home/LogFiles/YYYY_MM_DD_*_default_scm_docker.log | tail -100

# Node.js 自訂 log
cat /home/LogFiles/node_app.log
```

**重啟指令**

```bash
az webapp restart --name finance-backend --resource-group finance-app-rg
az webapp restart --name finance-shioaji --resource-group finance-app-rg
```

---

### 問題記錄

#### ❶ Japan East 配額不足
**症狀**：建立 App Service Plan 時出現 `SubscriptionIsOverQuotaForSku`。  
**原因**：Azure 訂閱在 Japan East 的 Basic VM 配額為 0。  
**解法**：改用 Southeast Asia 區域。

---

#### ❷ 部署後 `dist/` 被清空（Node.js）
**症狀**：部署成功但 App 找不到模組，Kudu SSH 下 `dist/` 為空。  
**原因**：Azure Oryx 偵測到 `tsconfig.json`，自動重新 build 並覆蓋 `dist/`。  
**解法**：
- `SCM_DO_BUILD_DURING_DEPLOYMENT=false`
- CI/CD 只打包 `dist/` + `node_modules/` + `package.json`，排除 `src/`

---

#### ❸ `bignumber.js` 找不到（Node.js）
**症狀**：`Cannot find module '.../node_modules/bignumber.js/bignumber.js'`  
**原因**：`bignumber.js` 是 `firebase-admin` 間接依賴，`npm prune --production` 後未保留。  
**解法**：在 `package.json` 的 `dependencies` 明確加入 `"bignumber.js": "^9.1.2"`。

---

#### ❹ Kudu SSH 的 Node 版本不同（Node.js）
**症狀**：Kudu SSH 執行 `node dist/index.js` 出現 `Cannot find module 'express'`。  
**原因**：Kudu SSH 是 Node 18.x，App 容器是 Node 22.x，兩者不同容器，native binding 不相容。  
**解法**：Kudu SSH 的錯誤不代表 App 的實際錯誤，應看 docker log。

---

#### ❺ App 無聲崩潰（Application Insights Agent，Node.js）
**症狀**：App 啟動後約 2 分鐘容器重啟，log 無任何錯誤。  
**原因**：Azure 自動注入 Application Insights Agent，與 Node 22 + `firebase-admin` 13.x 不相容，以 SIGKILL 殺掉進程。  
**解法**：環境變數 `ApplicationInsightsAgent_EXTENSION_VERSION=disabled`

---

#### ❻ URL 格式錯誤（Node.js / Python）
**症狀**：App 正常運行，curl 回傳 403。  
**原因**：Azure App Service 2025 以後的預設網域格式改為 `{name}-{suffix}.{region}-01.azurewebsites.net`，舊格式失效。  
**解法**：至 Azure Portal → Web App → 概觀 → 預設網域 查看實際 URL。

---

#### ❼ Python native extension glibc 不相容（Python）
**症狀**：`ImportError: GLIBC_2.33 not found (required by nacl/_sodium.abi3.so)`  
**原因**：在 GitHub Actions Ubuntu（glibc 2.35+）預裝 `shioaji`，編譯的 `.so` 需要 GLIBC_2.33，但 Azure 容器版本較舊。  
**解法**：`SCM_DO_BUILD_DURING_DEPLOYMENT=true`，讓 Oryx 在 Azure 容器內安裝套件。

---

#### ❽ Python 容器 warmup probe 無限超時（Python）
**症狀**：uvicorn 正常啟動，`/health` log 顯示初始化成功，但 230 秒後容器被殺，無限重啟。  
**原因**：`finance-backend`（Node.js）與 `finance-shioaji`（Python）共用同一 App Service Plan 主機，Node.js 佔用 port 8080。Azure warmup probe 打 port 8080 收到 Node.js 的 `Cannot GET /`（404），判定啟動失敗。  
**解法**：Python 改用 port 8000：
- 啟動命令：`python3 -m uvicorn main:app --host 0.0.0.0 --port 8000`
- 環境變數：`WEBSITES_PORT=8000`

---

## 四、前端部署參數

> 狀態：✅ 完成  
> URL：`https://gray-bay-05c35e200.7.azurestaticapps.net`  
> CI/CD：`.github/workflows/azure-static-web-apps-gray-bay-05c35e200.yml`

### 建立 Azure Static Web Apps

```bash
az staticwebapp create \
  --name finance-frontend \
  --resource-group finance-app-rg \
  --location eastasia \
  --source "https://github.com/LeeEshow/NoCode_Project" \
  --branch main \
  --app-location "Front-End/frontend" \
  --output-location "dist" \
  --login-with-github
```

### 環境變數（Portal → Static Web Apps → Configuration）

| 名稱 | 值 |
|------|-----|
| `VITE_API_BASE_URL` | `https://finance-backend-hzhvcpckemgedaeq.southeastasia-01.azurewebsites.net/api/v1` |

### SPA 路由設定

在 `Front-End/frontend/` 建立 `staticwebapp.config.json`：

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/favicon.svg"]
  }
}
```

### CORS 設定

前端網域確認後，更新 `Back-End/backend/src/index.ts` 的 CORS allowlist，加入 Static Web Apps 網域。
