import { db } from '../global/firebase';
import { FieldValue } from 'firebase-admin/firestore';

export interface ChartPreferences {
  showK:      boolean;
  showMA5:    boolean;
  showMA20:   boolean;
  showMA60:   boolean;
  showVolume: boolean;
  zoomLock:   boolean;
}

export interface UserPreferences {
  chart: ChartPreferences;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  chart: {
    showK:      true,
    showMA5:    true,
    showMA20:   true,
    showMA60:   true,
    showVolume: true,
    zoomLock:   false,
  },
};

export class Preferences {
  private static readonly docRef = db.collection('preferences').doc('default');

  static async find(): Promise<UserPreferences> {
    const doc = await this.docRef.get();
    if (!doc.exists) return DEFAULT_PREFERENCES;
    return Preferences.fromSnapshot(doc.data()!);
  }

  static async merge(input: Partial<UserPreferences>): Promise<UserPreferences> {
    const current = await this.find();
    const updated: UserPreferences = {
      ...current,
      ...input,
      chart: {
        ...current.chart,
        ...(input.chart ?? {}),
      },
    };
    await this.docRef.set(
      {
        chart:      updated.chart,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return updated;
  }

  private static fromSnapshot(d: FirebaseFirestore.DocumentData): UserPreferences {
    const chart = d['chart'] ?? {};
    return {
      chart: {
        showK:      chart['showK']      ?? true,
        showMA5:    chart['showMA5']    ?? true,
        showMA20:   chart['showMA20']   ?? true,
        showMA60:   chart['showMA60']   ?? true,
        showVolume: chart['showVolume'] ?? true,
        zoomLock:   chart['zoomLock']   ?? false,
      },
    };
  }
}
