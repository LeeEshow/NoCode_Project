import { Request, Response, NextFunction } from 'express';
import { MarketIndex } from '../models/MarketIndex';
import { ApiResponse } from '../global/apiResponse';
import { getOrSet } from '../global/cache';
import { apiSwitch } from '../global/apiSwitch';

/** GET /api/v1/market/indices */
export const getIndices = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getOrSet(
      'market:indices',
      () => apiSwitch.call(
        () => MarketIndex.fetchAllWithShioaji(),
        () => MarketIndex.fetchAll(),
      ),
      5
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/market/forex-rates */
export const getForexRates = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getOrSet(
      'market:forex-rates',
      () => MarketIndex.fetchForexRates(),
      300
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** GET /api/v1/market/export-indicator */
export const getExportIndicator = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getOrSet(
      'market:export-indicator',
      () => MarketIndex.fetchExportIndicator(),
      3600
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};
