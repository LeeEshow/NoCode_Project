import { Request, Response, NextFunction } from 'express';
import { Stock } from '../models/Stock';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getOrSet } from '../global/cache';

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
      () => Stock.getQuote(id),
      60 // TTL 60s
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
    const data = await Stock.getHistory(id, days);
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
      300 // TTL 5min
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};
