import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export interface WatchlistInput {
  stockId: string;
  targetPrice: number;
  note?: string;
}

export interface WatchlistDoc extends Required<WatchlistInput> {
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistPatch {
  targetPrice?: number;
  note?: string;
}

const COL = 'watchlist';

// ── Model ───────────────────────────────────────────────────────────────────

export class Watchlist {
  static async findAll(): Promise<WatchlistDoc[]> {
    const snap = await db.collection(COL).orderBy('created_at', 'asc').get();
    return snap.docs.map(d => deserialize(d));
  }

  static async findByStockId(stockId: string): Promise<WatchlistDoc | null> {
    const doc = await db.collection(COL).doc(stockId).get();
    return doc.exists ? deserialize(doc) : null;
  }

  /** 新增關注股票（Document ID = stock_id，已存在時回傳 null） */
  static async create(input: WatchlistInput): Promise<WatchlistDoc | null> {
    const ref      = db.collection(COL).doc(input.stockId);
    const existing = await ref.get();
    if (existing.exists) return null;

    await ref.set({
      stock_id:     input.stockId,
      target_price: input.targetPrice,
      note:         input.note ?? '',
      created_at:   admin.firestore.FieldValue.serverTimestamp(),
      updated_at:   admin.firestore.FieldValue.serverTimestamp(),
    });
    const created = await ref.get();
    return deserialize(created);
  }

  /** 更新目標價 / 備註 */
  static async update(stockId: string, patch: WatchlistPatch): Promise<WatchlistDoc | null> {
    const ref      = db.collection(COL).doc(stockId);
    const existing = await ref.get();
    if (!existing.exists) return null;

    const data: Record<string, unknown> = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (patch.targetPrice !== undefined) data.target_price = patch.targetPrice;
    if (patch.note        !== undefined) data.note         = patch.note;

    await ref.update(data);
    const updated = await ref.get();
    return deserialize(updated);
  }

  static async delete(stockId: string): Promise<boolean> {
    const ref = db.collection(COL).doc(stockId);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }
}

// ── 反序列化 ─────────────────────────────────────────────────────────────────

function deserialize(doc: admin.firestore.DocumentSnapshot): WatchlistDoc {
  const d = doc.data()!;
  return {
    stockId:     doc.id,
    targetPrice: d.target_price,
    note:        d.note ?? '',
    createdAt:   d.created_at instanceof admin.firestore.Timestamp
      ? d.created_at.toDate()
      : new Date(),
    updatedAt:   d.updated_at instanceof admin.firestore.Timestamp
      ? d.updated_at.toDate()
      : new Date(),
  };
}
