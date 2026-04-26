import { Request, Response, NextFunction } from 'express';
import { Preferences } from '../models/Preferences';
import { ApiResponse } from '../global/apiResponse';

export const getPreferences = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await Preferences.find();
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};

export const updatePreferences = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await Preferences.merge(req.body);
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
};
