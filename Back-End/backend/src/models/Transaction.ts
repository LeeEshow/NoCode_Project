import { db } from '../global/firebase';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface TransactionInput {
  stockId: string;
  type: 'buy' | 'sell';
  date: string; // ISO string
  shares: number;
  pricePerShare: number;
  fee: number;
  note?: string;
}

export class Transaction {
  id!: string;
  stockId!: string;
  type!: 'buy' | 'sell';
  date!: string;
  shares!: number;
  pricePerShare!: number;
  fee!: number;
  note!: string;
  createdAt!: string;

  private static readonly col = db.collection('transactions');

  static async findAll(stockId?: string): Promise<Transaction[]> {
    const baseQuery = stockId
      ? this.col.where('stock_id', '==', stockId)
      : this.col;
    const snap = await baseQuery.get();
    const items = snap.docs.map(doc => Transaction.fromSnapshot(doc));
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }

  static async findById(id: string): Promise<Transaction | null> {
    const doc = await this.col.doc(id).get();
    return doc.exists ? Transaction.fromSnapshot(doc) : null;
  }

  static async create(input: TransactionInput): Promise<Transaction> {
    const docRef = await this.col.add({
      stock_id:        input.stockId,
      type:            input.type,
      date:            Timestamp.fromDate(new Date(input.date)),
      shares:          input.shares,
      price_per_share: input.pricePerShare,
      fee:             input.fee,
      note:            input.note ?? '',
      created_at:      FieldValue.serverTimestamp(),
    });
    const doc = await docRef.get();
    return Transaction.fromSnapshot(doc);
  }

  static async update(id: string, input: Partial<TransactionInput>): Promise<Transaction | null> {
    const ref = this.col.doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;

    const patch: Record<string, unknown> = {};
    if (input.stockId        !== undefined) patch['stock_id']        = input.stockId;
    if (input.type           !== undefined) patch['type']            = input.type;
    if (input.date           !== undefined) patch['date']            = Timestamp.fromDate(new Date(input.date));
    if (input.shares         !== undefined) patch['shares']          = input.shares;
    if (input.pricePerShare  !== undefined) patch['price_per_share'] = input.pricePerShare;
    if (input.fee            !== undefined) patch['fee']             = input.fee;
    if (input.note           !== undefined) patch['note']            = input.note;

    await ref.update(patch);
    const updated = await ref.get();
    return Transaction.fromSnapshot(updated);
  }

  static async delete(id: string): Promise<boolean> {
    const doc = await this.col.doc(id).get();
    if (!doc.exists) return false;
    await this.col.doc(id).delete();
    return true;
  }

  private static fromSnapshot(doc: FirebaseFirestore.DocumentSnapshot): Transaction {
    const d = doc.data()!;
    const t = new Transaction();
    t.id            = doc.id;
    t.stockId       = d['stock_id'];
    t.type          = d['type'];
    t.date          = (d['date'] as Timestamp).toDate().toISOString();
    t.shares        = d['shares'];
    t.pricePerShare = d['price_per_share'];
    t.fee           = d['fee'];
    t.note          = d['note'] ?? '';
    const ca        = d['created_at'];
    t.createdAt     = ca instanceof Timestamp ? ca.toDate().toISOString() : new Date().toISOString();
    return t;
  }
}
