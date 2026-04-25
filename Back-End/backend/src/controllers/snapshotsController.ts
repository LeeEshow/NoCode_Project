import { Request, Response, NextFunction } from 'express';
import { DailySnapshot, DailySnapshotInput } from '../models/DailySnapshot';
import { Holding } from '../models/Holding';
import { Stock } from '../models/Stock';
import { ForeignCurrency } from '../models/ForeignCurrency';
import { Bond } from '../models/Bond';
import { ApiResponse } from '../global/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getLiveRateMap } from '../global/rateHelper';

// ── 工具函式 ─────────────────────────────────────────────────────────────────

/** 將 Date 轉為台灣時間（UTC+8）的 YYYY-MM-DD 字串 */
function toTaiwanDateString(date: Date): string {
  const tw = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().slice(0, 10);
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/snapshots/record
 * 計算並寫入當日快照（冪等，同日重複呼叫只更新不重複寫）
 *
 * 並行策略：
 *   第一批 — holdings / currencies / bonds / prevSnapshot / rateMap 同時讀取
 *   第二批 — 各股報價（依賴 holdings 結果）
 */
export const record = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const today = toTaiwanDateString(new Date());

    // 第一批：所有獨立的 DB 讀取與匯率查詢並行執行
    const [holdings, currencies, bonds, prev, rateMap] = await Promise.all([
      Holding.findAll(),
      ForeignCurrency.findAll(),
      Bond.findAll(),
      DailySnapshot.findLatest(),
      getLiveRateMap(),
    ]);

    // 第二批：各股報價（依賴 holdings，單筆失敗不中斷）
    const priceResults = await Promise.allSettled(
      holdings.map(h => Stock.getQuote(h.stockId))
    );

    // 計算 stock_value / total_invested / realized_profit
    let stockValue     = 0;
    let totalInvested  = 0;
    let realizedProfit = 0;

    holdings.forEach((h, i) => {
      totalInvested  += h.totalCost;
      realizedProfit += h.realizedProfit;
      const r = priceResults[i];
      if (r.status === 'fulfilled') {
        stockValue += h.sharesHeld * 1000 * r.value.price; // sharesHeld 為張數，×1000 轉為股
      }
    });

    // 計算外幣 + 債券台幣合計
    let forexValue = 0;
    for (const c of currencies) {
      const rate = c.useManualRate ? c.manualRate : (rateMap[c.currencyCode] ?? null);
      if (rate !== null) forexValue += c.amount * rate;
    }
    for (const b of bonds) {
      const rate = rateMap[b.currency] ?? null;
      if (rate !== null) forexValue += b.faceValue * rate;
    }

    const unrealizedProfit = stockValue - totalInvested;
    const totalReturn      = unrealizedProfit + realizedProfit;
    const returnRate       = totalInvested > 0
      ? Math.round((totalReturn / totalInvested) * 1_000_000) / 1_000_000
      : 0;
    const cashBalance      = prev?.cashBalance ?? 0;

    // 寫入快照（merge，冪等）
    const data = await DailySnapshot.record({
      date:             today,
      totalInvested:    Math.round(totalInvested),
      stockValue:       Math.round(stockValue),
      cashBalance,
      forexValue:       Math.round(forexValue),
      unrealizedProfit: Math.round(unrealizedProfit),
      realizedProfit:   Math.round(realizedProfit),
      totalReturn:      Math.round(totalReturn),
      returnRate,
      note:             '',
    });

    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/snapshots
 * 取得所有快照（依日期降序）；支援 ?year=2025 篩選
 */
export const getAll = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const yearParam = req.query['year'];
    const year = yearParam ? parseInt(String(yearParam), 10) : undefined;
    if (yearParam && (isNaN(year!) || year! < 2000 || year! > 2100)) {
      throw new AppError(400, 'year 參數格式錯誤（例：?year=2025）');
    }
    const data = await DailySnapshot.findAll(year);
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/snapshots
 * 新增快照（前端計算完畢後送入，date 為文件 ID，重複則覆蓋）
 */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = req.body as Partial<DailySnapshotInput>;

    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      throw new AppError(400, 'date 為必填欄位，格式 YYYY-MM-DD');
    }
    const required: (keyof DailySnapshotInput)[] = [
      'totalInvested', 'stockValue', 'cashBalance',
      'forexValue', 'unrealizedProfit', 'realizedProfit', 'returnRate',
    ];
    for (const key of required) {
      if (body[key] == null) throw new AppError(400, `缺少必填欄位：${String(key)}`);
    }

    const data = await DailySnapshot.record({
      date:             body.date,
      totalInvested:    Number(body.totalInvested),
      stockValue:       Number(body.stockValue),
      cashBalance:      Number(body.cashBalance),
      forexValue:       Number(body.forexValue),
      unrealizedProfit: Number(body.unrealizedProfit),
      realizedProfit:   Number(body.realizedProfit),
      totalReturn:      Number(body.totalReturn ?? 0),
      returnRate:       Number(body.returnRate),
      note:             String(body.note ?? ''),
    });
    res.status(201).json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/snapshots?from=YYYY-MM-DD&to=YYYY-MM-DD
 * @deprecated 請改用 GET /api/v1/snapshots?year=
 */
export const getByRange = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const today = toTaiwanDateString(new Date());
    const from  = (req.query.from as string) ?? '2000-01-01';
    const to    = (req.query.to   as string) ?? today;

    const data = await DailySnapshot.findByRange(from, to);
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/snapshots/:date
 * 單日快照查詢
 */
export const getByDate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const date = String(req.params.date);
    const data = await DailySnapshot.findByDate(date);
    if (!data) throw new AppError(404, `快照不存在：${date}`);
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/snapshots/:date
 * 修正活存 / 備註
 */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const date                  = String(req.params.date);
    const { cashBalance, note } = req.body;

    if (cashBalance === undefined && note === undefined) {
      throw new AppError(400, '至少需提供 cashBalance 或 note 其中一個欄位');
    }

    const data = await DailySnapshot.update(date, {
      cashBalance: cashBalance !== undefined ? Number(cashBalance) : undefined,
      note:        note        !== undefined ? String(note)        : undefined,
    });

    if (!data) throw new AppError(404, `快照不存在：${date}`);
    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
};
