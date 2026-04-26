# 個人理財雲端系統 — 前端開發任務清單

> 參考文件：Front-End\CLAUDE.md

**指派後端開發**：遇到以下情況，請把後端開發需求寫入 D:\Project\NoCode_Project\Back-End\Task_Backend.md 任務清單的最後段
> 1. 前端設計變更，影響後端API資料結構
> 2. 新增功能需後端開發新API
> 3. 前端發現API資訊異常，需要後端排錯時

---

## Phase 9：持股展開區 Tab 化（已完成 2026-04-25）

> 展開區改用 Tab 切換（K線 / 籌碼 & 基本面），Tab 列靠左垂直排列。

- [x] P9-01：`ExpandTab` 型別 + `ChipDTO` + `preferencesModel` `setExpandTab`
- [x] P9-02：`useHoldingsViewModel` 加入 `chips` 狀態與 `ensureExpandData` 擴充（同時 fetch K線/基本面/籌碼）
- [x] P9-03：`HoldingsTable` `ExpandRow` 改為 Tab 架構（左側垂直 TabBar、固定高度 340px 防跳動、法人圖表 + 基本面左右排版）

### 待排查問題（P9-BUG）

- [ ] **P9-BUG-01**：法人日期顯示異常（X 軸仍出現非日期字串）— 確認後端 `T86` 爬蟲 `row[0]` 格式是否包含非 `民國年/月/日` 的資料列（如標題行），需後端過濾或前端比對後跳過
- [ ] **P9-BUG-02**：法人圖表顏色未按法人區分（外資/投信/自營商應各自固定顏色，目前依正負值變色）— 前端改為每個 series 固定一種顏色，正負以透明度或深淺區別
- [ ] **P9-BUG-03**：基本面資料為空 — 確認後端 `GET /stocks/:id/profile` 回傳的 `revenue / grossMargin / roe / roa` 欄位是否有資料；若 Yahoo Finance 無此資料則需標記欄位來源限制
- [ ] **P9-BUG-04**：展開空間預設 Tab 應為 K 線 — 確認 `DEFAULT_PREFERENCES.expandTab = 'kline'` 且 `usePreferencesViewModel` 初始化時 localStorage 未覆蓋為其他值
- [ ] **P9-BUG-05**：K 線 Tooltip 數值異常（如 open=117 但圖表顯示 2100+ 區間）— 排查方向：
  1. 前端 `KLineChart.tsx:138` tooltip formatter 的 `[o, c, l, h]` 對應 ECharts `[open, close, low, high]`，確認 label 正確
  2. 截圖顯示 `lowest: 2185 > highest: 2105`（不合理），懷疑後端某日資料 open 欄位回傳異常值（split-adjusted 舊價、null fallback 為非零值、或 Yahoo Finance 欄位錯位）
  3. 確認後端 `Stock.getHistory()` 回傳的 `quotes.open?.[i]` 是否有特定日期出現與其他欄位不同 magnitude 的值；必要時加 `filter(p => p.open > 0)` 保護

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

## Deploy：Google Cloud 部署

> 前端 → **Firebase Hosting**（靜態 Vite build）  
> 後端 → **Cloud Run**（Docker 容器，Express + Node.js）  
> 資料庫已在 Firestore，與 Cloud Run 同 GCP project 可直接存取。

---

### 前置準備

- [ ] **D-01**：安裝工具
  ```bash
  # Google Cloud CLI
  winget install Google.CloudSDK
  gcloud auth login
  gcloud config set project <YOUR_PROJECT_ID>

  # Firebase CLI（前端部署用）
  npm install -g firebase-tools
  firebase login
  ```

- [ ] **D-02**：開啟 GCP API
  ```bash
  gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    iap.googleapis.com \
    cloudscheduler.googleapis.com \
    secretmanager.googleapis.com
  ```

---

### 後端部署（Cloud Run）

- [ ] **D-03**：在 `Back-End/backend/` 新增 `Dockerfile`
  ```dockerfile
  FROM node:20-slim
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev
  COPY . .
  RUN npm run build
  EXPOSE 3001
  CMD ["node", "dist/index.js"]
  ```

- [ ] **D-04**：新增 `.dockerignore`（`Back-End/backend/`）
  ```
  node_modules
  src
  .env
  serviceAccountKey.json
  ```

