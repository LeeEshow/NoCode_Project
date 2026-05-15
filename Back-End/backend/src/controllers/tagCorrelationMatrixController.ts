import { Request, Response, NextFunction } from 'express';
import { TagCorrelationMatrix, CorrelationEntry } from '../models/TagCorrelationMatrix';
import { Tag } from '../models/Tag';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

export const get = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ApiResponse.success(await TagCorrelationMatrix.find()));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      throw new AppError(400, 'entries 必須為陣列');
    }

    const tags = await Tag.findAll();
    const tagNames = new Set(tags.map(t => t.name));

    for (const entry of entries) {
      const { tagA, tagB, rho } = entry as Partial<CorrelationEntry>;
      if (!tagA || !tagB) {
        throw new AppError(400, 'entries 中每筆須包含 tagA、tagB 欄位');
      }
      if (tagA === tagB) {
        throw new AppError(400, `tagA 與 tagB 不可相同（${tagA}）`);
      }
      if (!tagNames.has(tagA)) {
        throw new AppError(400, `Tag '${tagA}' 不存在`);
      }
      if (!tagNames.has(tagB)) {
        throw new AppError(400, `Tag '${tagB}' 不存在`);
      }
      if (typeof rho !== 'number' || rho < -1 || rho > 1) {
        throw new AppError(400, `rho 必須為 −1 ≤ value ≤ 1 的數字（${tagA}-${tagB}）`);
      }
    }

    const result = await TagCorrelationMatrix.upsert(entries as CorrelationEntry[]);
    res.json(ApiResponse.success(result));
  } catch (err) { next(err); }
};
