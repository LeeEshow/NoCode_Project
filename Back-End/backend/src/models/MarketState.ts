import { db } from '../global/firebase';

export type MarketStateName = 'neutral' | 'risk-on' | 'risk-off' | 'liquidity-dry';

export interface MarketStateDoc {
  current: MarketStateName;
}

const COL    = 'market_state';
const DOC_ID = 'main';

export class MarketState {
  static async find(): Promise<MarketStateDoc> {
    const doc = await db.collection(COL).doc(DOC_ID).get();
    if (!doc.exists) return { current: 'neutral' };
    return { current: (doc.data()!['current'] as MarketStateName) ?? 'neutral' };
  }

  static async set(state: MarketStateName): Promise<MarketStateDoc> {
    await db.collection(COL).doc(DOC_ID).set({ current: state });
    return { current: state };
  }
}
