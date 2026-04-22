import { db } from '../global/firebase';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface InvestmentPlanInput {
  assetType: string;
  annualInvest: number;
  rBase: number;
  piBase: number;
  piShock: number;
  inflationScenario: 'low' | 'base' | 'high';
  kRisk: number;
  startYear: number;
  planYears: number;
}

export class InvestmentPlan {
  assetType!: string;
  annualInvest!: number;
  rBase!: number;
  piBase!: number;
  piShock!: number;
  inflationScenario!: string;
  kRisk!: number;
  startYear!: number;
  planYears!: number;
  createdAt!: string;
  updatedAt!: string;

  private static readonly col = db.collection('investment_plans');

  static async find(assetType = 'tw_stock'): Promise<InvestmentPlan | null> {
    const doc = await this.col.doc(assetType).get();
    return doc.exists ? InvestmentPlan.fromSnapshot(doc) : null;
  }

  static async upsert(input: InvestmentPlanInput): Promise<InvestmentPlan> {
    const ref = this.col.doc(input.assetType);
    const existing = await ref.get();

    await ref.set(
      {
        asset_type:         input.assetType,
        annual_invest:      input.annualInvest,
        r_base:             input.rBase,
        pi_base:            input.piBase,
        pi_shock:           input.piShock,
        inflation_scenario: input.inflationScenario,
        k_risk:             input.kRisk,
        start_year:         input.startYear,
        plan_years:         input.planYears,
        created_at:         existing.exists ? existing.data()!['created_at'] : FieldValue.serverTimestamp(),
        updated_at:         FieldValue.serverTimestamp(),
      },
      { merge: false }
    );

    const updated = await ref.get();
    return InvestmentPlan.fromSnapshot(updated);
  }

  private static fromSnapshot(doc: FirebaseFirestore.DocumentSnapshot): InvestmentPlan {
    const d = doc.data()!;
    const p = new InvestmentPlan();
    p.assetType         = doc.id;
    p.annualInvest      = d['annual_invest'];
    p.rBase             = d['r_base'];
    p.piBase            = d['pi_base'];
    p.piShock           = d['pi_shock'];
    p.inflationScenario = d['inflation_scenario'];
    p.kRisk             = d['k_risk'];
    p.startYear         = d['start_year'];
    p.planYears         = d['plan_years'];
    const ca            = d['created_at'];
    const ua            = d['updated_at'];
    p.createdAt         = ca instanceof Timestamp ? ca.toDate().toISOString() : new Date().toISOString();
    p.updatedAt         = ua instanceof Timestamp ? ua.toDate().toISOString() : new Date().toISOString();
    return p;
  }
}
