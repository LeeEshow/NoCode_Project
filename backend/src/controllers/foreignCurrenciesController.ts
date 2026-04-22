import { Request, Response, NextFunction } from 'express';
import { ForeignCurrency } from '../models/ForeignCurrency';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getLiveRateMap } from '../global/rateHelper';

/** GET /api/v1/foreign-currencies */
export const getAll = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const [currencies, rateMap] = await Promise.all([
      ForeignCurrency.findAll(),
      getLiveRateMap(),
    ]);

    const data = currencies.map(c => {
      const liveRate      = rateMap[c.currencyCode] ?? null;
      const effectiveRate = c.useManualRate ? c.manualRate : liveRate;
      const twdValue      = effectiveRate !== null
        ? +( c.amount * effectiveRate).toFixed(0)
        : null;
      return { ...c, liveRate, twdValue };
    });

    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** PUT /api/v1/foreign-currencies/:code */
export const upsert = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const code = String(req.params.code).toUpperCase();

    if (!ForeignCurrency.allowedCodes.includes(code)) {
      throw new AppError(400, `不支援的幣別：${code}，允許：${ForeignCurrency.allowedCodes.join(', ')}`);
    }

    const { amount, useManualRate, manualRate } = req.body;

    if (amount == null || useManualRate == null || manualRate == null) {
      throw new AppError(400, '缺少必填欄位：amount / useManualRate / manualRate');
    }

    const data = await ForeignCurrency.upsert({
      currencyCode: code,
      amount:       Number(amount),
      useManualRate: Boolean(useManualRate),
      manualRate:   Number(manualRate),
    });

    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/v1/foreign-currencies/:code */
export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const code    = String(req.params.code).toUpperCase();
    const deleted = await ForeignCurrency.delete(code);
    if (!deleted) throw new AppError(404, `外幣持倉不存在：${code}`);
    res.json(ApiResponse.success({ deleted: code }));
  } catch (err) {
    next(err);
  }
};
