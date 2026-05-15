import { Request, Response, NextFunction } from 'express';
import { RebalanceSnapshot, SnapshotSuggestion } from '../models/RebalanceSnapshot';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

const VALID_STATES  = ['neutral', 'risk-on', 'risk-off', 'liquidity-dry'] as const;
const VALID_ACTIONS = ['buy', 'sell', 'hold'] as const;

export const getRecent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw   = Number(req.query['limit'] ?? 10);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 100) : 10;
    res.json(ApiResponse.success(await RebalanceSnapshot.findRecent(limit)));
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { params, suggestions } = req.body;

    // ── params 驗證 ──
    if (!params || typeof params !== 'object') {
      throw new AppError(400, 'params 為必填物件');
    }
    const { totalAsset, baseThreshold, liquidityCapRatio, marketState } = params;

    if (typeof totalAsset !== 'number' || totalAsset <= 0) {
      throw new AppError(400, 'params.totalAsset 必須為正數');
    }
    if (typeof baseThreshold !== 'number' || baseThreshold <= 0 || baseThreshold > 1) {
      throw new AppError(400, 'params.baseThreshold 必須為 0 < value ≤ 1 的數字');
    }
    if (typeof liquidityCapRatio !== 'number' || liquidityCapRatio <= 0 || liquidityCapRatio > 1) {
      throw new AppError(400, 'params.liquidityCapRatio 必須為 0 < value ≤ 1 的數字');
    }
    if (!VALID_STATES.includes(marketState)) {
      throw new AppError(400, `params.marketState 必須為：${VALID_STATES.join(' | ')}`);
    }

    // ── suggestions 驗證 ──
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new AppError(400, 'suggestions 必須為非空陣列');
    }
    for (const [i, s] of suggestions.entries()) {
      if (!s.stockCode || typeof s.stockCode !== 'string') {
        throw new AppError(400, `suggestions[${i}].stockCode 為必填字串`);
      }
      if (!s.stockName || typeof s.stockName !== 'string') {
        throw new AppError(400, `suggestions[${i}].stockName 為必填字串`);
      }
      if (!VALID_ACTIONS.includes(s.action)) {
        throw new AppError(400, `suggestions[${i}].action 必須為：${VALID_ACTIONS.join(' | ')}`);
      }
      if (typeof s.shares !== 'number' || !Number.isInteger(s.shares) || s.shares < 0) {
        throw new AppError(400, `suggestions[${i}].shares 必須為非負整數`);
      }
      if (typeof s.estimatedAmount !== 'number' || s.estimatedAmount < 0) {
        throw new AppError(400, `suggestions[${i}].estimatedAmount 必須為非負數`);
      }
      if (typeof s.isLiquidityLimited !== 'boolean') {
        throw new AppError(400, `suggestions[${i}].isLiquidityLimited 必須為布林值`);
      }
    }

    const snapshot = await RebalanceSnapshot.create({
      params: { totalAsset, baseThreshold, liquidityCapRatio, marketState },
      suggestions: suggestions as SnapshotSuggestion[],
    });
    res.status(201).json(ApiResponse.success(snapshot));
  } catch (err) { next(err); }
};
