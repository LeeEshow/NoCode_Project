import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export interface DailySnapshotInput {
  date: string;             // YYYY-MM-DD（台灣時間）
  totalInvested: number;
  stockValue: number;
  cashBalance: number;
  forexValue: number;
  unrealizedProfit: number;
  realizedProfit: number;
  totalReturn: number;
  returnRate: number;       // e.g. 0.1371（小數，非百分比）
  note?: string;
}

export interface DailySnapshotDoc extends Required<DailySnapshotInput> {
  recordedAt: Date;
}

export interface SnapshotPatch {
  cashBalance?: number;
  note?: string;
}

const COL = 'daily_snapshots';

// ── Model ───────────────────────────────────────────────────────────────────

export class DailySnapshot {
  /** 依日期範圍查詢，降序排列 */
  static async findByRange(from: string, to: string): Promise<DailySnapshotDoc[]> {
    const snap = await db
      .collection(COL)
      .where('date', '>=', from)
      .where('date', '<=', to)
      .orderBy('date', 'desc')
      .get();
    return snap.docs.map(d => deserialize(d));
  }

  /** 查詢單日快照 */
  static async findByDate(date: string): Promise<DailySnapshotDoc | null> {
    const doc = await db.collection(COL).doc(date).get();
    return doc.exists ? deserialize(doc) : null;
  }

  /** 查詢最新一筆快照（用於取得上次 cash_balance） */
  static async findLatest(): Promise<DailySnapshotDoc | null> {
    const snap = await db
      .collection(COL)
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return deserialize(snap.docs[0]);
  }

  /** 寫入快照（merge 冪等設計，同日重複觸發只更新不重複寫） */
  static async record(input: DailySnapshotInput): Promise<DailySnapshotDoc> {
    const ref = db.collection(COL).doc(input.date);
    await ref.set(
      {
        date:              input.date,
        total_invested:    input.totalInvested,
        stock_value:       input.stockValue,
        cash_balance:      input.cashBalance,
        forex_value:       input.forexValue,
        unrealized_profit: input.unrealizedProfit,
        realized_profit:   input.realizedProfit,
        total_return:      input.totalReturn,
        return_rate:       input.returnRate,
        note:              input.note ?? '',
        recorded_at:       admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const updated = await ref.get();
    return deserialize(updated);
  }

  /** 修正活存 / 備註（PUT 用） */
  static async update(date: string, patch: SnapshotPatch): Promise<DailySnapshotDoc | null> {
    const ref      = db.collection(COL).doc(date);
    const existing = await ref.get();
    if (!existing.exists) return null;

    const data: Record<string, unknown> = {};
    if (patch.cashBalance !== undefined) data.cash_balance = patch.cashBalance;
    if (patch.note        !== undefined) data.note         = patch.note;

    if (Object.keys(data).length === 0) return deserialize(existing);
    await ref.update(data);
    const updated = await ref.get();
    return deserialize(updated);
  }
}

// ── 反序列化 ─────────────────────────────────────────────────────────────────

function deserialize(doc: admin.firestore.DocumentSnapshot): DailySnapshotDoc {
  const d = doc.data()!;
  return {
    date:             d.date,
    totalInvested:    d.total_invested,
    stockValue:       d.stock_value,
    cashBalance:      d.cash_balance,
    forexValue:       d.forex_value,
    unrealizedProfit: d.unrealized_profit,
    realizedProfit:   d.realized_profit,
    totalReturn:      d.total_return,
    returnRate:       d.return_rate,
    note:             d.note ?? '',
    recordedAt:       d.recorded_at instanceof admin.firestore.Timestamp
      ? d.recorded_at.toDate()
      : new Date(),
  };
}
