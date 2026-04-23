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
 ├── 📂 styles         → 設計 Token（CSS 變數 + TypeScript 常數）
 ├── 📂 api            → Axios 實例與攔截器配置
 ├── 📂 types          → DTO / Domain 型別定義
 ├── 📂 models         → API 呼叫 + DTO → Domain 轉換（Repository / DataSource）
 ├── 📂 viewmodels     → 核心邏輯層（以 Custom Hook 實作）
 └── 📂 views
      ├── 📂 layout    → 版面元件（Layout / Nav）
      ├── 📂 components→ UI 共用元件
      └── 📂 pages     → Page（組裝 View + ViewModel）
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
   [ Model ]        ← API 呼叫 + DTO → Domain 轉換
         │
         ▼
   [ ViewModel ]    ← 狀態管理 + 跨資料彙總邏輯 + 商務邏輯處理
         │
         ▼
    [ View ]        ← 負責 UI 與展示層邏輯（presentation logic），不含資料來源與商務邏輯
```

---

## 🧩 1. 共用元件（Shared Components）

### 核心原則

> **前端開發必須嚴格遵守以下兩個前置條件，缺一不可：**
>
> 1. **設計規範先行**：開發任何元件或頁面之前，必須先在 `styles/` 完成設計系統定義，包含色彩、字型、字級、圓角、間距、動畫等所有 Token。所有後續元件與頁面只能引用 Token，禁止硬碼任何設計數值。
>
> 2. **共用元件優先**：設計規範確立後，必須先完成所有共用元件的實作，再開始開發各功能頁面。頁面層（`views/pages/`）只能組裝元件，不得自行定義樣式或重複實作已有功能。

---

### 開發順序規範（強制）

```
① styles/          【必須最先完成】設計 Token 定義
  ├── tokens.css   色彩 / 字型 / 字級 / 圓角 / 動畫 / 尺寸
  ├── global.css   全域 Reset + 共用 class
  └── theme.ts     TypeScript 版（供圖表庫 / 內聯樣式使用）
         ↓
② components/      【頁面開發前全部完成】共用元件實作
  └── 每個元件依賴 styles/，不含頁面業務邏輯
         ↓
③ views/layout/    版面骨架（Sidebar / TopBar / MainLayout 等）
         ↓
④ views/pages/     各功能頁面（組裝元件 + ViewModel）
```

> ⚠️ 若直接跳到 ④ 開始開發頁面，各頁面將各自定義色碼與樣式，
> 造成視覺不一致、後期修改成本極高，設計規範形同虛設。

---

### 判斷標準：什麼應該成為共用元件？

| 條件 | 說明 |
|------|------|
| **跨頁面使用 ≥ 2 次** | 凡重複出現的 UI 單元都應抽離為共用元件 |
| **視覺行為需全局一致** | 按鈕、表格、搜尋框、Modal 等互動元件 |
| **含可複用邏輯** | 排序、篩選、格式化輸入、分頁等附帶行為的元件 |
| **與設計 Token 強綁定** | 所有帶色彩、字型、圓角的 UI 單元 |

---

### 目錄結構

```
src/
├── styles/                 ← ① 設計 Token（最優先）
│   ├── tokens.css          ← CSS 自訂屬性（唯一來源）
│   ├── global.css          ← 全域樣式 + 共用 class
│   ├── theme.ts            ← TypeScript 版 tokens（供圖表庫 / 內聯樣式）
│   └── index.ts            ← 統一 export 入口
│
└── components/             ← ② 共用元件（次優先）
    ├── DataTable/          ← 通用資料表格（可含排序 / 搜尋 / 分頁）
    ├── Modal/              ← 基底 Modal（header / body / footer / backdrop）
    ├── LoadingPanel/       ← 載入狀態（Skeleton / Spinner）
    ├── Toast/              ← 全域通知（操作成功 / 失敗回饋）
    ├── ConfirmDialog/      ← 二次確認（刪除等破壞性操作）
    ├── StatusBadge/        ← 狀態標籤（依 variant 切換顏色）
    ├── SummaryCard/        ← 摘要數值卡片（標題 + 主數值 + 副標）
    ├── FormInputs/         ← 共用輸入元件（NumberInput / RadioGroup 等）
    └── Charts/             ← 圖表元件（依專案需求選用圖表庫封裝）
```

> 每個專案的 `components/` 內容依需求不同，但**分類邏輯與設計規則相同**。
> 開發前應先盤點所有頁面共用的 UI 單元，確認清單後再逐一實作。

---

### 引用規範

```typescript
// ✅ 正確：從 components/ 統一引入
import DataTable from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingPanel } from '../components/LoadingPanel';

// ❌ 禁止：在 pages/ 內自行定義已有的 UI 邏輯
const MyTable = styled.table`color: #aabbcc`; // 禁止硬碼色碼
```

```typescript
// ✅ 正確：圖表 / 動態樣式從 theme.ts 取色
import { colors } from '../styles';
chartOption.series[0].lineStyle = { color: colors.primary };

// ❌ 禁止：在元件內直接硬碼顏色值
chartOption.series[0].lineStyle = { color: '#6A8FB5' };
```

---

### 共用元件設計規則

| 規則 | 說明 |
|------|------|
| **樣式只引用 Token** | 所有顏色、字型、圓角必須使用 `var(--xxx)` 或 `theme.ts` 常數，禁止硬碼 |
| **Props 明確型別** | 每個元件必須匯出 TypeScript interface，供頁面層 import 使用 |
| **不含業務邏輯** | 元件不直接呼叫 API，所需資料一律由外部（ViewModel）透過 props 傳入 |
| **index.ts 統一匯出** | 每個元件資料夾必須有 `index.ts`，確保一行 import 可用 |
| **狀態自理** | 元件自行處理 loading / empty / error 的展示，由 props 控制狀態值 |

---

## 🧱 2. Types（型別定義）

兩種型別並存：

- **DTO**：對應後端 JSON 格式（`snake_case`），用於 Model 層的 API 呼叫
- **Domain**：前端使用的格式（`camelCase`），含衍生欄位

```typescript
// types/product.ts

