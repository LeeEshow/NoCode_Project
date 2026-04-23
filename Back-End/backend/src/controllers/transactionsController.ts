import { Request, Response, NextFunction } from 'express';
import { Transaction } from '../models/Transaction';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stockId = typeof req.query['stock_id'] === 'string' ? req.query['stock_id'] : undefined;
    const data = await Transaction.findAll(stockId);
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await Transaction.findById(String(req.params.id));
    if (!data) throw new AppError(404, '交易紀錄不存在');
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stockId, type, date, shares, pricePerShare, fee, note } = req.body;
    if (!stockId || !type || !date || shares == null || pricePerShare == null || fee == null) {
      throw new AppError(400, '缺少必填欄位：stockId / type / date / shares / pricePerShare / fee');
    }
    const data = await Transaction.create({ stockId, type, date, shares, pricePerShare, fee, note });
    res.status(201).json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await Transaction.update(String(req.params.id), req.body);
    if (!data) throw new AppError(404, '交易紀錄不存在');
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await Transaction.delete(String(req.params.id));
    if (!deleted) throw new AppError(404, '交易紀錄不存在');
    res.status(204).send();
  } catch (err) { next(err); }
};
