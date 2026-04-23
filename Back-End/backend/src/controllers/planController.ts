import { Request, Response, NextFunction } from 'express';
import { InvestmentPlan } from '../models/InvestmentPlan';
import { YearlyRecord } from '../models/YearlyRecord';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

// P1-11 ─ 投報計畫
export const getPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assetType = typeof req.query['asset_type'] === 'string' ? req.query['asset_type'] : 'tw_stock';
    const data = await InvestmentPlan.find(assetType);
    if (!data) throw new AppError(404, '投報計畫不存在，請先建立');
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const updatePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      assetType = 'tw_stock',
      annualInvest,
      rBase,
      piBase,
      piShock,
      inflationScenario,
      kRisk,
      startYear,
      planYears,
    } = req.body;

    if (
      annualInvest == null || rBase == null || piBase == null ||
      piShock == null || !inflationScenario || kRisk == null ||
      startYear == null || planYears == null
    ) {
      throw new AppError(400, '缺少必填欄位');
    }

    const data = await InvestmentPlan.upsert({
      assetType, annualInvest, rBase, piBase, piShock,
      inflationScenario, kRisk, startYear, planYears,
    });
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

// P1-12 ─ 年度結算
export const getYearlyRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assetType = typeof req.query['asset_type'] === 'string' ? req.query['asset_type'] : 'tw_stock';
    const data = await YearlyRecord.findAll(assetType);
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const createYearlyRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      assetType = 'tw_stock',
      year,
      prevYearTotal,
      amountInvested,
      stockValue,
      cashBalance,
      foreignValueTwd,
      returnAmount,
      returnRate,
      settledAt,
      note,
    } = req.body;

    if (year == null || prevYearTotal == null || amountInvested == null ||
        stockValue == null || cashBalance == null || foreignValueTwd == null ||
        returnAmount == null || returnRate == null || !settledAt) {
      throw new AppError(400, '缺少必填欄位');
    }

    const existing = await YearlyRecord.findByYear(assetType, year);
    if (existing) throw new AppError(409, `${assetType}_${year} 年度結算已存在`);

    const data = await YearlyRecord.create({
      assetType, year, prevYearTotal, amountInvested,
      stockValue, cashBalance, foreignValueTwd,
      returnAmount, returnRate, settledAt, note,
    });
    res.status(201).json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const updateYearlyRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = parseInt(String(req.params.year), 10);
    const assetType = typeof req.query['asset_type'] === 'string' ? req.query['asset_type'] : 'tw_stock';
    if (isNaN(year)) throw new AppError(400, 'year 必須為數字');

    const data = await YearlyRecord.update(assetType, year, req.body);
    if (!data) throw new AppError(404, '年度結算不存在');
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};
