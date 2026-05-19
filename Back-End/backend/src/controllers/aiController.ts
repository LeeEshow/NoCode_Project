import { Request, Response, NextFunction } from 'express';
import { AiReport } from '../models/AiReport';
import { Settings } from '../models/Settings';
import { generate } from '../services/aiReportService';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

export const generateDailyReport = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await Settings.find();
    if (!settings?.aiReportEnabled) {
      res.json(ApiResponse.success({ skipped: true, reason: 'AI 早報功能未啟用' }));
      return;
    }
    const data = await generate();
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const getLatestDailyReport = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await AiReport.findLatest();
    if (!data) throw new AppError(404, '尚無每日早報');
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const getDailyReportByDate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = String(req.params['date']);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'date 格式錯誤，應為 YYYY-MM-DD');
    }
    const data = await AiReport.findByDate(date);
    if (!data) throw new AppError(404, `找不到 ${date} 的報告`);
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};
