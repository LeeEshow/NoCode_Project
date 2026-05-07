import { db } from '../global/firebase';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface HoldingInput {
  stockId: string;
  stockName?: string;
  sharesHeld: number;
  avgCost: number;
  totalCost: number;
  realizedProfit: number;
  costMethod: string;
}

export class Holding {
  stockId!: string;
  stockName?: string;       // 持久化於 Firestore，recalculate 時寫入
  sharesHeld!: number;
  avgCost!: number;
  totalCost!: number;
  realizedProfit!: number;
  costMethod!: string;
  updatedAt!: string;
  sortIndex!: number;

  // 即時資料由 Controller 注入，不存 Firestore
  currentPrice?: number;
  change?: number;
  changePercent?: number;

  private static readonly col = db.collection('holdings');

  static async findAll(): Promise<Holding[]> {
    const snap = await this.col.get();
    const holdings = snap.docs.map(doc => Holding.fromSnapshot(doc));
    return holdings.sort((a, b) => a.sortIndex - b.sortIndex);
  }

  static async reorder(order: string[]): Promise<void> {
    const batch = db.batch();
    order.forEach((stockId, index) => {
      batch.update(this.col.doc(stockId), { sort_index: index });
    });
    await batch.commit();
  }

  static async findById(stockId: string): Promise<Holding | null> {
    const doc = await this.col.doc(stockId).get();
    return doc.exists ? Holding.fromSnapshot(doc) : null;
  }

  static async upsert(input: HoldingInput): Promise<void> {
    const payload: Record<string, unknown> = {
      stock_id:        input.stockId,
      shares_held:     input.sharesHeld,
      avg_cost:        input.avgCost,
      total_cost:      input.totalCost,
      realized_profit: input.realizedProfit,
      cost_method:     input.costMethod,
      updated_at:      FieldValue.serverTimestamp(),
    };
    if (input.stockName) payload.stock_name = input.stockName;
    await this.col.doc(input.stockId).set(payload, { merge: true });
  }

  static async batchUpsert(inputs: HoldingInput[]): Promise<void> {
    const batch = db.batch();
    for (const input of inputs) {
      const ref = this.col.doc(input.stockId);
      const payload: Record<string, unknown> = {
        stock_id:        input.stockId,
        shares_held:     input.sharesHeld,
        avg_cost:        input.avgCost,
        total_cost:      input.totalCost,
        realized_profit: input.realizedProfit,
        cost_method:     input.costMethod,
        updated_at:      FieldValue.serverTimestamp(),
      };
      if (input.stockName) payload.stock_name = input.stockName;
      batch.set(ref, payload, { merge: true });
    }
    await batch.commit();
  }

  private static fromSnapshot(doc: FirebaseFirestore.DocumentSnapshot): Holding {
    const d = doc.data()!;
    const h = new Holding();
    h.stockId        = doc.id;
    h.stockName      = d['stock_name'] || undefined;
    h.sharesHeld     = d['shares_held'];
    h.avgCost        = d['avg_cost'];
    h.totalCost      = d['total_cost'];
    h.realizedProfit = d['realized_profit'];
    h.costMethod     = d['cost_method'] ?? 'preserve_method';
    const ua         = d['updated_at'];
    h.updatedAt      = ua instanceof Timestamp ? ua.toDate().toISOString() : new Date().toISOString();
    h.sortIndex      = d['sort_index'] ?? 0;
    return h;
  }
}
