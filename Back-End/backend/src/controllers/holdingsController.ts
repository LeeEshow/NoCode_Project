import { Request, Response, NextFunction } from 'express';
import { Holding, HoldingInput } from '../models/Holding';
import { Stock, StockSearchResult } from '../models/Stock';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { apiSwitch } from '../global/apiSwitch';
import { sjGetStockQuote } from '../global/shioajiClient';
import { nodeCache } from '../global/cache';

/**
 * GET /api/v1/holdings/prices
 * 輕量即時價格端點（供前端 5 秒輪詢使用）
 * 只回傳有持股的股票即時價格與未實現損益，不重查持股成本結構
 */
export const getPrices = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const holdings = await Holding.findAll();
    const active   = holdings.filter(h => h.sharesHeld > 0);

    const priceResults = await Promise.allSettled(
      active.map(h =>
        apiSwitch.call(
          () => sjGetStockQuote(h.stockId),
          () => Stock.getQuote(h.stockId),
        )
      )
    );

    const data = active
      .map((h, i) => {
        const r = priceResults[i];
        if (r.status === 'rejected') return null;
        const q = r.value;
        return {
          stockCode:        h.stockId,
          currentPrice:     q.price,
          change:           q.change,
          changePct:        q.changePercent,
          unrealizedProfit: Math.round(q.price * h.sharesHeld - h.totalCost),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const getAll = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const holdings = await Holding.findAll();

    // stockName 已由 recalculate 寫入 Firestore，此處只需對有持股的品項補抓即時報價
    const withPrices = await Promise.all(
      holdings.map(async h => {
        if (h.sharesHeld <= 0) return h;
        try {
          const quote = await Stock.getQuote(h.stockId);
          h.stockName     = quote.name;
          h.currentPrice  = quote.price;
          h.change        = quote.change;
          h.changePercent = quote.changePercent;
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

    // 從 NodeCache peek 全股名稱（不觸發 fetch），在寫入時一併存 stock_name
    const list = nodeCache.get<StockSearchResult[]>('stocks:all-list');
    const nameMap = new Map(list?.map(s => [s.stockId, s.name]) ?? []);
    const enriched = holdings.map(h => ({
      ...h,
      stockName: h.stockName || nameMap.get(h.stockId) || undefined,
    }));

    await Holding.batchUpsert(enriched);
    res.json(ApiResponse.success({ updated: enriched.length }));
  } catch (err) { next(err); }
};
