import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

export interface AssetTagInput {
  stockCode: string;
  tagName: string;
  weightRatio: number;
}

export interface AssetTagDoc {
  id: string;
  stockCode: string;
  tagName: string;
  weightRatio: number;
}

const COL = 'asset_tags';

export class AssetTag {
  static async findAll(stockCode?: string): Promise<AssetTagDoc[]> {
    let query: admin.firestore.Query = db.collection(COL);
    if (stockCode) query = query.where('stock_code', '==', stockCode);
    const snap = await query.get();
    return snap.docs.map(deserialize);
  }

  static async findById(id: string): Promise<AssetTagDoc | null> {
    const doc = await db.collection(COL).doc(id).get();
    return doc.exists ? deserialize(doc) : null;
  }

  static async findByTagName(tagName: string): Promise<AssetTagDoc[]> {
    const snap = await db.collection(COL).where('tag_name', '==', tagName).get();
    return snap.docs.map(deserialize);
  }

  static async create(input: AssetTagInput): Promise<AssetTagDoc> {
    const ref = db.collection(COL).doc();
    await ref.set({
      stock_code:   input.stockCode,
      tag_name:     input.tagName,
      weight_ratio: input.weightRatio,
    });
    return deserialize(await ref.get());
  }

  static async update(id: string, weightRatio: number): Promise<AssetTagDoc | null> {
    const ref = db.collection(COL).doc(id);
    if (!(await ref.get()).exists) return null;
    await ref.update({ weight_ratio: weightRatio });
    return deserialize(await ref.get());
  }

  static async delete(id: string): Promise<boolean> {
    const ref = db.collection(COL).doc(id);
    if (!(await ref.get()).exists) return false;
    await ref.delete();
    return true;
  }
}

function deserialize(doc: admin.firestore.DocumentSnapshot): AssetTagDoc {
  const d = doc.data()!;
  return {
    id:          doc.id,
    stockCode:   d['stock_code'],
    tagName:     d['tag_name'],
    weightRatio: d['weight_ratio'],
  };
}
