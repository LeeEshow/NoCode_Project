import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

export interface AiReportDoc {
  reportDate:       string;
  marketState:      string;
  summary:          string;
  exposureAnalysis: string;
  stockStrategies:  string;
  riskWarnings:     string;
  generatedAt:      string;
  createdAt:        string;
}

const COL = 'daily_ai_reports';

export class AiReport {
  /** 寫入（冪等 set，同日重覆呼叫安全） */
  static async save(doc: Omit<AiReportDoc, 'createdAt'>): Promise<AiReportDoc> {
    const ref = db.collection(COL).doc(doc.reportDate);
    await ref.set({
      report_date:       doc.reportDate,
      market_state:      doc.marketState,
      summary:           doc.summary,
      exposure_analysis: doc.exposureAnalysis,
      stock_strategies:  doc.stockStrategies,
      risk_warnings:     doc.riskWarnings,
      generated_at:      doc.generatedAt,
      created_at:        admin.firestore.FieldValue.serverTimestamp(),
    });
    return deserialize(await ref.get());
  }

  /** 取最新一筆（依 reportDate 降冪 limit 1） */
  static async findLatest(): Promise<AiReportDoc | null> {
    const snap = await db.collection(COL)
      .orderBy('report_date', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return deserialize(snap.docs[0]);
  }

  /** 依日期取單筆 */
  static async findByDate(date: string): Promise<AiReportDoc | null> {
    const doc = await db.collection(COL).doc(date).get();
    return doc.exists ? deserialize(doc) : null;
  }
}

function deserialize(doc: admin.firestore.DocumentSnapshot): AiReportDoc {
  const d = doc.data()!;
  return {
    reportDate:       d['report_date']       ?? doc.id,
    marketState:      d['market_state']      ?? '',
    summary:          d['summary']           ?? '',
    exposureAnalysis: d['exposure_analysis'] ?? '',
    stockStrategies:  d['stock_strategies']  ?? '',
    riskWarnings:     d['risk_warnings']     ?? '',
    generatedAt:      d['generated_at']      ?? '',
    createdAt:        d['created_at'] instanceof admin.firestore.Timestamp
      ? d['created_at'].toDate().toISOString()
      : new Date().toISOString(),
  };
}
