# Backend Node.js + Firestore 架構設計原則

## 🎯 設計定位

本後端採用「**薄 API 層**」設計，語言為 TypeScript：

| 層級 | 職責 |
|------|------|
| **DB（Firestore）** | 純資料存放，不含任何邏輯 |
| **後端（Node.js）** | Model 自行存取 DB、反序列化為物件，Controller 直接呼叫 Model |
| **前端（React）** | 接收 JSON，透過 Model 層反序列化，所有計算與互動在 MVVM 框架內完成 |

> 後端不「投資決策與商務演算法」，但允許「外部數據聚合與注入」。

---

## ☁️ GCP 部署相容性

| 項目 | 結果 |
|------|------|
| **Google Cloud Run** | ✅ **完整支援** — Node.js 跑 Linux 容器，Cloud Run 原生支援 |
| **Google Cloud Firestore** | ✅ **完整支援** — Firebase Admin SDK 官方 Node.js 套件 |

---

## 🏗️ 資料夾結構

```plaintext
src/
│
├── index.ts                    ← 入口點（Express app 啟動）
├── routes/                     ← 路由定義（URL 對應 Controller）
├── controllers/                ← HTTP 處理層（解析參數 → 呼叫 Model → 回傳 JSON）
├── models/                     ← 物件結構 + Firestore 操作 + 反序列化（三合一）
├── middleware/                 ← 全域 Middleware（例外處理等）
└── global/                     ← 共用工具（Firestore 初始化、Cache、Response 格式）
```

---

## 🔄 請求流程

```
HTTP Request
    │
    ▼
[ Express Router ]    → 路由對應 Controller
    │
    ▼
[ Controller ]        → 解析參數，呼叫 Model 方法，回傳 JSON
    │
    ▼
[ Model ]             → Firestore CRUD + 反序列化為物件
    │
    ▼
[ Firestore ]
    
    ※ errorHandler middleware 包覆整個管道，統一處理例外
```

**原則：Controller 不碰 Firestore，Model 不碰 Request/Response。**

---

## 🧱 各層設計說明

### 1. `index.ts`（入口點）

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import holdingsRouter    from './routes/holdings';
import transactionsRouter from './routes/transactions';
import marketRouter      from './routes/market';
import planRouter        from './routes/plan';
import stocksRouter      from './routes/stocks';
import settingsRouter    from './routes/settings';

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const api = '/api/v1';
app.use(`${api}/holdings`,     holdingsRouter);
app.use(`${api}/transactions`, transactionsRouter);
app.use(`${api}/market`,       marketRouter);
app.use(`${api}/plan`,         planRouter);
app.use(`${api}/stocks`,       stocksRouter);
app.use(`${api}/settings`,     settingsRouter);

// 全域錯誤處理一定最後
app.use(errorHandler);

const port = process.env.PORT ?? 3001;
app.listen(port, () => console.log(`Server running on port ${port}`));
```

---

### 2. `middleware/errorHandler.ts`（全域例外處理）

```typescript
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message    = err instanceof AppError ? err.message : '伺服器內部錯誤';
  res.status(statusCode).json({ success: false, error: message });
};
```

---

### 3. `global/apiResponse.ts`（統一 Response 格式）

```typescript
export const ApiResponse = {
  success: (data: unknown) => ({ success: true, data }),
  error:   (message: string) => ({ success: false, error: message }),
};
```

**Controller 用法：**

```typescript
res.json(ApiResponse.success(data));
res.status(404).json(ApiResponse.error('Holding 不存在'));
```

---

### 4. `global/firebase.ts`（Firestore 初始化）

```typescript
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId:  process.env.FIRESTORE_PROJECT_ID,
  });
}

export const db = admin.firestore();
```

`.env`：
```
FIRESTORE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
PORT=3001
```

---

### 5. `global/cache.ts`（node-cache）

```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache();

export const getOrSet = async <T>(
  key: string,
  factory: () => Promise<T>,
  ttlSeconds = 60
): Promise<T> => {
  const cached = cache.get<T>(key);
  if (cached !== undefined) return cached;

  const value = await factory();
  cache.set(key, value, ttlSeconds);
  return value;
};
```

---

### 6. `models/Holding.ts`（Model 範例）

每個 Model 同時乘載三件事：**屬性結構**、**Firestore 操作方法**、**反序列化（fromSnapshot）**。
各 Model 自行宣告對應的 Firestore Collection，不使用抽象基底類別。

```typescript
import { db } from '../global/firebase';
import { DocumentSnapshot } from 'firebase-admin/firestore';

export class Holding {
  // ── 屬性 ────────────────────────────────────────
  stockId!:        string;
  stockName!:      string;
  sharesHeld!:     number;
  avgCost!:        number;
  totalCost!:      number;
  realizedProfit!: number;

  // 即時股價由 MarketController 注入，不存 Firestore
  currentPrice?:  number;
  change?:        number;
  changePercent?: number;

  private static readonly col = db.collection('holdings');

  // ── 讀取 ────────────────────────────────────────

  /** 取得所有庫存 */
  static async findAll(): Promise<Holding[]> {
    const snap = await this.col.get();
    return snap.docs.map(doc => Holding.fromSnapshot(doc));
  }

  /** 依 stockId 取得單筆庫存 */
  static async findById(stockId: string): Promise<Holding | null> {
    const doc = await this.col.doc(stockId).get();
    return doc.exists ? Holding.fromSnapshot(doc) : null;
  }

