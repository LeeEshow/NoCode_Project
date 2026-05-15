import { Request, Response, NextFunction } from 'express';
import { Tag, TagInput, MarketStatePresets } from '../models/Tag';
import { AssetTag } from '../models/AssetTag';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { MarketStateName } from '../models/MarketState';
import { recalculateDynamicRisk } from '../services/tagRiskService';

function validatePresets(presets: unknown): Partial<MarketStatePresets> {
  if (presets == null || typeof presets !== 'object') {
    throw new AppError(400, 'marketStatePresets 必須為物件');
  }
  const p = presets as Record<string, unknown>;
  for (const key of ['riskOn', 'riskOff', 'liquidityDry']) {
    const val = p[key];
    if (val != null && (typeof val !== 'number' || val < 0 || val > 3)) {
      throw new AppError(400, `marketStatePresets.${key} 必須為 0 ≤ value ≤ 3 的數字`);
    }
  }
  return {
    riskOn:       typeof p['riskOn']       === 'number' ? p['riskOn']       : null,
    riskOff:      typeof p['riskOff']      === 'number' ? p['riskOff']      : null,
    liquidityDry: typeof p['liquidityDry'] === 'number' ? p['liquidityDry'] : null,
  };
}

export const getAll = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ApiResponse.success(await Tag.findAll()));
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, baseRisk, targetWeight, fallbackBehavior, marketStatePresets } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new AppError(400, 'name 為必填欄位');
    }
    if (typeof baseRisk !== 'number' || baseRisk < 0 || baseRisk > 3) {
      throw new AppError(400, 'baseRisk 必須為 0 ≤ value ≤ 3 的數字');
    }
    if (targetWeight != null && (typeof targetWeight !== 'number' || targetWeight <= 0 || targetWeight > 100)) {
      throw new AppError(400, 'targetWeight 必須為 0 < value ≤ 100 的數字');
    }
    if (fallbackBehavior != null && !['hold', 'exclude'].includes(fallbackBehavior)) {
      throw new AppError(400, 'fallbackBehavior 必須為 "hold" 或 "exclude"');
    }

    let parsedPresets: Partial<MarketStatePresets> | null = null;
    if (marketStatePresets != null) parsedPresets = validatePresets(marketStatePresets);

    if (await Tag.findByName(name.trim())) {
      throw new AppError(400, `Tag "${name.trim()}" 已存在`);
    }

    const tag = await Tag.create({
      name: name.trim(),
      baseRisk,
      targetWeight:       targetWeight ?? null,
      fallbackBehavior:   fallbackBehavior ?? 'hold',
      marketStatePresets: parsedPresets,
    });
    res.status(201).json(ApiResponse.success(tag));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params['id']);
    const { name, baseRisk, targetWeight, fallbackBehavior, marketStatePresets } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        throw new AppError(400, 'name 不可為空字串');
      }
      const existing = await Tag.findByName(name.trim());
      if (existing && existing.id !== id) {
        throw new AppError(400, `Tag "${name.trim()}" 已存在`);
      }
    }
    if (baseRisk !== undefined && (typeof baseRisk !== 'number' || baseRisk < 0 || baseRisk > 3)) {
      throw new AppError(400, 'baseRisk 必須為 0 ≤ value ≤ 3 的數字');
    }
    if (targetWeight != null && (typeof targetWeight !== 'number' || targetWeight <= 0 || targetWeight > 100)) {
      throw new AppError(400, 'targetWeight 必須為 0 < value ≤ 100 的數字');
    }
    if (fallbackBehavior != null && !['hold', 'exclude'].includes(fallbackBehavior)) {
      throw new AppError(400, 'fallbackBehavior 必須為 "hold" 或 "exclude"');
    }

    const input: Partial<TagInput> = {};
    if (name              !== undefined) input.name              = name.trim();
    if (baseRisk          !== undefined) input.baseRisk          = baseRisk;
    if ('targetWeight'    in req.body)   input.targetWeight      = targetWeight ?? null;
    if ('fallbackBehavior' in req.body)  input.fallbackBehavior  = fallbackBehavior ?? null;
    if ('marketStatePresets' in req.body) {
      input.marketStatePresets = marketStatePresets != null
        ? validatePresets(marketStatePresets)
        : null;
    }

    const updated = await Tag.update(id, input);
    if (!updated) throw new AppError(404, 'Tag 不存在');
    res.json(ApiResponse.success(updated));
  } catch (err) { next(err); }
};

export const recalculateDynamic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { marketState } = req.body;
    const valid: MarketStateName[] = ['neutral', 'risk-on', 'risk-off', 'liquidity-dry'];
    if (!valid.includes(marketState)) {
      throw new AppError(400, 'marketState 必須為 neutral / risk-on / risk-off / liquidity-dry');
    }
    const result = await recalculateDynamicRisk(marketState as MarketStateName);
    res.json(ApiResponse.success({ success: true, ...result }));
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params['id']);
    const tag = await Tag.findById(id);
    if (!tag) throw new AppError(404, 'Tag 不存在');

    const refs = await AssetTag.findByTagName(tag.name);
    if (refs.length > 0) {
      throw new AppError(400, '此 Tag 仍有股票對應，請先移除對應後再刪除');
    }

    await Tag.delete(id);
    res.json(ApiResponse.success({ deleted: id }));
  } catch (err) { next(err); }
};
