import { Request, Response, NextFunction } from 'express';
import { Watchlist } from '../models/Watchlist';
import { Stock } from '../models/Stock';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

/**
 * GET /api/v1/watchlist
 * 取得所有關注股票，注入即時報價與「判斷」欄
 * 判斷邏輯：即時報價 ≤ 目標價 → 買進；否則 → 觀望
 */
export const getAll = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const items = await Watchlist.findAll();

    const priceResults = await Promise.allSettled(
      items.map(item => Stock.getQuote(item.stockId))
    );

    const data = items.map((item, i) => {
      const r             = priceResults[i];
      const livePrice     = r.status === 'fulfilled' ? r.value.price         : null;
      const change        = r.status === 'fulfilled' ? r.value.change        : null;
      const changePercent = r.status === 'fulfilled' ? r.value.changePercent : null;
      // 優先使用 DB 儲存的名稱（建立時前端傳入），報價成功時以最新名稱覆蓋
      const stockName     = r.status === 'fulfilled' ? r.value.name : (item.stockName || item.stockId);
      const judgment      = livePrice !== null
        ? (livePrice <= item.targetPrice ? '買進' : '觀望')
        : null;

      return { ...item, livePrice, change, changePercent, stockName, judgment };
    });

    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/watchlist
 * 新增關注股票（同一股票代號已存在時回傳 409）
 */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { stockId, stockName, targetPrice, note } = req.body;

    if (!stockId || targetPrice == null) {
      throw new AppError(400, '缺少必填欄位：stockId / targetPrice');
    }

    const data = await Watchlist.create({
      stockId:     String(stockId),
      stockName:   stockName ? String(stockName) : undefined,
      targetPrice: Number(targetPrice),
      note:        note ?? '',
    });

    if (!data) throw new AppError(409, `關注清單已存在：${stockId}`);
    res.status(201).json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/watchlist/:stockId
 * 更新目標價 / 備註
 */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const stockId               = String(req.params.stockId);
    const { targetPrice, note } = req.body;

    if (targetPrice === undefined && note === undefined) {
      throw new AppError(400, '至少需提供 targetPrice 或 note 其中一個欄位');
    }

    const data = await Watchlist.update(stockId, {
      targetPrice: targetPrice !== undefined ? Number(targetPrice) : undefined,
      note:        note        !== undefined ? String(note)        : undefined,
    });

    if (!data) throw new AppError(404, `關注清單不存在：${stockId}`);
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/watchlist/reorder
 * 批次更新關注清單排序（order = stockId 陣列，index 即新順序）
 */
export const reorder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      throw new AppError(400, 'order 必須為非空字串陣列');
    }
    await Watchlist.reorder(order.map(String));
    res.json(ApiResponse.success({ reordered: order.length }));
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/watchlist/:stockId
 * 移除關注股票
 */
export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const stockId = String(req.params.stockId);
    const deleted = await Watchlist.delete(stockId);
    if (!deleted) throw new AppError(404, `關注清單不存在：${stockId}`);
    res.json(ApiResponse.success({ deleted: stockId }));
  } catch (err) {
    next(err);
  }
};
