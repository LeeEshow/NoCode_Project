import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

// ── 型別定義 ────────────────────────────────────────────────────────────────

/** 快照中單一持股的欄位（shares 單位為股，currentValue = shares × currentPrice） */
export interface SnapshotHolding {
  stockCode:        string;
  stockName:        string;
  shares:           number;
  costAvg:          number;
  currentPrice:     number;
  currentValue:     number;   // shares × currentPrice（不含手續費）
  unrealizedProfit: number;   // (currentPrice - costAvg) × shares
}

export interface DailySnapshotInput {
  date:             string;   // YYYY-MM-DD（台灣時間）
  execCapital:      number;   // 前一年底資產合計（帶入本金）
  reinvest:         number;   // 當年度 PlanConfig.currentYearReinvest 快照值
  stockValue:       number;   // Σ(currentPrice × shares × 0.997)
  cashBalance:      number;   // 使用者手填，cron 覆寫時保留
  forexValue:       number;   // 外幣資產台幣合計
  unrealizedProfit: number;   // Σ(currentPrice - costAvg) × shares
  note?:            string;
  holdings?:        SnapshotHolding[];
  vix?:             number | null;
  marketStateAuto?: 'risk-on' | 'neutral' | 'risk-off' | null;
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
  /**
   * 取得所有快照（依日期降序）
   * 傳入 year 時限縮至該年度（YYYY-01-01 ~ YYYY-12-31）
   */
  static async findAll(year?: number): Promise<DailySnapshotDoc[]> {
    const from = year ? `${year}-01-01` : '2000-01-01';
    const to   = year ? `${year}-12-31` : '9999-12-31';
    const snap = await db
      .collection(COL)
      .where('date', '>=', from)
      .where('date', '<=', to)
      .orderBy('date', 'desc')
      .get();
    return snap.docs.map(d => deserialize(d));
  }

  /** 依日期範圍查詢，降序排列（保留供舊端點使用） */
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

  /** 查詢最新一筆快照（用於繼承 cash_balance） */
  static async findLatest(): Promise<DailySnapshotDoc | null> {
    const snap = await db
      .collection(COL)
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return deserialize(snap.docs[0]);
  }

  /** 查詢指定年度最後一筆快照（用於計算 execCapital） */
  static async findLastOfYear(year: number): Promise<DailySnapshotDoc | null> {
    const snap = await db
      .collection(COL)
      .where('date', '>=', `${year}-01-01`)
      .where('date', '<=', `${year}-12-31`)
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
        date:               input.date,
        exec_capital:       input.execCapital,
        reinvest:           input.reinvest,
        stock_value:        input.stockValue,
        cash_balance:       input.cashBalance,
        forex_value:        input.forexValue,
        unrealized_profit:  input.unrealizedProfit,
        note:               input.note ?? '',
        holdings:           input.holdings ?? [],
        vix:                input.vix ?? null,
        market_state_auto:  input.marketStateAuto ?? null,
        recorded_at:        admin.firestore.FieldValue.serverTimestamp(),
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
    execCapital:      d.exec_capital      ?? 0,
    reinvest:         d.reinvest          ?? 0,
    stockValue:       d.stock_value       ?? 0,
    cashBalance:      d.cash_balance      ?? 0,
    forexValue:       d.forex_value       ?? 0,
    unrealizedProfit: d.unrealized_profit ?? 0,
    note:             d.note ?? '',
    holdings:         Array.isArray(d.holdings) ? d.holdings : [],
    vix:              typeof d.vix === 'number' ? d.vix : null,
    marketStateAuto:  d.market_state_auto ?? null,
    recordedAt:       d.recorded_at instanceof admin.firestore.Timestamp
      ? d.recorded_at.toDate()
      : new Date(),
  };
}
