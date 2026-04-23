import { db } from '../global/firebase';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface YearlyRecordInput {
  assetType: string;
  year: number;
  prevYearTotal: number;
  amountInvested: number;
  stockValue: number;
  cashBalance: number;
  foreignValueTwd: number;
  returnAmount: number;
  returnRate: number;
  settledAt: string; // ISO string
  note?: string;
}

export class YearlyRecord {
  id!: string; // {assetType}_{year}
  assetType!: string;
  year!: number;
  prevYearTotal!: number;
  amountInvested!: number;
  stockValue!: number;
  cashBalance!: number;
  foreignValueTwd!: number;
  returnAmount!: number;
  returnRate!: number;
  settledAt!: string;
  note!: string;
  createdAt!: string;

  private static readonly col = db.collection('yearly_records');

  static async findAll(assetType = 'tw_stock'): Promise<YearlyRecord[]> {
    const snap = await this.col
      .where('asset_type', '==', assetType)
      .orderBy('year', 'asc')
      .get();
    return snap.docs.map(doc => YearlyRecord.fromSnapshot(doc));
  }

  static async findByYear(assetType: string, year: number): Promise<YearlyRecord | null> {
    const doc = await this.col.doc(`${assetType}_${year}`).get();
    return doc.exists ? YearlyRecord.fromSnapshot(doc) : null;
  }

  static async create(input: YearlyRecordInput): Promise<YearlyRecord> {
    const docId = `${input.assetType}_${input.year}`;
    const ref = this.col.doc(docId);
    await ref.set({
      asset_type:       input.assetType,
      year:             input.year,
      prev_year_total:  input.prevYearTotal,
      amount_invested:  input.amountInvested,
      stock_value:      input.stockValue,
      cash_balance:     input.cashBalance,
      foreign_value_twd: input.foreignValueTwd,
      return_amount:    input.returnAmount,
      return_rate:      input.returnRate,
      settled_at:       Timestamp.fromDate(new Date(input.settledAt)),
      note:             input.note ?? '',
      created_at:       FieldValue.serverTimestamp(),
    });
    const doc = await ref.get();
    return YearlyRecord.fromSnapshot(doc);
  }

  static async update(assetType: string, year: number, input: Partial<YearlyRecordInput>): Promise<YearlyRecord | null> {
    const ref = this.col.doc(`${assetType}_${year}`);
    const doc = await ref.get();
    if (!doc.exists) return null;

    const patch: Record<string, unknown> = {};
    if (input.prevYearTotal   !== undefined) patch['prev_year_total']   = input.prevYearTotal;
    if (input.amountInvested  !== undefined) patch['amount_invested']   = input.amountInvested;
    if (input.stockValue      !== undefined) patch['stock_value']       = input.stockValue;
    if (input.cashBalance     !== undefined) patch['cash_balance']      = input.cashBalance;
    if (input.foreignValueTwd !== undefined) patch['foreign_value_twd'] = input.foreignValueTwd;
    if (input.returnAmount    !== undefined) patch['return_amount']     = input.returnAmount;
    if (input.returnRate      !== undefined) patch['return_rate']       = input.returnRate;
    if (input.settledAt       !== undefined) patch['settled_at']        = Timestamp.fromDate(new Date(input.settledAt));
    if (input.note            !== undefined) patch['note']              = input.note;

    await ref.update(patch);
    const updated = await ref.get();
    return YearlyRecord.fromSnapshot(updated);
  }

  private static fromSnapshot(doc: FirebaseFirestore.DocumentSnapshot): YearlyRecord {
    const d = doc.data()!;
    const r = new YearlyRecord();
    r.id              = doc.id;
    r.assetType       = d['asset_type'];
    r.year            = d['year'];
    r.prevYearTotal   = d['prev_year_total'];
    r.amountInvested  = d['amount_invested'];
    r.stockValue      = d['stock_value'];
    r.cashBalance     = d['cash_balance'];
    r.foreignValueTwd = d['foreign_value_twd'];
    r.returnAmount    = d['return_amount'];
    r.returnRate      = d['return_rate'];
    const sa          = d['settled_at'];
    r.settledAt       = sa instanceof Timestamp ? sa.toDate().toISOString() : '';
    r.note            = d['note'] ?? '';
    const ca          = d['created_at'];
    r.createdAt       = ca instanceof Timestamp ? ca.toDate().toISOString() : new Date().toISOString();
    return r;
  }
}
