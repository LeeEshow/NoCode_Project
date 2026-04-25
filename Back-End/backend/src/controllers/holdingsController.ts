import { Request, Response, NextFunction } from 'express';
import { Holding, HoldingInput } from '../models/Holding';
import { Stock } from '../models/Stock';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

export const getAll = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const holdings = await Holding.findAll();

    // 平行取得有持股的即時報價，失敗時靜默跳過
    const withPrices = await Promise.all(
      holdings.map(async h => {
        if (h.sharesHeld <= 0) return h;
        try {
          const quote = await Stock.getQuote(h.stockId);
          h.stockName      = quote.name;
          h.currentPrice   = quote.price;
          h.change         = quote.change;
          h.changePercent  = quote.changePercent;
        } catch {
          // 報價失敗不中斷整體回應
        }
        return h;
      })
    );

    res.json(ApiResponse.success(withPrices));
  } catch (err) { next(err); }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const h = await Holding.findById(String(req.params.stockId));
    if (!h) throw new AppError(404, '庫存不存在');

    if (h.sharesHeld > 0) {
      try {
        const quote     = await Stock.getQuote(h.stockId);
        h.stockName     = quote.name;
        h.currentPrice  = quote.price;
        h.change        = quote.change;
        h.changePercent = quote.changePercent;
      } catch { /* 報價失敗不中斷 */ }
    }

    res.json(ApiResponse.success(h));
  } catch (err) { next(err); }
};

export const reorder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      throw new AppError(400, 'order 必須為非空字串陣列');
    }
    await Holding.reorder(order.map(String));
    res.json(ApiResponse.success({ reordered: order.length }));
  } catch (err) { next(err); }
};

// P1-10：前端計算完畢後整批寫回 Firestore
export const recalculate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const holdings: HoldingInput[] = req.body;
    if (!Array.isArray(holdings) || holdings.length === 0) {
      throw new AppError(400, 'Request body 必須為非空陣列');
    }
    await Holding.batchUpsert(holdings);
    res.json(ApiResponse.success({ updated: holdings.length }));
  } catch (err) { next(err); }
};
