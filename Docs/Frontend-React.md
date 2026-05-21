# 📘 React.js Skill - MVVM 架構設計原則

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

## 🪝 7. React Hook 正確性

### 7.1 禁止在 Render 期間寫入 Ref（`useLatest` 除外）

Ref 是跳出 React 渲染系統的逃生口。在 render 函式主體直接執行 `ref.current = value`，**一般情況下禁止**，會在 React Strict Mode 下被執行兩次，也會阻礙 React Compiler 最佳化。

```typescript
// ❌ 禁止：render 期間寫入，且在 render 路徑讀取
const MyComponent = ({ value }: { value: number }) => {
  const ref = useRef(0);
  ref.current = value;
  return <div>{ref.current}</div>; // ← render 路徑讀取，這才是真正的問題
};
```

**例外：`useLatest` 模式**（見 7.6）——允許在 render 期間寫入，前提是 `ref.current` **只在 callback（事件、setInterval、useEffect）裡讀取，絕不在 render 路徑讀取**。

```typescript
// ✅ useLatest：render 期間寫入，但只在 callback 讀取
const vmRef = useLatest(vm);
useEffect(() => {
  const id = setInterval(() => {
    vmRef.current.refresh(); // ← callback 讀取，安全
  }, 5000);
  return () => clearInterval(id);
}, []);
```

若需要在 render 路徑使用同步值，仍應用 `useEffect`：

```typescript
// ✅ 正確：render 路徑需要同步值時，透過 useEffect
const MyComponent = ({ value }: { value: number }) => {
  const ref = useRef(0);
  useEffect(() => { ref.current = value; }, [value]);
  return <div />;
};
```

### 7.2 Effect 內的 setState 處理原則

Effect 內直接呼叫 `setState` 是合法且必要的（如 Modal 開啟時初始化草稿、外部值同步），但 React 19 的 `react-hooks/set-state-in-effect` lint rule 預設會標記這類用法。解法不是移除 setState，而是加上具名 disable 說明理由：

```typescript
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect -- modal open draft reset
  if (open) setDraft(initialValue);
}, [open]);
```

若一個 effect 內有多處 setState，改用 block 形式：

```typescript
/* eslint-disable react-hooks/set-state-in-effect -- template sync on external prop change */
useEffect(() => {
  if (!template) return;
  setPrinterName(template.defaultPrinter ?? '');
  setSpeed(template.speed ?? 4);
}, [template]);
/* eslint-enable react-hooks/set-state-in-effect */
```

> **長遠解法**：若 effect 只為了同步一個數字 input 的 draft 值，考慮提取為共用 Hook（見 7.4），即可從源頭消除 lint 問題。

### 7.3 禁止在 Render 函式內定義子元件

在 render 函式（或另一個 Component）內部以 `const Btn = () => <button>` 的形式定義元件，每次 render 都會產生新的函式參考，導致 React 無法辨識為同一個元件而做無謂的 unmount/remount。

```typescript
// ❌ 錯誤：在 render 函式內定義元件
const Panel = () => {
  const ActionBtn = ({ label }: { label: string }) => (
    <button className={styles.btn}>{label}</button>
  );
  return <ActionBtn label="送出" />;
};

// ✅ 正確：移到 module scope（檔案頂層）
const ActionBtn = ({ label }: { label: string }) => (
  <button className={styles.btn}>{label}</button>
);

const Panel = () => <ActionBtn label="送出" />;
```

### 7.4 提取共用的 Input Draft 模式

「本地草稿值（draft）+ useEffect 同步外部值 + blur/Enter 才提交」是數字輸入框的常見模式。當多個元件重複這套邏輯時，應提取為共用 Hook：

```typescript
// hooks/useDraftValue.ts
export const useDraftValue = (externalValue: number, onCommit: (raw: string) => void) => {
  const [draft, setDraft] = useState(String(externalValue));
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync on external value change
  useEffect(() => { setDraft(String(externalValue)); }, [externalValue]);
  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (!isNaN(n)) onCommit(raw);
    else setDraft(String(externalValue));
  };
  return { draft, setDraft, commit };
};

// 使用
const NumInput = ({ value, onChange }: { value: number; onChange: (v: string) => void }) => {
  const { draft, setDraft, commit } = useDraftValue(value, onChange);
  return (
    <input value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
    />
  );
};
```

### 7.6 `useLatest`：穩定 callback 的標準模式

當需要在空依賴陣列的 `useEffect`（如 `setInterval`）或 `useCallback` 中存取最新的 props / state，而又不想重建 interval 或 callback，使用 `useLatest`。

