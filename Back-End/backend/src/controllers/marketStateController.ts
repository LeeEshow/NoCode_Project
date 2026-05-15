import { Request, Response, NextFunction } from 'express';
import { MarketState, MarketStateName } from '../models/MarketState';
import { Tag } from '../models/Tag';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';

const VALID_STATES: MarketStateName[] = ['neutral', 'risk-on', 'risk-off', 'liquidity-dry'];

export const get = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ApiResponse.success(await MarketState.find()));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { state } = req.body as { state: unknown };

    if (!VALID_STATES.includes(state as MarketStateName)) {
      throw new AppError(400, `state 必須為：${VALID_STATES.join(' | ')}`);
    }

    const marketState = state as MarketStateName;
    const tags = await Tag.findAll();

    const updates = tags.map(tag => {
      const presets = tag.marketStatePresets;
      let dynamicRisk: number;

      switch (marketState) {
        case 'risk-on':
          dynamicRisk = presets?.riskOn       ?? tag.baseRisk; break;
        case 'risk-off':
          dynamicRisk = presets?.riskOff      ?? tag.baseRisk; break;
        case 'liquidity-dry':
          dynamicRisk = presets?.liquidityDry ?? tag.baseRisk; break;
        default:
          dynamicRisk = tag.baseRisk;
      }

      return { id: tag.id, dynamicRisk };
    });

    await Tag.batchUpdateDynamicRisk(updates);
    await MarketState.set(marketState);

    res.json(ApiResponse.success({ state: marketState, updatedTags: tags.length }));
  } catch (err) { next(err); }
};
