import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

export interface RebalanceRuleDoc {
  baseThreshold:    number; // 再平衡觸發閾值（raw decimal，如 0.05 = 5%）
  volatilityFactor: number; // 波動度係數（乘數，預設 1.0）
  liquidityCapRatio: number; // 流動性上限比例（raw decimal，如 0.20 = 20%）
  advLookbackDays:  number; // ADV 計算天數（整數，5–60，預設 20）
  concentrationLimit: number; // 集中度上限（raw decimal，0.50–0.95，預設 0.70）
}

const COL    = 'rebalance_rules';
const DOC_ID = 'main';

const DEFAULTS: RebalanceRuleDoc = {
  baseThreshold:    0.05,
  volatilityFactor: 1.0,
  liquidityCapRatio: 0.20,
  advLookbackDays:  20,
  concentrationLimit: 0.70,
};

export class RebalanceRule {
  static async find(): Promise<RebalanceRuleDoc> {
    const doc = await db.collection(COL).doc(DOC_ID).get();
    if (!doc.exists) return DEFAULTS;
    return deserialize(doc);
  }

  static async upsert(input: RebalanceRuleDoc): Promise<RebalanceRuleDoc> {
    const ref = db.collection(COL).doc(DOC_ID);
    await ref.set({
      base_threshold:      input.baseThreshold,
      volatility_factor:   input.volatilityFactor,
      liquidity_cap_ratio: input.liquidityCapRatio,
      adv_lookback_days:   input.advLookbackDays,
      concentration_limit: input.concentrationLimit,
      updated_at:          admin.firestore.FieldValue.serverTimestamp(),
    });
    return deserialize(await ref.get());
  }
}

function deserialize(doc: admin.firestore.DocumentSnapshot): RebalanceRuleDoc {
  const d = doc.data()!;
  return {
    baseThreshold:     d['base_threshold']      ?? DEFAULTS.baseThreshold,
    volatilityFactor:  d['volatility_factor']   ?? DEFAULTS.volatilityFactor,
    liquidityCapRatio: d['liquidity_cap_ratio'] ?? DEFAULTS.liquidityCapRatio,
    advLookbackDays:   d['adv_lookback_days']   ?? DEFAULTS.advLookbackDays,
    concentrationLimit: d['concentration_limit'] ?? DEFAULTS.concentrationLimit,
  };
}
