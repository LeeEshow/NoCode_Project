import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export interface PlanConfigInput {
  annualInvest:        number;                  // 每年投入預設值
  rBase:               number;                  // 基礎殖利率 raw decimal（0.08 = 8%）
  inflation:           'low' | 'base' | 'high'; // 通膨情境
  kRisk:               number;                  // 景氣係數
  startYear:           number;                  // 起始年份
  overrides:           Record<string, number>;  // { "1": 150000 }，yearIndex（1-based）→ 該年計畫投入
  currentYearReinvest: number;                  // 當年度手動填入的再投入金額
}

export interface PlanConfigDoc extends PlanConfigInput {
  updatedAt: string; // ISO string
}

const COL      = 'plan_config';
const DOC_ID   = 'main';

const DEFAULTS: PlanConfigInput = {
  annualInvest:        120000,
  rBase:               0.08,
  inflation:           'base',
  kRisk:               1.0,
  startYear:           new Date().getFullYear(),
  overrides:           {},
  currentYearReinvest: 0,
};

// ── Model ───────────────────────────────────────────────────────────────────

export class PlanConfig {
  /** 取得計畫設定；Firestore 無資料時回傳預設值 */
  static async find(): Promise<PlanConfigDoc> {
    const doc = await db.collection(COL).doc(DOC_ID).get();
    if (!doc.exists) {
      return { ...DEFAULTS, updatedAt: new Date().toISOString() };
    }
    return deserialize(doc);
  }

  /** 整筆覆寫計畫設定 */
  static async upsert(input: PlanConfigInput): Promise<PlanConfigDoc> {
    const ref = db.collection(COL).doc(DOC_ID);
    await ref.set({
      annual_invest:          input.annualInvest,
      r_base:                 input.rBase,
      inflation:              input.inflation,
      k_risk:                 input.kRisk,
      start_year:             input.startYear,
      overrides:              input.overrides,
      current_year_reinvest:  input.currentYearReinvest,
      updated_at:             admin.firestore.FieldValue.serverTimestamp(),
    });
    const updated = await ref.get();
    return deserialize(updated);
  }
}

// ── 反序列化 ─────────────────────────────────────────────────────────────────

function deserialize(doc: admin.firestore.DocumentSnapshot): PlanConfigDoc {
  const d = doc.data()!;
  const ua = d['updated_at'];
  return {
    annualInvest:        d['annual_invest']         ?? DEFAULTS.annualInvest,
    rBase:               d['r_base']                ?? DEFAULTS.rBase,
    inflation:           d['inflation']             ?? DEFAULTS.inflation,
    kRisk:               d['k_risk']               ?? DEFAULTS.kRisk,
    startYear:           d['start_year']            ?? DEFAULTS.startYear,
    overrides:           d['overrides']             ?? {},
    currentYearReinvest: d['current_year_reinvest'] ?? 0,
    updatedAt: ua instanceof admin.firestore.Timestamp
      ? ua.toDate().toISOString()
      : new Date().toISOString(),
  };
}
