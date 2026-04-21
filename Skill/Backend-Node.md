# Backend Node.js 架構設計指南（TypeScript 版）

## 🎯 設計定位

本後端採用「**薄 API 層**」設計：

| 層級 | 職責 |
|------|------|
| **DB（Firestore）** | 純資料存放，不含任何邏輯 |
| **後端（Node.js）** | 存取 DB，將資料物件化為 DTO 後回傳前端 |
| **前端（React）** | 接收 JSON，透過 Model 層反序列化，所有計算與互動在 MVVM 框架內完成 |

> 後端不計算、不判斷業務，只負責「資料搬運與物件化」。

---

## 🏗️ 資料夾結構

```plaintext
backend/src/
│
├── lib/                        ← Tool Box（共用工具）
│   ├── firebase.ts             ✅ Firestore 初始化
│   ├── cache.ts                ✅ node-cache getOrSet 工具
│   ├── errors.ts               ✅ 自訂例外類別
│   └── response.ts             ✅ 統一 API Response 格式
│
├── types/                      ← DTO 定義（Firestore ↔ JSON 契約）
│   ├── holding.ts
│   ├── transaction.ts
│   ├── market.ts
│   ├── plan.ts
│   └── settings.ts
│
├── repositories/               ← 資料存取層（唯一與 Firestore 溝通的地方）
│   ├── HoldingRepository.ts
│   ├── TransactionRepository.ts
│   ├── PlanRepository.ts
│   └── SettingsRepository.ts
│
├── controllers/                ← HTTP 處理層（取參數 → 呼叫 Repository → 回傳 JSON）
│   ├── HoldingController.ts
│   ├── TransactionController.ts
│   ├── MarketController.ts     ← Yahoo Finance + Cache，不存 DB
│   ├── PlanController.ts
│   ├── StockController.ts
│   └── SettingsController.ts
│
├── routes/                     ← 路由定義（只做對應，不含邏輯）
│   ├── holdings.ts
│   ├── transactions.ts
│   ├── market.ts
│   ├── plan.ts
│   ├── stocks.ts
│   └── settings.ts
│
├── middleware/
│   └── errorHandler.ts         ← 全域例外處理
│
└── index.ts                    ← App 入口
```

---

## 🔄 請求流程

```
HTTP Request
    │
    ▼
[ Route ]         → 路由定義，對應 Controller 方法
    │
    ▼
[ Controller ]    → 解析 req 參數，呼叫 Repository，sendSuccess 回傳
    │
    ▼
[ Repository ]    → Firestore CRUD，資料轉為 DTO 後回傳
    │
    ▼
[ Firestore ]
```

**原則：Controller 不碰 Firestore，Repository 不碰 req/res。**

---

## 🧱 各層設計說明

### 1. `lib/errors.ts`

```typescript
export class AppError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
export class NotFoundError extends AppError {
  constructor(resource: string) { super(404, `${resource} 不存在`); }
}
export class ValidationError extends AppError {
  constructor(message: string) { super(400, message); }
}
```

---

### 2. `lib/response.ts`

```typescript
export const sendSuccess = <T>(res: Response, data: T, status = 200) =>
  res.status(status).json({ success: true, data });

export const sendNoContent = (res: Response) => res.status(204).send();
```

---

### 3. `types/`（DTO，資料契約）

欄位命名統一 `snake_case`，與 Firestore 欄位保持一致，前端 Model 層負責轉換為 `camelCase`。

```typescript
// types/holding.ts
export interface HoldingResponseDTO {
  stock_id: string;
  stock_name: string;
  shares_held: number;
  avg_cost: number;
  total_cost: number;
  realized_profit: number;
  current_price?: number;   // 由 MarketController 即時注入
  change?: number;
  change_percent?: number;
}
```

---

### 4. `repositories/`（資料存取層）

Repository 只負責 Firestore 讀寫，**不含任何業務判斷**，回傳 DTO。