**允許條件（兩者都必須成立）：**
1. `ref.current` **只在 callback 中讀取**（事件處理、setInterval、useEffect 內部）
2. `ref.current` **不在 render 路徑讀取**（不出現在 JSX 或 return 之前的計算）

```typescript
// utils/useLatest.ts
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
```

```typescript
// ✅ 正確使用：空 deps interval，永遠讀到最新 vm
const vmRef = useLatest(vm);
useEffect(() => {
  const id = setInterval(() => {
    if (!isTradingHours()) return;
    vmRef.current.refreshPrices(); // callback 讀取
  }, 5000);
  return () => clearInterval(id);
}, []); // 不需要把 vm 加入 deps

// ✅ 正確使用：穩定的事件 callback，讀到最新 state
const stateRef = useLatest(state);
const ensureData = useCallback(async (code: string) => {
  const { klines } = stateRef.current; // callback 讀取
  if (klines[code]) return;
  // ...
}, []); // 空 deps，不因 state 變動而重建
```

```typescript
// ❌ 禁止：在 render 路徑讀取 ref（這才是 Rule 7.1 禁止的情形）
const valueRef = useLatest(someValue);
const doubled = valueRef.current * 2; // ← render 路徑讀取，禁止
return <div>{doubled}</div>;
```

> **為何不用 `useEffect` 同步？** `useEffect` 同步有一個 timing gap：render 結束到 effect 執行之間，ref 仍是舊值。若 interval 在此空窗觸發，會讀到舊版本。`useLatest` 在 render 瞬間即完成同步，沒有此問題。

### 7.5 React Fast Refresh：每個檔案只 export 一種類型

React Fast Refresh 要求元件檔案只 export 元件（React component），不得同時 export hook 或 context object 等非元件項目，否則 HMR 會降級為完整 reload。

```
// ❌ 錯誤：同一個檔案混合 export
export const EditorContext = createContext(...);   // context object
export const EditorProvider: React.FC = ...;       // component
export const useEditorContext = () => ...;          // hook

// ✅ 正確：拆為三個檔案
// contexts/EditorContext.ts    → export EditorContext（context object + 型別）
// contexts/EditorProvider.tsx  → export EditorProvider（component）
// contexts/useEditorContext.ts → export useEditorContext（hook）
```

---

## 🔄 8. 非同步可靠性

### 8.1 防止 Stale Response（過時回應覆蓋）

當使用者快速觸發 API 請求（如快速搜尋、切換分頁），先發的請求可能比後發的請求更晚回來，導致舊資料覆蓋新資料。

**模式一：Request ID（適用 ViewModel 的 load 函式）**

```typescript
const reqIdRef = useRef(0);

const load = useCallback(async (query: string) => {
  const id = ++reqIdRef.current;
  setLoading(true);
  try {
    const data = await fetchData(query);
    if (id !== reqIdRef.current) return; // 已被新請求取代，丟棄
    setData(data);
  } catch (err) {
    if (id !== reqIdRef.current) return;
    setError(err instanceof Error ? err.message : '載入失敗');
  } finally {
    if (id === reqIdRef.current) setLoading(false);
  }
}, []);
```

**模式二：Cancelled Flag（適用 useEffect mount 請求）**

```typescript
useEffect(() => {
  let cancelled = false;
  fetchOptions().then(list => {
    if (cancelled) return;
    setOptions(list);
  }).catch(() => {});
  return () => { cancelled = true; };
}, []);
```

### 8.2 錯誤訊息對使用者友善，不洩漏技術細節

API 錯誤的技術細節（URL、status code、stack trace）不應出現在 production 環境的 console 或 UI 中。

```typescript
// api/axios.ts
apiClient.interceptors.response.use(
  response => response,
  error => {
    // ✅ 技術細節只在開發環境輸出
    if (import.meta.env.DEV) {
      console.error('[API Error]', error);
    }
    // ✅ 使用者看到的是語意化訊息，由 ViewModel 以 Toast 呈現
    return Promise.reject(new Error(extractUserMessage(error)));
  }
);
```

### 8.3 多步驟操作的部分失敗處理

需要 A → B 兩步才完成的操作（如：建立新版本 → 刪除舊版本），B 失敗不應讓 A 的成果消失，也不應對使用者沉默。

```typescript
const save = async (): Promise<{ result: T; warning?: string } | false> => {
  try {
    const result = await create(newData);
    let warning: string | undefined;
    try {
      await delete(oldId);
    } catch {
      warning = '新版本已建立，舊版本刪除失敗，請手動清除';
    }
    return { result, warning };
  } catch {
    return false;
  }
};

// 呼叫端
const outcome = await vm.save();
if (outcome) {
  if (outcome.warning) showToast(outcome.warning, 'error');
  showToast('儲存成功', 'success');
}
```