  // ── 寫入 ────────────────────────────────────────

  /** 新增或更新庫存 */
  async save(): Promise<void> {
    await Holding.col.doc(this.stockId).set(this.toFirestoreData(), { merge: true });
  }

  /** 刪除庫存 */
  async delete(): Promise<void> {
    await Holding.col.doc(this.stockId).delete();
  }

  // ── 反序列化 ─────────────────────────────────────

  /** Firestore DocumentSnapshot → Holding 物件 */
  private static fromSnapshot(doc: DocumentSnapshot): Holding {
    const data = doc.data()!;
    const h = new Holding();
    h.stockId        = doc.id;
    h.stockName      = data['stock_name'];
    h.sharesHeld     = data['shares_held'];
    h.avgCost        = data['avg_cost'];
    h.totalCost      = data['total_cost'];
    h.realizedProfit = data['realized_profit'];
    return h;
  }

  /** Holding 物件 → Firestore 寫入用 object */
  private toFirestoreData(): Record<string, unknown> {
    return {
      stock_name:      this.stockName,
      shares_held:     this.sharesHeld,
      avg_cost:        this.avgCost,
      total_cost:      this.totalCost,
      realized_profit: this.realizedProfit,
    };
  }
}
```

---

### 7. `controllers/holdingsController.ts`（Controller 範例）

```typescript
import { Request, Response, NextFunction } from 'express';
import { Holding } from '../models/Holding';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

export const getAll = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await Holding.findAll();
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await Holding.findById(req.params.stockId);
    if (!data) throw new AppError(404, 'Holding 不存在');
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const save = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const holding = Object.assign(new Holding(), req.body) as Holding;
    await holding.save();
    res.json(ApiResponse.success(holding));
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const holding = Object.assign(new Holding(), { stockId: req.params.stockId });
    await holding.delete();
    res.status(204).send();
  } catch (err) { next(err); }
};
```

---

### 8. `routes/holdings.ts`（路由定義）

```typescript
import { Router } from 'express';
import * as ctrl from '../controllers/holdingsController';

const router = Router();

router.get('/',          ctrl.getAll);
router.get('/:stockId',  ctrl.getById);
router.post('/',         ctrl.save);
router.delete('/:stockId', ctrl.remove);

export default router;
```

---

### 9. MarketController（Yahoo Finance + Cache）

```typescript
// controllers/marketController.ts
import { Request, Response, NextFunction } from 'express';
import { getOrSet } from '../global/cache';
import { MarketIndex } from '../models/MarketIndex';
import { ApiResponse } from '../global/apiResponse';

export const getIndices = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getOrSet('market:indices', () => MarketIndex.fetchAll(), 60);
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const getExportIndicator = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getOrSet('market:export-indicator', () => MarketIndex.fetchExportIndicator(), 3600);
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};
```

---

## 📦 npm 套件清單

| 套件 | 用途 |
|------|------|
| `express` | Web 框架 |
| `cors` | CORS 支援 |
| `dotenv` | 環境變數 |
| `firebase-admin` | Firestore SDK |
| `node-cache` | In-memory Cache（TTL） |
| `axios` | 呼叫外部 API（Yahoo Finance） |
| `typescript` | TypeScript 編譯器 |
| `@types/express` | Express 型別定義 |

---

## 📐 責任分離對照表

| 層級 | 職責 | 禁止事項 |
|------|------|---------|
| **Middleware** | 全域例外處理 | 不含業務邏輯 |
| **Controller** | 解析 Request，呼叫 Model，回傳 JSON | 不碰 Firestore，不做計算 |
| **Model** | 屬性定義、Firestore CRUD、反序列化 | 不含業務計算、不碰 Request/Response |
| **Global/** | 共用工具（Firestore、Cache、Response） | 不含業務邏輯 |

---

## ⚠️ 命名規範

| 對象 | 規則 | 範例 |
|------|------|------|
| Class | PascalCase | `Holding` |
| Method / 函式 | camelCase | `findAll`, `fromSnapshot` |
| 屬性（TypeScript） | camelCase | `stockId`, `avgCost` |
| JSON 輸出欄位 | camelCase（TypeScript 屬性直接序列化） | `stockId`, `avgCost` |
| Firestore 欄位 | snake_case（`fromSnapshot` / `toFirestoreData` 手動對應） | `stock_id`, `avg_cost` |
| 檔案名稱（Class） | PascalCase | `Holding.ts` |
| 檔案名稱（其他） | camelCase | `holdingsController.ts` |

---

## 🧠 前後端職責邊界

| 功能 | 後端 | 前端 |
|------|------|------|
| 資料讀寫 | ✅ Model | ❌ |
| 即時股價（Yahoo Finance） | ✅ Cache + 回傳 | ❌ |
| 庫存計算（均價、未實現損益） | ❌ | ✅ ViewModel |
| 成本方法切換（保留法/歸還法） | ❌ | ✅ ViewModel |
| 複利試算 | ❌ | ✅ ViewModel |
| UI 互動邏輯 | ❌ | ✅ View |

---

## 🚀 開發 & 部署

### 開發環境
- **執行**：`npm run dev`（ts-node-dev 熱重載）
- **Firestore 本地模擬**：Firebase Emulator Suite（`firebase emulators:start`）
- **環境設定**：`.env` 檔案

### GCP Cloud Run 部署
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

```bash
# 建置並部署
npm run build
gcloud run deploy finance-api \
  --source . \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated
```