```typescript
// repositories/HoldingRepository.ts
import { db } from '../lib/firebase';
import { HoldingResponseDTO } from '../types/holding';

export class HoldingRepository {
  private col = db.collection('holdings');

  async findAll(): Promise<HoldingResponseDTO[]> {
    const snap = await this.col.get();
    return snap.docs.map((doc) => ({ stock_id: doc.id, ...doc.data() } as HoldingResponseDTO));
  }

  async findById(stockId: string): Promise<HoldingResponseDTO | null> {
    const doc = await this.col.doc(stockId).get();
    if (!doc.exists) return null;
    return { stock_id: doc.id, ...doc.data() } as HoldingResponseDTO;
  }

  async save(stockId: string, data: Partial<HoldingResponseDTO>): Promise<void> {
    await this.col.doc(stockId).set(data, { merge: true });
  }

  async delete(stockId: string): Promise<void> {
    await this.col.doc(stockId).delete();
  }
}
```

---

### 5. `controllers/`（HTTP 處理層）

Controller 只負責：**解析 req → 呼叫 Repository → 回傳 JSON**，不含計算。

```typescript
// controllers/HoldingController.ts
import { Request, Response, NextFunction } from 'express';
import { HoldingRepository } from '../repositories/HoldingRepository';
import { sendSuccess } from '../lib/response';

export class HoldingController {
  private repo = new HoldingRepository();

  getAll = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.repo.findAll();
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.repo.findById(req.params.stockId);
      if (!data) return next(new NotFoundError('Holding'));
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };
}
```

```typescript
// controllers/MarketController.ts
// 特殊：不存 DB，直接呼叫 Yahoo Finance + Cache

import { getOrSet } from '../lib/cache';
import axios from 'axios';

export class MarketController {
  getIndices = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getOrSet('market:indices', () => this.fetchIndices(), 60);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };

  private async fetchIndices() {
    // 呼叫 Yahoo Finance，回傳 MarketIndexResponseDTO[]
  }
}
```

---

### 6. `routes/`（路由定義）

```typescript
// routes/holdings.ts
import { Router } from 'express';
import { HoldingController } from '../controllers/HoldingController';

const router = Router();
const ctrl = new HoldingController();

router.get('/', ctrl.getAll);
router.get('/:stockId', ctrl.getById);

export default router;
```

---

### 7. `middleware/errorHandler.ts`

```typescript
import { AppError } from '../lib/errors';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, error: '伺服器內部錯誤' });
};
```

---

### 8. `index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import holdingRoutes    from './routes/holdings';
import transactionRoutes from './routes/transactions';
import marketRoutes     from './routes/market';
import planRoutes       from './routes/plan';
import stockRoutes      from './routes/stocks';
import settingsRoutes   from './routes/settings';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const api = '/api/v1';
app.use(`${api}/holdings`,     holdingRoutes);
app.use(`${api}/transactions`, transactionRoutes);
app.use(`${api}/market`,       marketRoutes);
app.use(`${api}/plan`,         planRoutes);
app.use(`${api}/stocks`,       stockRoutes);
app.use(`${api}/settings`,     settingsRoutes);

app.use(errorHandler);
app.listen(process.env.PORT ?? 3001);
```

---

## 📐 責任分離對照表

| 層級 | 職責 | 禁止事項 |
|------|------|---------|
| **Route** | 路由定義 | 不含任何邏輯 |
| **Controller** | 解析 req/res，呼叫 Repository | 不碰 Firestore，不做計算 |
| **Repository** | Firestore CRUD，資料轉 DTO | 不含業務判斷 |
| **lib/** | 共用工具 | 不含業務邏輯 |
| **types/** | DTO 契約定義 | 不含行為方法 |

---

## ⚠️ 命名規範

| 對象 | 規則 | 範例 |
|------|------|------|
| Class | PascalCase | `HoldingController` |
| Method | camelCase | `getAll`, `findById` |
| DTO 欄位 | snake_case | `stock_id`, `avg_cost` |
| Firestore 欄位 | snake_case（與 DTO 一致） | `stock_id` |
| 檔案（Class） | PascalCase | `HoldingRepository.ts` |
| 檔案（其他） | camelCase | `errorHandler.ts` |

---

## 🧠 前後端職責邊界

| 功能 | 後端 | 前端 |
|------|------|------|
| 資料讀寫 | ✅ Repository | ❌ |
| 即時股價（Yahoo Finance） | ✅ Cache + 回傳 | ❌ |
| 庫存計算（均價、未實現損益） | ❌ | ✅ ViewModel |
| 成本方法切換（保留法/歸還法） | ❌ | ✅ ViewModel |
| 複利試算 | ❌ | ✅ ViewModel |
| 年度結算計算 | ❌ | ✅ ViewModel |
| UI 互動邏輯 | ❌ | ✅ View |
