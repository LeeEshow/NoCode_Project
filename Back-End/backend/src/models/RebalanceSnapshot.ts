import * as admin from 'firebase-admin';
import { db } from '../global/firebase';
import { MarketStateName } from './MarketState';

export interface SnapshotParams {
  totalAsset:        number;
  baseThreshold:     number;
  liquidityCapRatio: number;
  marketState:       MarketStateName;
}

export interface SnapshotSuggestion {
  stockCode:          string;
  stockName:          string;
  action:             'buy' | 'sell' | 'hold';
  shares:             number;
  estimatedAmount:    number;
  isLiquidityLimited: boolean;
}

export interface RebalanceSnapshotDoc {
  id:          string;
  createdAt:   string;
  params:      SnapshotParams;
  suggestions: SnapshotSuggestion[];
}

export interface RebalanceSnapshotInput {
  params:      SnapshotParams;
  suggestions: SnapshotSuggestion[];
}

const COL = 'rebalance_snapshots';

export class RebalanceSnapshot {
  /** 取得最近 N 筆快照（依 createdAt 降冪） */
  static async findRecent(limit = 10): Promise<RebalanceSnapshotDoc[]> {
    const snap = await db.collection(COL)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(deserialize);
  }

  /** 新增一筆快照（append-only） */
  static async create(input: RebalanceSnapshotInput): Promise<RebalanceSnapshotDoc> {
    const ref = db.collection(COL).doc();
    await ref.set({
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      params: {
        total_asset:         input.params.totalAsset,
        base_threshold:      input.params.baseThreshold,
        liquidity_cap_ratio: input.params.liquidityCapRatio,
        market_state:        input.params.marketState,
      },
      suggestions: input.suggestions.map(s => ({
        stock_code:           s.stockCode,
        stock_name:           s.stockName,
        action:               s.action,
        shares:               s.shares,
        estimated_amount:     s.estimatedAmount,
        is_liquidity_limited: s.isLiquidityLimited,
      })),
    });
    return deserialize(await ref.get());
  }
}

function deserialize(doc: admin.firestore.DocumentSnapshot): RebalanceSnapshotDoc {
  const d = doc.data()!;
  const p = d['params'] as Record<string, unknown>;
  const ca = d['created_at'];

  return {
    id: doc.id,
    createdAt: ca instanceof admin.firestore.Timestamp
      ? ca.toDate().toISOString()
      : new Date().toISOString(),
    params: {
      totalAsset:        p['total_asset']         as number,
      baseThreshold:     p['base_threshold']       as number,
      liquidityCapRatio: p['liquidity_cap_ratio']  as number,
      marketState:       p['market_state']         as MarketStateName,
    },
    suggestions: ((d['suggestions'] ?? []) as Array<Record<string, unknown>>).map(s => ({
      stockCode:          s['stock_code']           as string,
      stockName:          s['stock_name']           as string,
      action:             s['action']               as 'buy' | 'sell' | 'hold',
      shares:             s['shares']               as number,
      estimatedAmount:    s['estimated_amount']      as number,
      isLiquidityLimited: s['is_liquidity_limited'] as boolean,
    })),
  };
}
