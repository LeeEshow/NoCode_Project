# 📘 React.js Skill - MVVM 架構設計指南

## 🧠 Skill 名稱

**Front-End React MVVM Architect**

---

## 🎯 Skill 目標

建立一套基於 **MVVM（Model-View-ViewModel）架構** 的 React + TypeScript 開發模式，達成：

* 清晰的職責分離（Separation of Concerns）
* 提升可維護性與可測試性
* 強型別保障（Type Safety）
* 支援未來專案擴展性
* 統一開發風格

---

## 🏗️ 架構說明（MVVM in React + TypeScript）

```plaintext
📁 src
 ├── 📂 api             → Axios 實例與攔截器配置
 ├── 📂 types           → DTO / Domain 型別定義
 ├── 📂 models          → API 呼叫 + DTO → Domain 轉換（Repository / DataSource）
 ├── 📂 viewmodels      → 核心邏輯層（以 Custom Hook 實作）
 └── 📂 views
      ├── 📂 layout     → 版面元件（Layout / Nav）
      ├── 📂 components → UI 原子元件
      └── 📂 pages      → Page（組裝 View + ViewModel
```

---

## 🔍 MVVM 對應關係

| MVVM      | React 對應              |
| --------- | ----------------------- |
| Model     | Types + Models          |
| View      | Components / Pages      |
| ViewModel | Custom Hooks            |

---

## 📐 資料流向

```
後端 API 回傳 JSON（snake_case DTO）
         │
         ▼
   [ Model ]        ← （API + DTO → Domain 轉換）
         │
         ▼
   [ ViewModel ]    ← 狀態管理 + 跨資料彙總邏輯 + 商務邏輯處理
         │
         ▼
    [ View ]        ← 負責 UI 與展示層邏輯（presentation logic），不含資料來源與商務邏輯
```

---

## 🧱 1. Types（型別定義）

兩種型別並存：

- **DTO**：對應後端 JSON 格式（`snake_case`），用於 Model 層的 API 呼叫
- **Domain**：前端使用的格式（`camelCase`），含衍生欄位

```typescript
// types/holding.ts

export interface HoldingDTO {
  stock_id: string;
  avg_cost: number;
  current_price?: number;
  // ... 後端原始欄位
}

export interface Holding {
  stockId: string;
  avgCost: number;
  currentPrice: number;
  unrealizedProfit: number;   // 衍生欄位，後端不提供
  isUp: boolean;              // 衍生欄位，後端不提供
  // ... 前端使用欄位
}
```

---

## 🔄 2. Model（資料存取 + 反序列化層）

**職責：打 API + 將 DTO 轉換為 Domain 物件（一層完成）**
**不負責：React state 、 跨多筆資料的彙總邏輯**

```typescript
// models/holdingModel.ts
import { apiClient } from '../api/axios';
import { HoldingDTO, Holding } from '../types/holding';

// 打 API，回傳已轉換的 Domain 物件
export const fetchHoldings = async (): Promise<Holding[]> => {
  const res = await apiClient.get<HoldingDTO[]>('/holdings');
  return res.data.map(fromDTO);
};

export const fetchHolding = async (stockId: string): Promise<Holding> => {
  const res = await apiClient.get<HoldingDTO>(`/holdings/${stockId}`);
  return fromDTO(res.data);
};

// 私有轉換函式（snake_case → camelCase + 計算衍生欄位）
const fromDTO = (dto: HoldingDTO): Holding => {
  const currentPrice = dto.current_price ?? 0;
  const change = dto.change ?? 0;
  return {
    stockId: dto.stock_id,
    avgCost: dto.avg_cost,
    currentPrice,
    change,
    unrealizedProfit: (currentPrice - dto.avg_cost) * dto.shares_held * 1000,
    unrealizedProfitRate: dto.avg_cost > 0 ? (currentPrice - dto.avg_cost) / dto.avg_cost : 0,
    isUp: change >= 0,
    // ...
  };
};
```

---

## 🌐 3. API（Axios 設定）

```typescript
// api/axios.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);
```

---

## 🧠 4. ViewModel（邏輯層）
定位說明
ViewModel 是「邏輯聚合層」
在 React 中以 Custom Hook 實作
小型專案 ✅ 直接使用 useState，避免不必要複雜化

**職責：呼叫 Model、管理 state、處理跨資料彙總**

```typescript
// viewmodels/useHoldingsViewModel.ts
import { useEffect, useState, useCallback } from 'react';
import { fetchHoldings } from '../models/holdingModel';
import { Holding } from '../types/holding';

export const useHoldingsViewModel = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 跨多筆資料的彙總邏輯（Model 層不做）
  const totalUnrealizedProfit = holdings.reduce((sum, h) => sum + h.unrealizedProfit, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);
  const totalUnrealizedProfitRate = totalCost > 0 ? totalUnrealizedProfit / totalCost : 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHoldings(await fetchHoldings());  // Model 已回傳 Domain 物件，直接 set
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { holdings, loading, error, totalUnrealizedProfit, totalUnrealizedProfitRate, reload: load };
};
```

---

## 🎨 5. View（Component / Page）

**職責：只包含 UI 與展示層邏輯，與人機互動**

```typescript
// views/pages/StockOverviewPage.tsx
import { useHoldingsViewModel } from '../../viewmodels/useHoldingsViewModel';

const StockOverviewPage: React.FC = () => {
  const vm = useHoldingsViewModel();

  return (
    <div>
      {vm.loading && <p>Loading...</p>}
      {vm.holdings.map(h => (
        <div key={h.stockId} style={{ color: h.isUp ? 'red' : 'green' }}>
          {h.stockName}: {h.currentPrice}
        </div>
      ))}
    </div>
  );
};
```

---

## 📐 設計原則

| 層 | 職責 | 禁止事項 |
|---|---|---|
| **Model** | 打 API + DTO → Domain 轉換 | 不管 state、不做跨資料彙總 |
| **ViewModel** | state 管理、跨資料邏輯 | 不碰 DOM、不寫 JSX |
| **View** | UI 顯示與互動 | 不呼叫 API、不做計算 |
| **Types** | DTO + Domain 型別定義 | 不含行為方法 |

---

## ⚠️ 常見錯誤

❌ Component 直接呼叫 API
❌ ViewModel 做 DTO 轉換
❌ Model 管理 React state/Hooks
❌ 型別 DTO / Domain 混用不分

---

## 🧠 結論

> 本設計為 React 專案中實務可行的 MVVM 思維套用。
> 強調清楚分層，但避免為了架構而架構。
> 對個人與小型專案而言，此結構已具備良好可讀性與長期可維護性。

