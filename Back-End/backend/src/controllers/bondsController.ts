import { Request, Response, NextFunction } from 'express';
import { Bond } from '../models/Bond';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getLiveRateMap } from '../global/rateHelper';

/** GET /api/v1/bonds */
export const getAll = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const [bonds, rateMap] = await Promise.all([
      Bond.findAll(),
      getLiveRateMap(),
    ]);

    const data = bonds.map(b => {
      const rate        = rateMap[b.currency] ?? null;
      const twdEstimate = rate !== null ? +(b.faceValue * rate).toFixed(0) : null;
      return { ...b, twdEstimate };
    });

    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** POST /api/v1/bonds */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, couponRate, maturityDate, currency, faceValue, note } = req.body;

    if (!name || couponRate == null || !maturityDate || !currency || faceValue == null) {
      throw new AppError(400, '缺少必填欄位：name / couponRate / maturityDate / currency / faceValue');
    }

    const data = await Bond.create({
      name,
      couponRate:   Number(couponRate),
      maturityDate: String(maturityDate),
      currency:     String(currency),
      faceValue:    Number(faceValue),
      note:         note ?? '',
    });

    res.status(201).json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** PUT /api/v1/bonds/:id */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id }  = req.params;
    const { name, couponRate, maturityDate, currency, faceValue, note } = req.body;

    const patch: Parameters<typeof Bond.update>[1] = {};
    if (name          !== undefined) patch.name         = name;
    if (couponRate    !== undefined) patch.couponRate    = Number(couponRate);
    if (maturityDate  !== undefined) patch.maturityDate  = String(maturityDate);
    if (currency      !== undefined) patch.currency      = String(currency);
    if (faceValue     !== undefined) patch.faceValue     = Number(faceValue);
    if (note          !== undefined) patch.note          = note;

    const data = await Bond.update(String(id), patch);
    if (!data) throw new AppError(404, `債券不存在：${id}`);

    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/v1/bonds/:id */
export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id      = String(req.params.id);
    const deleted = await Bond.delete(id);
    if (!deleted) throw new AppError(404, `債券不存在：${id}`);
    res.json(ApiResponse.success({ deleted: id }));
  } catch (err) {
    next(err);
  }
};