export interface ProductDTO {
  product_id: string;
  unit_price: number;
  stock_qty: number;
  is_active?: boolean;
  // ... 後端原始欄位
}

export interface Product {
  productId: string;
  unitPrice: number;
  stockQty: number;
  isLowStock: boolean;    // 衍生欄位，後端不提供
  isActive: boolean;
  // ... 前端使用欄位
}
```

---

## 🔄 3. Model（資料存取 + 反序列化層）

**職責：打 API + 將 DTO 轉換為 Domain 物件（一層完成）**  
**不負責：React state、跨多筆資料的彙總邏輯**

```typescript
// models/productModel.ts
import { apiClient } from '../api/axios';
import { ProductDTO, Product } from '../types/product';

export const fetchProducts = async (): Promise<Product[]> => {
  const res = await apiClient.get<ProductDTO[]>('/products');
  return res.data.map(fromDTO);
};

export const fetchProduct = async (id: string): Promise<Product> => {
  const res = await apiClient.get<ProductDTO>(`/products/${id}`);
  return fromDTO(res.data);
};

// 私有轉換函式（snake_case → camelCase + 計算衍生欄位）
const fromDTO = (dto: ProductDTO): Product => ({
  productId:  dto.product_id,
  unitPrice:  dto.unit_price,
  stockQty:   dto.stock_qty,
  isLowStock: dto.stock_qty < 10,   // 衍生欄位
  isActive:   dto.is_active ?? true,
});
```

---

## 🌐 4. API（Axios 設定）

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

## 🧠 5. ViewModel（邏輯層）

定位說明：
- ViewModel 是「邏輯聚合層」，在 React 中以 Custom Hook 實作
- 小型專案 ✅ 直接使用 `useState`，避免不必要複雜化

**職責：呼叫 Model、管理 state、處理跨資料彙總**

```typescript
// viewmodels/useProductsViewModel.ts
import { useEffect, useState, useCallback } from 'react';
import { fetchProducts } from '../models/productModel';
import { Product } from '../types/product';

export const useProductsViewModel = () => {
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // 跨多筆資料的彙總邏輯（Model 層不做）
  const totalCount    = products.length;
  const lowStockCount = products.filter(p => p.isLowStock).length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await fetchProducts());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { products, loading, error, totalCount, lowStockCount, reload: load };
};
```

---

## 🎨 6. View（Component / Page）

**職責：只包含 UI 與展示層邏輯，與人機互動**

```typescript
// views/pages/ProductListPage.tsx
import { useProductsViewModel } from '../../viewmodels/useProductsViewModel';
import DataTable from '../../components/DataTable';
import { LoadingPanel } from '../../components/LoadingPanel';
import { StatusBadge } from '../../components/StatusBadge';

const ProductListPage: React.FC = () => {
  const vm = useProductsViewModel();

  if (vm.loading) return <LoadingPanel />;

  return (
    <DataTable
      title="商品列表"
      data={vm.products}
      rowKey="productId"
      columns={[
        { key: 'productId', label: '商品編號' },
        { key: 'unitPrice', label: '單價', align: 'right' },
        { key: 'isActive',  label: '狀態', render: row =>
            <StatusBadge variant={row.isActive ? 'active' : 'inactive'} />
        },
      ]}
    />
  );
};
```

---

## 📐 設計原則

| 層 | 職責 | 禁止事項 |
|---|---|---|
| **styles/** | 設計 Token 唯一來源 | 禁止在其他層定義顏色 / 字型變數 |
| **components/** | 共用 UI 元件，與業務邏輯無關 | 不呼叫 API、不持有 ViewModel 狀態 |
| **Model** | 打 API + DTO → Domain 轉換 | 不管 state、不做跨資料彙總 |
| **ViewModel** | state 管理、跨資料邏輯 | 不碰 DOM、不寫 JSX |
| **View** | UI 顯示與互動 | 不呼叫 API、不做商務計算、不重複定義共用元件 |
| **Types** | DTO + Domain 型別定義 | 不含行為方法 |

---

## ⚠️ 常見錯誤

**MVVM 分層錯誤**  
❌ Component 直接呼叫 API  
❌ ViewModel 做 DTO 轉換  
❌ Model 管理 React state/Hooks  
❌ 型別 DTO / Domain 混用不分  

**設計規範錯誤**  
❌ 在 pages/ 或 components/ 內硬碼色碼或尺寸數值  
❌ 各頁面各自定義字型大小，而不引用 `--text-*` Token  
❌ 跳過 styles/ 直接開始寫 UI 元件  

**共用元件錯誤**  
❌ 在 pages/ 內重新定義 table / modal / loading 樣式  
❌ 相同的狀態顯示邏輯（顏色判斷、格式化）散落在各頁面，未抽為共用元件  
❌ 每個 Modal 各自設計 backdrop 與關閉邏輯，而不繼承共用 Modal 基底  
❌ 圖表元件內硬碼顏色，而不從 `theme.ts` 引入色彩常數  

---

## 🧠 結論

> 本設計為 React 專案中實務可行的 MVVM 思維套用。  
> 強調清楚分層，但避免為了架構而架構。  
> 對個人與小型專案而言，此結構已具備良好可讀性與長期可維護性。
