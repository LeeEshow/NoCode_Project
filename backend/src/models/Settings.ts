import { db } from '../global/firebase';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export type CostMethod = 'preserve_method' | 'return_method';

export interface SettingsInput {
  costMethod: CostMethod;
}

export class Settings {
  costMethod!: CostMethod;
  updatedAt!: string;

  private static readonly docRef = db.collection('settings').doc('main');

  static async find(): Promise<Settings | null> {
    const doc = await this.docRef.get();
    return doc.exists ? Settings.fromSnapshot(doc) : null;
  }

  static async upsert(input: SettingsInput): Promise<Settings> {
    await this.docRef.set(
      {
        cost_method: input.costMethod,
        updated_at:  FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const doc = await this.docRef.get();
    return Settings.fromSnapshot(doc);
  }

  private static fromSnapshot(doc: FirebaseFirestore.DocumentSnapshot): Settings {
    const d = doc.data()!;
    const s = new Settings();
    s.costMethod = d['cost_method'] ?? 'preserve_method';
    const ua     = d['updated_at'];
    s.updatedAt  = ua instanceof Timestamp ? ua.toDate().toISOString() : new Date().toISOString();
    return s;
  }
}
