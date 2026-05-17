import { Request, Response, NextFunction } from 'express';
import { Stock } from '../models/Stock';
import { StockList } from '../models/StockList';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getOrSet, nodeCache } from '../global/cache';
import { apiSwitch } from '../global/apiSwitch';
import { sjGetStockQuote, sjGetStockHistory, sjGetAllStocks } from '../global/shioajiClient';

/**
 * POST /api/v1/stocks/list/refresh
 * 從 Shioaji 同步全股清單 → 寫入 Firestore，並清除搜尋快取
 */
export const listRefresh = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!process.env['SHIOAJI_API_URL']) {
      throw new AppError(400, '未設定 SHIOAJI_API_URL，此端點需要 Shioaji 服務');
    }
    const raw   = await sjGetAllStocks();
    const items = raw
      .filter(s =>
        /^\d{4}$/.test(s.code) ||   // 一般上市/上櫃股票（4 位純數字）
        /^00/.test(s.code)           // ETF（0050、00878、006208、00631L 等）
      )
      .map(s => ({
        code:   s.code,
        name:   s.name,
        market: (s.exchange === 'OTC' ? 'OTC' : 'TSE') as 'TSE' | 'OTC',
      }));
    const result = await StockList.upsertAll(items);
    nodeCache.del('stocks:all-list'); // 清快取，下次搜尋從 DB 重新載入
    res.json(ApiResponse.success(result));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/stocks/list/meta
 * 查詢 DB 中全股清單的 meta 資訊（不打 Shioaji）
 */
export const listMeta = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await StockList.getMeta();
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/stocks/search?q={keyword} */
export const search = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const q = String(req.query['q'] ?? '').trim();
    if (!q) throw new AppError(400, '請提供搜尋關鍵字 ?q=');
    const data = await Stock.search(q);
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/stocks/:id/quote */
export const getQuote = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params['id']);
    const data = await getOrSet(
      `stock:quote:${id}`,
      () => apiSwitch.call(
        () => sjGetStockQuote(id),
        () => Stock.getQuote(id),
      ),
      60
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/stocks/:id/history?days=90 */
export const getHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id   = String(req.params['id']);
    const days = Math.min(
      365,
      Math.max(1, parseInt(String(req.query['days'] ?? '90'), 10))
    );
    const data = await apiSwitch.call(
      () => sjGetStockHistory(id, days),
      () => Stock.getHistory(id, days),
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/stocks/:id/chip */
export const getChip = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params['id']);
    const data = await getOrSet(
      `stock:chip:${id}`,
      () => Stock.getChip(id),
      300
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/stocks/:id/profile */
export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params['id']);
    const data = await getOrSet(
      `stock:profile:${id}`,
      () => Stock.getProfile(id),
      300
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};
