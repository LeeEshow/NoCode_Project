import { Request, Response, NextFunction } from 'express';
import { MarketIndex } from '../models/MarketIndex';
import { ApiResponse } from '../global/apiResponse';
import { getOrSet } from '../global/cache';

/** GET /api/v1/market/indices */
export const getIndices = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getOrSet(
      'market:indices',
      () => MarketIndex.fetchAll(),
      60 // TTL 60s
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
      300 // TTL 300s
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
      3600 // TTL 1hr
    );
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};
