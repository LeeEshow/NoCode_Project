import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export type ForeignAssetType = '活存' | '定存' | '債券';

export const ALLOWED_CURRENCIES = ['USD', 'JPY', 'EUR', 'CNY', 'HKD', 'GBP', 'AUD', 'SGD'] as const;

export interface ForeignAssetInput {
  type:          ForeignAssetType;
  name:          string;          // 活存/定存可留空，顯示時以幣別代替
  currency:      string;          // 參照 ALLOWED_CURRENCIES
  amount:        number;          // 本金 / 持有面額
  interestRate:  number;          // 年利率 raw decimal（0.045 = 4.5%）
  maturityDate:  string | null;   // YYYY-MM-DD，活存為 null
  useManualRate: boolean;
  manualRate:    number;          // useManualRate=false 時忽略
}

export interface ForeignAssetDoc extends ForeignAssetInput {
  id:        string;
  updatedAt: string; // ISO string
}

// GET 回傳格式（包含後端注入的 liveRate）
export interface ForeignAssetResponse extends ForeignAssetDoc {
  liveRate: number | null;
}

const COL = 'foreign_assets';

// ── Model ───────────────────────────────────────────────────────────────────

export class ForeignAsset {
  static async findAll(): Promise<ForeignAssetDoc[]> {
    const snap = await db.collection(COL).orderBy('updated_at', 'desc').get();
    return snap.docs.map(d => deserialize(d));
  }

  static async findById(id: string): Promise<ForeignAssetDoc | null> {
    const doc = await db.collection(COL).doc(id).get();
    return doc.exists ? deserialize(doc) : null;
  }

  static async create(input: ForeignAssetInput): Promise<ForeignAssetDoc> {
    const ref = db.collection(COL).doc();
    await ref.set({
      type:           input.type,
      name:           input.name,
      currency:       input.currency.toUpperCase(),
      amount:         input.amount,
      interest_rate:  input.interestRate,
      maturity_date:  input.maturityDate ?? null,
      use_manual_rate: input.useManualRate,
      manual_rate:    input.manualRate,
      updated_at:     admin.firestore.FieldValue.serverTimestamp(),
    });
    const created = await ref.get();
    return deserialize(created);
  }

  static async update(id: string, input: Partial<ForeignAssetInput>): Promise<ForeignAssetDoc | null> {
    const ref = db.collection(COL).doc(id);
    const existing = await ref.get();
    if (!existing.exists) return null;

    const patch: Record<string, unknown> = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (input.type           !== undefined) patch.type            = input.type;
    if (input.name           !== undefined) patch.name            = input.name;
    if (input.currency       !== undefined) patch.currency        = input.currency.toUpperCase();
    if (input.amount         !== undefined) patch.amount          = input.amount;
    if (input.interestRate   !== undefined) patch.interest_rate   = input.interestRate;
    if (input.maturityDate   !== undefined) patch.maturity_date   = input.maturityDate ?? null;
    if (input.useManualRate  !== undefined) patch.use_manual_rate = input.useManualRate;
    if (input.manualRate     !== undefined) patch.manual_rate     = input.manualRate;

    await ref.update(patch);
    const updated = await ref.get();
    return deserialize(updated);
  }

  static async delete(id: string): Promise<boolean> {
    const ref = db.collection(COL).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }
}

// ── 反序列化 ─────────────────────────────────────────────────────────────────

function deserialize(doc: admin.firestore.DocumentSnapshot): ForeignAssetDoc {
  const d = doc.data()!;
  const ua = d['updated_at'];
  return {
    id:            doc.id,
    type:          d['type'],
    name:          d['name'] ?? '',
    currency:      d['currency'],
    amount:        d['amount'],
    interestRate:  d['interest_rate'],
    maturityDate:  d['maturity_date'] ?? null,
    useManualRate: d['use_manual_rate'],
    manualRate:    d['manual_rate'],
    updatedAt:     ua instanceof admin.firestore.Timestamp
      ? ua.toDate().toISOString()
      : new Date().toISOString(),
  };
}
