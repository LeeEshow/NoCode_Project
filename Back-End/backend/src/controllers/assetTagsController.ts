import { Request, Response, NextFunction } from 'express';
import { AssetTag } from '../models/AssetTag';
import { Tag } from '../models/Tag';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { nodeCache } from '../global/cache';
import { StockSearchResult } from '../models/Stock';

function buildNameMap(): Map<string, string> {
  const list = nodeCache.get<StockSearchResult[]>('stocks:all-list');
  return new Map(list?.map(s => [s.stockId, s.name]) ?? []);
}

function toDTO(at: { id: string; stockCode: string; tagName: string; weightRatio: number }, nameMap: Map<string, string>) {
  return {
    id:          at.id,
    stockCode:   at.stockCode,
    stockName:   nameMap.get(at.stockCode) ?? null,
    tagName:     at.tagName,
    weightRatio: at.weightRatio,
  };
}

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stockCode = req.query.stockCode as string | undefined;
    const assetTags = await AssetTag.findAll(stockCode);
    const nameMap = buildNameMap();
    res.json(ApiResponse.success(assetTags.map(at => toDTO(at, nameMap))));
  } catch (err) { next(err); }
};

/** POST /holdings/:stockCode/tags — stockCode 來自 URL param */
export const createForHolding = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stockCode = String(req.params['stockCode']);
    const { tagName, weightRatio } = req.body;

    if (!tagName || typeof tagName !== 'string' || tagName.trim() === '') {
      throw new AppError(400, 'tagName 為必填欄位');
    }
    if (typeof weightRatio !== 'number' || weightRatio <= 0 || weightRatio > 100) {
      throw new AppError(400, 'weightRatio 必須為 0 < value ≤ 100 的數字');
    }
    if (!await Tag.findByName(tagName.trim())) {
      throw new AppError(400, `Tag "${tagName.trim()}" 不存在`);
    }

    const created = await AssetTag.create({ stockCode, tagName: tagName.trim(), weightRatio });
    res.status(201).json(ApiResponse.success(toDTO(created, buildNameMap())));
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stockCode, tagName, weightRatio } = req.body;

    if (!stockCode || typeof stockCode !== 'string' || stockCode.trim() === '') {
      throw new AppError(400, 'stockCode 為必填欄位');
    }
    if (!tagName || typeof tagName !== 'string' || tagName.trim() === '') {
      throw new AppError(400, 'tagName 為必填欄位');
    }
    if (typeof weightRatio !== 'number' || weightRatio <= 0 || weightRatio > 100) {
      throw new AppError(400, 'weightRatio 必須為 0 < value ≤ 100 的數字');
    }

    if (!await Tag.findByName(tagName.trim())) {
      throw new AppError(400, `Tag "${tagName.trim()}" 不存在`);
    }

    const created = await AssetTag.create({
      stockCode: stockCode.trim(),
      tagName: tagName.trim(),
      weightRatio,
    });
    res.status(201).json(ApiResponse.success(toDTO(created, buildNameMap())));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params['id']);
    const { weightRatio } = req.body;

    if (typeof weightRatio !== 'number' || weightRatio <= 0 || weightRatio > 100) {
      throw new AppError(400, 'weightRatio 必須為 0 < value ≤ 100 的數字');
    }

    const updated = await AssetTag.update(id, weightRatio);
    if (!updated) throw new AppError(404, 'AssetTag 不存在');
    res.json(ApiResponse.success(toDTO(updated, buildNameMap())));
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params['id']);
    const deleted = await AssetTag.delete(id);
    if (!deleted) throw new AppError(404, 'AssetTag 不存在');
    res.json(ApiResponse.success({ deleted: id }));
  } catch (err) { next(err); }
};