---

## ⚡ 9. 效能優化模式

### 9.1 高頻事件（mousemove / scroll）禁止 setState

在 `mousemove`、`scroll`、`pointermove` 等高頻事件中呼叫 setState，每次移動都會觸發完整的 re-render tree，元素多時導致明顯卡頓。正確做法是：**在事件期間直接操作 DOM，只在結束時（mouseup / pointerup）提交 state**。

```typescript
// ❌ 錯誤：mousemove 中 setState
const onMouseMove = (e: MouseEvent) => {
  setPosition({ x: e.clientX, y: e.clientY }); // 每次移動都 re-render
};

// ✅ 正確：mousemove 直接操作 DOM，mouseup 才 setState
const elementRef = useRef<HTMLDivElement>(null);
const dragStartRef = useRef<{ startX: number; startY: number } | null>(null);

const onMouseMove = useCallback((e: MouseEvent) => {
  if (!dragStartRef.current || !elementRef.current) return;
  const dx = e.clientX - dragStartRef.current.startX;
  const dy = e.clientY - dragStartRef.current.startY;
  elementRef.current.style.transform = `translate(${dx}px, ${dy}px)`; // 直接 DOM
}, []); // 空 deps — 完全透過 ref 讀值

const onMouseUp = useCallback((e: MouseEvent) => {
  if (!dragStartRef.current) return;
  const finalX = computeFinalX(e); // 計算最終座標
  setPosition({ x: finalX, y: computeFinalY(e) }); // 只在結束時 setState 一次
  dragStartRef.current = null;
}, []);
```

### 9.2 memoize 昂貴計算

凡是根據 state/props 衍生出的複雜計算（字串拼接、陣列過濾、物件轉換），都應包在 `useMemo` 中，避免每次 render 重複執行。

```typescript
// ❌ 每次 render 都重新計算
const previewStr = evaluateTokens(tokens, params); // 昂貴計算

// ✅ 只在 deps 變化時重新計算
const previewStr = useMemo(
  () => evaluateTokens(tokens, params),
  [tokens, params],
);
```

### 9.3 Context Provider value 必須 memoize

Context 的 `value` prop 若每次 render 都建立新物件，所有 consumer 都會無條件 re-render，即使資料完全相同。

```typescript
// ❌ 每次 render 都是新物件參考 → 所有 consumer re-render
return (
  <MyContext.Provider value={{ data, actions }}>
    {children}
  </MyContext.Provider>
);

// ✅ 只有 deps 變化時才產生新物件
const value = useMemo(() => ({ data, actions }), [data, actions]);
return (
  <MyContext.Provider value={value}>
    {children}
  </MyContext.Provider>
);
```

---

## 🔒 10. 安全性規範

### 10.1 禁止以 innerHTML / document.write 插入使用者資料

使用者資料（API 回傳值、表單輸入）絕不能直接拼接進 HTML 字串後以 `innerHTML` 或 `document.write` 注入，即使有手動 escape 函式也容易出漏洞。

```typescript
// ❌ 危險：手動 escape 容易遺漏
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
win.document.write(`<td>${escHtml(userValue)}</td>`); // 萬一 escHtml 有漏洞？

// ✅ 安全：DOM 操作 + textContent（瀏覽器自動 escape）
const td = document.createElement('td');
td.textContent = userValue; // 永遠安全，無論 userValue 包含什麼
```

**新視窗呈現資料表的正確做法**：`document.write` 只寫入靜態骨架（CSS 和空容器），再用 DOM API 填入動態資料。

```typescript
const openDataWindow = (rows: Row[]) => {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  // 只有靜態內容（無使用者資料）→ document.write 無 XSS 風險
  win.document.write(`<!DOCTYPE html><html><head><style>/* ... */</style></head>
    <body><div id="root"></div></body></html>`);
  win.document.close();
  // 使用者資料全部透過 textContent 填入
  const tbody = win.document.createElement('tbody');
  for (const row of rows) {
    const tr = win.document.createElement('tr');
    for (const val of [row.name, row.value]) {
      const td = win.document.createElement('td');
      td.textContent = val; // 瀏覽器自動 escape
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
};
```

### 10.2 禁止在 React 中使用 dangerouslySetInnerHTML（除非必要）

若確需渲染 HTML（如 Markdown 轉換結果），必須先以 DOMPurify 等白名單過濾器 sanitize 後再使用 `dangerouslySetInnerHTML`。

```typescript
import DOMPurify from 'dompurify';

// ✅ 必要時才用，且必須 sanitize
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }} />
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
