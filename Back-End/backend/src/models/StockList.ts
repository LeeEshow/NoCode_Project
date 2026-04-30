import { db } from '../global/firebase';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export interface StockListItem {
  code: string;
  name: string;
  market: 'TSE' | 'OTC';
}

export interface StockListMeta {
  count: number;
  updatedAt: string | null;
}

// 單一 document：stock_list/data
// 欄位：stocks[]、count、updated_at
const DOC_REF = () => db.collection('stock_list').doc('data');

function toTaiwanISO(): string {
  const now = new Date();
  const tw  = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().slice(0, 19) + '+08:00';
}

// ── Model ───────────────────────────────────────────────────────────────────

export class StockList {
  /** 將全股清單以單一 document 寫入 Firestore（1 次寫，覆蓋舊資料） */
  static async upsertAll(
    items: StockListItem[]
  ): Promise<{ count: number; updatedAt: string }> {
    const updatedAt = toTaiwanISO();
    await DOC_REF().set({
      stocks:     items,
      count:      items.length,
      updated_at: updatedAt,
    });
    return { count: items.length, updatedAt };
  }

  /** 讀取全股清單陣列（供搜尋快取使用，1 次讀） */
  static async getAll(): Promise<StockListItem[]> {
    const doc = await DOC_REF().get();
    if (!doc.exists) return [];
    const stocks = doc.data()!['stocks'];
    return Array.isArray(stocks) ? (stocks as StockListItem[]) : [];
  }

  /** 讀取 meta 資訊（不打 Shioaji，1 次讀） */
  static async getMeta(): Promise<StockListMeta> {
    const doc = await DOC_REF().get();
    if (!doc.exists) return { count: 0, updatedAt: null };
    const d = doc.data()!;
    return {
      count:     d['count']      ?? 0,
      updatedAt: d['updated_at'] ?? null,
    };
  }
}
