import { Request, Response } from 'express';
import { ApiResponse } from '../global/apiResponse';
import { apiSwitch } from '../global/apiSwitch';

/** GET /api/v1/system/datasource */
export const getDatasourceStatus = (_req: Request, res: Response) => {
  res.json(ApiResponse.success(apiSwitch.status()));
};
