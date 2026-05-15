import * as admin from 'firebase-admin';
import { db } from '../global/firebase';

export interface CorrelationEntry {
  tagA: string;
  tagB: string;
  rho: number;
}

export interface TagCorrelationMatrixDoc {
  lastUpdated: string;
  entries: CorrelationEntry[];
  previousEntries: CorrelationEntry[] | null;
}

const COL    = 'tag_correlation_matrix';
const DOC_ID = 'main';

const DEFAULT: TagCorrelationMatrixDoc = {
  lastUpdated: new Date().toISOString(),
  entries: [],
  previousEntries: null,
};

export class TagCorrelationMatrix {
  static async find(): Promise<TagCorrelationMatrixDoc> {
    const doc = await db.collection(COL).doc(DOC_ID).get();
    if (!doc.exists) return DEFAULT;
    return deserialize(doc);
  }

  static async upsert(entries: CorrelationEntry[]): Promise<TagCorrelationMatrixDoc> {
    const ref = db.collection(COL).doc(DOC_ID);
    const existing = await ref.get();
    const prevEntries = existing.exists
      ? ((existing.data()!['entries'] ?? []) as Array<Record<string, unknown>>).map(e => ({
          tag_a: e['tag_a'],
          tag_b: e['tag_b'],
          rho:   e['rho'],
        }))
      : null;

    await ref.set({
      last_updated:     admin.firestore.FieldValue.serverTimestamp(),
      entries:          entries.map(e => ({ tag_a: e.tagA, tag_b: e.tagB, rho: e.rho })),
      previous_entries: prevEntries,
    });
    return deserialize(await ref.get());
  }
}

function deserializeEntries(raw: unknown): CorrelationEntry[] {
  return ((raw ?? []) as Array<Record<string, unknown>>).map(e => ({
    tagA: e['tag_a'] as string,
    tagB: e['tag_b'] as string,
    rho:  e['rho']   as number,
  }));
}

function deserialize(doc: admin.firestore.DocumentSnapshot): TagCorrelationMatrixDoc {
  const d = doc.data()!;
  const lu = d['last_updated'];
  return {
    lastUpdated: lu instanceof admin.firestore.Timestamp
      ? lu.toDate().toISOString()
      : new Date().toISOString(),
    entries:         deserializeEntries(d['entries']),
    previousEntries: d['previous_entries'] != null
      ? deserializeEntries(d['previous_entries'])
      : null,
  };
}