- [ ] **D-05**：Firestore 金鑰改用 **Secret Manager**（不要把 `serviceAccountKey.json` 打進 image）
  ```bash
  gcloud secrets create firestore-key --data-file=serviceAccountKey.json
  ```
  後端 `src/firebase.ts` 改為從環境變數讀取 JSON：
  ```ts
  const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? admin.credential.applicationDefault()
    : admin.credential.cert(require('./serviceAccountKey.json'));
  ```
  Cloud Run 部署時加 `--service-account` 並賦予 Secret Manager Accessor 角色。

- [ ] **D-06**：Build & Push image 到 Artifact Registry
  ```bash
  cd Back-End/backend
  gcloud artifacts repositories create finance-repo \
    --repository-format=docker --location=asia-east1
  gcloud builds submit --tag asia-east1-docker.pkg.dev/<PROJECT_ID>/finance-repo/backend:latest
  ```

- [ ] **D-07**：部署到 Cloud Run
  ```bash
  gcloud run deploy finance-backend \
    --image asia-east1-docker.pkg.dev/<PROJECT_ID>/finance-repo/backend:latest \
    --region asia-east1 \
    --allow-unauthenticated \
    --port 3001 \
    --set-env-vars NODE_ENV=production \
    --set-secrets FIRESTORE_KEY=firestore-key:latest
  ```
  部署完成後取得 Cloud Run URL（格式：`https://finance-backend-xxxx-de.a.run.app`）

---

### 前端部署（Firebase Hosting）

- [ ] **D-08**：設定 `VITE_API_BASE_URL`  
  在 `Front-End/frontend/` 新增 `.env.production`：
  ```env
  VITE_API_BASE_URL=https://finance-backend-xxxx-de.a.run.app/api/v1
  ```

- [ ] **D-09**：Build 前端
  ```bash
  cd Front-End/frontend
  npm run build
  # 產出在 dist/
  ```

- [ ] **D-10**：初始化 Firebase Hosting（首次執行）
  ```bash
  cd Front-End
  firebase init hosting
  # 選 Use existing project → 選 GCP project
  # Public directory: frontend/dist
  # Single-page app: YES
  # Overwrite index.html: NO
  ```

- [ ] **D-11**：部署前端
  ```bash
  firebase deploy --only hosting
  # 完成後取得 https://<project-id>.web.app
  ```

---

### 部署後驗證

- [ ] **D-12**：確認後端 API 可連線
  ```bash
  curl https://finance-backend-xxxx-de.a.run.app/api/v1/market/indices
  ```

- [ ] **D-13**：確認前端可正常呼叫後端（無 CORS 錯誤）  
  後端 `src/index.ts` 的 `cors()` 設定需加入 Firebase Hosting domain：
  ```ts
  cors({ origin: ['https://<project-id>.web.app', 'http://localhost:5173'] })
  ```

- [ ] **D-14**：確認 Firestore 讀寫正常（持股、關注清單、偏好設定）

- [ ] **D-15**：（選用）設定自訂網域  
  Firebase Hosting → Add custom domain  
  Cloud Run → 可透過 Firebase Hosting Rewrite `/api/**` 轉發，統一在同一域名下

---

### Identity-Aware Proxy（IAP）設定

> 目的：讓 Cloud Run 後端只接受來自自己（已登入 Google 帳號）的請求，阻擋外部直接存取 API。

- [ ] **D-16**：**移除** Cloud Run 的 `--allow-unauthenticated`，改為需要身份驗證
  ```bash
  gcloud run services update finance-backend \
    --region asia-east1 \
    --no-allow-unauthenticated
  ```

- [ ] **D-17**：建立 OAuth 同意畫面（首次設定）
  - GCP Console → API & Services → OAuth consent screen
  - User type 選 **Internal**（個人使用，僅限同 Google Workspace 帳號）
  - 填入應用程式名稱、支援信箱（`h6f9wtxchb@gmail.com`）

- [ ] **D-18**：建立 OAuth 2.0 用戶端 ID
  - GCP Console → API & Services → Credentials → Create OAuth Client ID
  - Application type：**Web application**
  - Authorized JavaScript origins：加入 `https://<project-id>.web.app`
  - 取得 `CLIENT_ID`（後續前端用）

