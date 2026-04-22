import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export interface BondInput {
  name: string;
  couponRate: number;   // e.g. 0.045 = 4.5%
  maturityDate: string; // YYYY-MM-DD
  currency: string;     // 'USD' | 'TWD' | ...
  faceValue: number;
  note?: string;
}

export interface BondDoc extends Required<BondInput> {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const COL = 'bonds';

// ── Model ───────────────────────────────────────────────────────────────────

export class Bond {
  static async findAll(): Promise<BondDoc[]> {
    const snap = await db.collection(COL).orderBy('created_at', 'asc').get();
    return snap.docs.map(d => deserialize(d));
  }

  static async findById(id: string): Promise<BondDoc | null> {
    const doc = await db.collection(COL).doc(id).get();
    return doc.exists ? deserialize(doc) : null;
  }

  static async create(input: BondInput): Promise<BondDoc> {
    const ref = db.collection(COL).doc();
    await ref.set({
      name:          input.name,
      coupon_rate:   input.couponRate,
      maturity_date: input.maturityDate,
      currency:      input.currency.toUpperCase(),
      face_value:    input.faceValue,
      note:          input.note ?? '',
      created_at:    admin.firestore.FieldValue.serverTimestamp(),
      updated_at:    admin.firestore.FieldValue.serverTimestamp(),
    });
    const created = await ref.get();
    return deserialize(created);
  }

  static async update(id: string, input: Partial<BondInput>): Promise<BondDoc | null> {
    const ref = db.collection(COL).doc(id);
    const existing = await ref.get();
    if (!existing.exists) return null;

    const patch: Record<string, unknown> = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (input.name          !== undefined) patch.name          = input.name;
    if (input.couponRate    !== undefined) patch.coupon_rate   = input.couponRate;
    if (input.maturityDate  !== undefined) patch.maturity_date = input.maturityDate;
    if (input.currency      !== undefined) patch.currency      = input.currency.toUpperCase();
    if (input.faceValue     !== undefined) patch.face_value    = input.faceValue;
    if (input.note          !== undefined) patch.note          = input.note;

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

function deserialize(doc: admin.firestore.DocumentSnapshot): BondDoc {
  const d = doc.data()!;
  return {
    id:           doc.id,
    name:         d.name,
    couponRate:   d.coupon_rate,
    maturityDate: d.maturity_date,
    currency:     d.currency,
    faceValue:    d.face_value,
    note:         d.note ?? '',
    createdAt:    d.created_at instanceof admin.firestore.Timestamp
      ? d.created_at.toDate()
      : new Date(),
    updatedAt:    d.updated_at instanceof admin.firestore.Timestamp
      ? d.updated_at.toDate()
      : new Date(),
  };
}
