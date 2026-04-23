import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export interface ForeignCurrencyInput {
  currencyCode: string;
  amount: number;
  useManualRate: boolean;
  manualRate: number;
}

export interface ForeignCurrencyDoc extends ForeignCurrencyInput {
  updatedAt: Date;
}

const COL = 'foreign_currencies';

const ALLOWED_CODES = ['USD', 'JPY', 'EUR', 'CNY', 'HKD', 'GBP', 'AUD', 'SGD'];

// ── Model ───────────────────────────────────────────────────────────────────

export class ForeignCurrency {
  static readonly allowedCodes = ALLOWED_CODES;

  static async findAll(): Promise<ForeignCurrencyDoc[]> {
    const snap = await db.collection(COL).get();
    return snap.docs.map(d => deserialize(d));
  }

  static async findByCode(code: string): Promise<ForeignCurrencyDoc | null> {
    const doc = await db.collection(COL).doc(code.toUpperCase()).get();
    return doc.exists ? deserialize(doc) : null;
  }

  /** 新增或更新（Document ID = 幣別代碼） */
  static async upsert(input: ForeignCurrencyInput): Promise<ForeignCurrencyDoc> {
    const code = input.currencyCode.toUpperCase();
    const ref  = db.collection(COL).doc(code);
    await ref.set(
      {
        currency_code:   code,
        amount:          input.amount,
        use_manual_rate: input.useManualRate,
        manual_rate:     input.manualRate,
        updated_at:      admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const updated = await ref.get();
    return deserialize(updated);
  }

  static async delete(code: string): Promise<boolean> {
    const ref = db.collection(COL).doc(code.toUpperCase());
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }
}

// ── 反序列化 ─────────────────────────────────────────────────────────────────

function deserialize(doc: admin.firestore.DocumentSnapshot): ForeignCurrencyDoc {
  const d = doc.data()!;
  return {
    currencyCode:   d.currency_code,
    amount:         d.amount,
    useManualRate:  d.use_manual_rate,
    manualRate:     d.manual_rate,
    updatedAt:      d.updated_at instanceof admin.firestore.Timestamp
      ? d.updated_at.toDate()
      : new Date(),
  };
}
