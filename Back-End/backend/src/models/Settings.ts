import { db } from '../global/firebase';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export type CostMethod = 'preserve_method' | 'return_method';

export interface SettingsInput {
  costMethod?: CostMethod;
  aiSystemPrompt?: string;
  aiReportEnabled?: boolean;
}

export class Settings {
  costMethod!: CostMethod;
  updatedAt!: string;
  aiSystemPrompt!: string;
  aiSystemPromptUpdatedAt!: string | null;
  aiReportEnabled!: boolean;

  private static readonly docRef = db.collection('settings').doc('main');

  static async find(): Promise<Settings | null> {
    const doc = await this.docRef.get();
    return doc.exists ? Settings.fromSnapshot(doc) : null;
  }

  static async upsert(input: SettingsInput): Promise<Settings> {
    const patch: Record<string, unknown> = {
      updated_at: FieldValue.serverTimestamp(),
    };
    if (input.costMethod !== undefined) {
      patch['cost_method'] = input.costMethod;
    }
    if (input.aiSystemPrompt !== undefined) {
      patch['ai_system_prompt'] = input.aiSystemPrompt;
      patch['ai_system_prompt_updated_at'] = FieldValue.serverTimestamp();
    }
    if (input.aiReportEnabled !== undefined) {
      patch['ai_report_enabled'] = input.aiReportEnabled;
    }
    await this.docRef.set(patch, { merge: true });
    const doc = await this.docRef.get();
    return Settings.fromSnapshot(doc);
  }

  private static fromSnapshot(doc: FirebaseFirestore.DocumentSnapshot): Settings {
    const d = doc.data()!;
    const s = new Settings();
    s.costMethod = d['cost_method'] ?? 'preserve_method';
    const ua     = d['updated_at'];
    s.updatedAt  = ua instanceof Timestamp ? ua.toDate().toISOString() : new Date().toISOString();
    s.aiSystemPrompt = d['ai_system_prompt'] ?? '';
    const aspt = d['ai_system_prompt_updated_at'];
    s.aiSystemPromptUpdatedAt = aspt instanceof Timestamp ? aspt.toDate().toISOString() : null;
    s.aiReportEnabled = d['ai_report_enabled'] ?? false;
    return s;
  }
}