- [ ] **D-19**：啟用 IAP for Cloud Run  
  ```bash
  # 需先建立 Load Balancer 指向 Cloud Run（IAP 只支援透過 LB 的流量）
  # 1. 建立 Serverless NEG
  gcloud compute network-endpoint-groups create finance-backend-neg \
    --region=asia-east1 \
    --network-endpoint-type=serverless \
    --cloud-run-service=finance-backend

  # 2. 建立 Backend Service
  gcloud compute backend-services create finance-backend-bs \
    --global \
    --load-balancing-scheme=EXTERNAL

  gcloud compute backend-services add-backend finance-backend-bs \
    --global \
    --network-endpoint-group=finance-backend-neg \
    --network-endpoint-group-region=asia-east1

  # 3. 建立 URL map、HTTPS proxy、Forwarding rule（需要 SSL 憑證）
  # → 建議在 GCP Console 用 Load Balancing 精靈操作較直觀

  # 4. 啟用 IAP on Backend Service
  gcloud iap web enable \
    --resource-type=backend-services \
    --service=finance-backend-bs \
    --oauth2-client-id=<CLIENT_ID> \
    --oauth2-client-secret=<CLIENT_SECRET>
  ```

- [ ] **D-20**：前端加入 IAP Token 取得邏輯  
  每次呼叫 API 前需帶上 Google ID Token，`axios.ts` 加入 request interceptor：
  ```ts
  // 需先在 index.html 載入 Google Identity Services
  // <script src="https://accounts.google.com/gsi/client" async></script>

  api.interceptors.request.use(async config => {
    const token = await getGoogleIdToken(); // 用 GIS tokenClient 取得
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    return config;
  });
  ```
  > ⚠️ 實作前先確認是否需要 IAP：若系統僅個人使用且無公開風險，可暫時用 Cloud Run 的 **`--allow-unauthenticated` + Secret API Key header** 替代，較簡單。

- [ ] **D-21**：賦予自己帳號 IAP-secured Web App User 角色
  ```bash
  gcloud iap web add-iam-policy-binding \
    --resource-type=backend-services \
    --service=finance-backend-bs \
    --member="user:h6f9wtxchb@gmail.com" \
    --role="roles/iap.httpsResourceAccessor"
  ```

---

### 每日快照自動化（Cloud Scheduler）

> 目的：每天收盤後自動抓取當日股票市值、外幣資產、流動資金，建立 DailySnapshot 紀錄。

- [ ] **D-22**：後端新增快照觸發端點（`POST /api/v1/snapshots/auto`）
  - 計算當日 `stockValue`（所有 holdings × 即時價格）
  - 計算當日 `forexValue`（外幣資產換算台幣）
  - `cashBalance` 沿用最近一筆或設為 0（使用者可手動修正）
  - 若當日已有快照則跳過（冪等）
  - 此端點加上 `x-scheduler-secret` header 驗證，防止外部呼叫

- [ ] **D-23**：在 Secret Manager 儲存 Scheduler 共用密鑰
  ```bash
  echo -n "your-random-secret-string" | \
    gcloud secrets create scheduler-secret --data-file=-
  ```
  後端從環境變數讀取並比對 header：
  ```ts
  if (req.headers['x-scheduler-secret'] !== process.env.SCHEDULER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  ```

- [ ] **D-24**：建立 Cloud Scheduler Job
  ```bash
  gcloud scheduler jobs create http finance-daily-snapshot \
    --location=asia-east1 \
    --schedule="0 15 * * 1-5" \
    --time-zone="Asia/Taipei" \
    --uri="https://<CLOUD_RUN_OR_LB_URL>/api/v1/snapshots/auto" \
    --http-method=POST \
    --headers="Content-Type=application/json,x-scheduler-secret=<SECRET>" \
    --message-body="{}"
  ```
  > 排程說明：`0 15 * * 1-5` = 台北時間週一至週五 15:00（台股收盤後 30 分鐘）

- [ ] **D-25**：手動觸發測試
  ```bash
  gcloud scheduler jobs run finance-daily-snapshot --location=asia-east1
  ```
  確認 Firestore `snapshots` collection 有新增當日文件。

- [ ] **D-26**：（選用）失敗通知  
  Cloud Scheduler → Edit Job → 設定 Pub/Sub dead-letter topic，或直接在 Cloud Run log 設 Error alerting policy 發 Email 通知。
