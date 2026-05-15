import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

export interface MarketStatePresets {
  riskOn:       number | null;
  riskOff:      number | null;
  liquidityDry: number | null;
}

export interface TagInput {
  name: string;
  baseRisk: number;
  targetWeight?:        number | null;
  fallbackBehavior?:    'hold' | 'exclude' | null;
  marketStatePresets?:  Partial<MarketStatePresets> | null;
}

export interface TagDoc {
  id: string;
  name: string;
  baseRisk: number;
  dynamicRisk: number;
  targetWeight: number | null;
  fallbackBehavior: string;
  marketStatePresets: MarketStatePresets | null;
}

const COL = 'tags';

export class Tag {
  static async findAll(): Promise<TagDoc[]> {
    const snap = await db.collection(COL).orderBy('name').get();
    return snap.docs.map(deserialize);
  }

  static async findById(id: string): Promise<TagDoc | null> {
    const doc = await db.collection(COL).doc(id).get();
    return doc.exists ? deserialize(doc) : null;
  }

  static async findByName(name: string): Promise<TagDoc | null> {
    const snap = await db.collection(COL).where('name', '==', name).limit(1).get();
    return snap.empty ? null : deserialize(snap.docs[0]);
  }

  static async create(input: TagInput): Promise<TagDoc> {
    const ref = db.collection(COL).doc();
    await ref.set({
      name:              input.name,
      base_risk:         input.baseRisk,
      dynamic_risk:      input.baseRisk,
      target_weight:     input.targetWeight ?? null,
      fallback_behavior: input.fallbackBehavior ?? 'hold',
      market_state_presets: serializePresets(input.marketStatePresets),
    });
    return deserialize(await ref.get());
  }

  static async update(id: string, input: Partial<TagInput>): Promise<TagDoc | null> {
    const ref = db.collection(COL).doc(id);
    if (!(await ref.get()).exists) return null;

    const patch: Record<string, unknown> = {};
    if (input.name             !== undefined) patch.name              = input.name;
    if (input.baseRisk         !== undefined) patch.base_risk         = input.baseRisk;
    if ('targetWeight'    in input)           patch.target_weight     = input.targetWeight ?? null;
    if ('fallbackBehavior' in input)          patch.fallback_behavior = input.fallbackBehavior ?? 'hold';
    if ('marketStatePresets' in input)        patch.market_state_presets = serializePresets(input.marketStatePresets);

    await ref.update(patch);
    return deserialize(await ref.get());
  }

  static async delete(id: string): Promise<boolean> {
    const ref = db.collection(COL).doc(id);
    if (!(await ref.get()).exists) return false;
    await ref.delete();
    return true;
  }

  /** 批次更新各 Tag 的 dynamicRisk（市場狀態切換時使用） */
  static async batchUpdateDynamicRisk(updates: { id: string; dynamicRisk: number }[]): Promise<void> {
    const batch = db.batch();
    for (const { id, dynamicRisk } of updates) {
      batch.update(db.collection(COL).doc(id), { dynamic_risk: dynamicRisk });
    }
    await batch.commit();
  }

  /** 批次更新各 Tag 的 dynamicRisk + marketStatePresets（動態風險重算時使用） */
  static async batchUpdateRisk(updates: {
    id: string;
    dynamicRisk: number;
    marketStatePresets: { riskOn: number; riskOff: number; liquidityDry: number };
  }[]): Promise<void> {
    const batch = db.batch();
    for (const { id, dynamicRisk, marketStatePresets } of updates) {
      batch.update(db.collection(COL).doc(id), {
        dynamic_risk: dynamicRisk,
        market_state_presets: {
          risk_on:       marketStatePresets.riskOn,
          risk_off:      marketStatePresets.riskOff,
          liquidity_dry: marketStatePresets.liquidityDry,
        },
      });
    }
    await batch.commit();
  }
}

function serializePresets(
  presets: Partial<MarketStatePresets> | null | undefined
): Record<string, number | null> | null {
  if (presets == null) return null;
  return {
    risk_on:       presets.riskOn       ?? null,
    risk_off:      presets.riskOff      ?? null,
    liquidity_dry: presets.liquidityDry ?? null,
  };
}

function deserialize(doc: admin.firestore.DocumentSnapshot): TagDoc {
  const d = doc.data()!;
  const msp = d['market_state_presets'] as Record<string, number | null> | null | undefined;
  return {
    id:               doc.id,
    name:             d['name'],
    baseRisk:         d['base_risk'],
    dynamicRisk:      d['dynamic_risk'] ?? d['base_risk'],
    targetWeight:     d['target_weight'] ?? null,
    fallbackBehavior: d['fallback_behavior'] ?? 'hold',
    marketStatePresets: msp
      ? {
          riskOn:       msp['risk_on']       ?? null,
          riskOff:      msp['risk_off']      ?? null,
          liquidityDry: msp['liquidity_dry'] ?? null,
        }
      : null,
  };
}
