import { db } from '../global/firebase';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface HoldingInput {
  stockId: string;
  sharesHeld: number;
  avgCost: number;
  totalCost: number;
  realizedProfit: number;
  costMethod: string;
}

export class Holding {
  stockId!: string;
  sharesHeld!: number;
  avgCost!: number;
  totalCost!: number;
  realizedProfit!: number;
  costMethod!: string;
  updatedAt!: string;

  // 即時資料由 Controller 注入，不存 Firestore
  stockName?: string;
  currentPrice?: number;
  change?: number;
  changePercent?: number;

  private static readonly col = db.collection('holdings');

  static async findAll(): Promise<Holding[]> {
    const snap = await this.col.get();
    return snap.docs.map(doc => Holding.fromSnapshot(doc));
  }

  static async findById(stockId: string): Promise<Holding | null> {
    const doc = await this.col.doc(stockId).get();
    return doc.exists ? Holding.fromSnapshot(doc) : null;
  }

  static async upsert(input: HoldingInput): Promise<void> {
    await this.col.doc(input.stockId).set(
      {
        stock_id:        input.stockId,
        shares_held:     input.sharesHeld,
        avg_cost:        input.avgCost,
        total_cost:      input.totalCost,
        realized_profit: input.realizedProfit,
        cost_method:     input.costMethod,
        updated_at:      FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  static async batchUpsert(inputs: HoldingInput[]): Promise<void> {
    const batch = db.batch();
    for (const input of inputs) {
      const ref = this.col.doc(input.stockId);
      batch.set(
        ref,
        {
          stock_id:        input.stockId,
          shares_held:     input.sharesHeld,
          avg_cost:        input.avgCost,
          total_cost:      input.totalCost,
          realized_profit: input.realizedProfit,
          cost_method:     input.costMethod,
          updated_at:      FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  private static fromSnapshot(doc: FirebaseFirestore.DocumentSnapshot): Holding {
    const d = doc.data()!;
    const h = new Holding();
    h.stockId        = doc.id;
    h.sharesHeld     = d['shares_held'];
    h.avgCost        = d['avg_cost'];
    h.totalCost      = d['total_cost'];
    h.realizedProfit = d['realized_profit'];
    h.costMethod     = d['cost_method'] ?? 'preserve_method';
    const ua         = d['updated_at'];
    h.updatedAt      = ua instanceof Timestamp ? ua.toDate().toISOString() : new Date().toISOString();
    return h;
  }
}
