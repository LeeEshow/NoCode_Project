import { Request, Response, NextFunction } from 'express';
import { RebalanceRule } from '../models/RebalanceRule';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

export const get = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ApiResponse.success(await RebalanceRule.find()));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baseThreshold, volatilityFactor, liquidityCapRatio, advLookbackDays, concentrationLimit } = req.body;

    if (typeof baseThreshold !== 'number' || baseThreshold <= 0 || baseThreshold >= 1) {
      throw new AppError(400, 'baseThreshold 必須為 0 < value < 1 的數字');
    }
    if (typeof volatilityFactor !== 'number' || volatilityFactor <= 0) {
      throw new AppError(400, 'volatilityFactor 必須為正數');
    }
    if (typeof liquidityCapRatio !== 'number' || liquidityCapRatio <= 0 || liquidityCapRatio > 1) {
      throw new AppError(400, 'liquidityCapRatio 必須為 0 < value ≤ 1 的數字');
    }

    const current = await RebalanceRule.find();

    let resolvedAdvLookbackDays = current.advLookbackDays;
    if (advLookbackDays !== undefined) {
      if (!Number.isInteger(advLookbackDays) || advLookbackDays < 5 || advLookbackDays > 60) {
        throw new AppError(400, 'advLookbackDays 必須為 5 ≤ value ≤ 60 的整數');
      }
      resolvedAdvLookbackDays = advLookbackDays;
    }

    let resolvedConcentrationLimit = current.concentrationLimit;
    if (concentrationLimit !== undefined) {
      if (typeof concentrationLimit !== 'number' || concentrationLimit < 0.50 || concentrationLimit > 0.95) {
        throw new AppError(400, 'concentrationLimit 必須為 0.50 ≤ value ≤ 0.95 的數字');
      }
      resolvedConcentrationLimit = concentrationLimit;
    }

    const result = await RebalanceRule.upsert({
      baseThreshold,
      volatilityFactor,
      liquidityCapRatio,
      advLookbackDays:   resolvedAdvLookbackDays,
      concentrationLimit: resolvedConcentrationLimit,
    });
    res.json(ApiResponse.success(result));
  } catch (err) { next(err); }
};
