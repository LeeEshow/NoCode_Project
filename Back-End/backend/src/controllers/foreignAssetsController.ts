import { Request, Response, NextFunction } from 'express';
import { ForeignAsset, ForeignAssetInput, ForeignAssetResponse, ALLOWED_CURRENCIES } from '../models/ForeignAsset';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getLiveRateMap } from '../global/rateHelper';

// ── GET /api/v1/foreign-assets ────────────────────────────────────────────────

export const getAll = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [assets, rateMap] = await Promise.all([
      ForeignAsset.findAll(),
      getLiveRateMap().catch(() => ({} as Record<string, number | null>)),
    ]);

    const result: ForeignAssetResponse[] = assets.map(a => ({
      ...a,
      liveRate: rateMap[a.currency] ?? null,
    }));

    res.json(ApiResponse.success(result));
  } catch (err) { next(err); }
};

// ── POST /api/v1/foreign-assets ───────────────────────────────────────────────

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as ForeignAssetInput;
    validateInput(body);
    const created = await ForeignAsset.create(body);
    res.status(201).json(ApiResponse.success(created));
  } catch (err) { next(err); }
};

// ── PUT /api/v1/foreign-assets/:id ───────────────────────────────────────────

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params['id']);
    const body = req.body as Partial<ForeignAssetInput>;

    if (body.currency) body.currency = body.currency.toUpperCase();
    if (body.type && !['活存', '定存', '債券'].includes(body.type)) {
      throw new AppError(400, `type 必須為 活存 | 定存 | 債券`);
    }

    const updated = await ForeignAsset.update(id, body);
    if (!updated) throw new AppError(404, '找不到該外幣資產');
    res.json(ApiResponse.success(updated));
  } catch (err) { next(err); }
};

// ── DELETE /api/v1/foreign-assets/:id ────────────────────────────────────────

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params['id']);
    const deleted = await ForeignAsset.delete(id);
    if (!deleted) throw new AppError(404, '找不到該外幣資產');
    res.json(ApiResponse.success({ deleted: true }));
  } catch (err) { next(err); }
};

// ── 驗證工具 ──────────────────────────────────────────────────────────────────

function validateInput(body: ForeignAssetInput): void {
  if (!['活存', '定存', '債券'].includes(body.type)) {
    throw new AppError(400, 'type 必須為 活存 | 定存 | 債券');
  }
  if (!body.currency || !(ALLOWED_CURRENCIES as readonly string[]).includes(body.currency.toUpperCase())) {
    throw new AppError(400, `currency 必須為 ${ALLOWED_CURRENCIES.join(' | ')}`);
  }
  if (typeof body.amount !== 'number' || body.amount < 0) {
    throw new AppError(400, 'amount 必須為非負數');
  }
  if (typeof body.interestRate !== 'number' || body.interestRate < 0) {
    throw new AppError(400, 'interestRate 必須為非負數');
  }
  if (body.type !== '活存' && !body.maturityDate) {
    throw new AppError(400, '定存與債券必須提供 maturityDate（YYYY-MM-DD）');
  }
  if (body.maturityDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.maturityDate)) {
    throw new AppError(400, 'maturityDate 格式錯誤，應為 YYYY-MM-DD');
  }
}
