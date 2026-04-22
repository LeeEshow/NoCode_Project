import { Request, Response, NextFunction } from 'express';
import { Settings } from '../models/Settings';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

export const getSettings = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await Settings.find();
    // 若尚未建立，回傳預設值
    if (!data) {
      res.json(ApiResponse.success({ costMethod: 'preserve_method', updatedAt: null }));
      return;
    }
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const updateSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { costMethod } = req.body;
    if (!costMethod) throw new AppError(400, '缺少必填欄位：costMethod');
    if (!['preserve_method', 'return_method'].includes(costMethod)) {
      throw new AppError(400, 'costMethod 必須為 preserve_method 或 return_method');
    }
    const data = await Settings.upsert({ costMethod });
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};
