export const FEE_RATE      = 0.001425; // 手續費 0.1425%（買賣雙邊）
export const TAX_RATE      = 0.003;    // 證交稅 0.3%（僅賣出）
export const SLIPPAGE_RATE = 0.001;    // 滑價估算 0.1%

export const BUY_COST_RATE       = FEE_RATE + SLIPPAGE_RATE;
export const SELL_COST_RATE      = FEE_RATE + TAX_RATE + SLIPPAGE_RATE;
export const ROUNDTRIP_COST_RATE = BUY_COST_RATE + SELL_COST_RATE; // ~0.785%

/** 損益平衡價（買進後需漲多少才回本） */
export function computeBreakEvenPrice(entryPrice: number): number {
  return entryPrice * (1 + ROUNDTRIP_COST_RATE);
}

/** 扣除來回費用後的實際 R:R */
export function computeNetRiskReward(
  entryPrice: number,
  targetLow:  number,
  stopLoss:   number,
): number {
  const cost      = entryPrice * ROUNDTRIP_COST_RATE;
  const netReward = targetLow - entryPrice - cost;
  const netRisk   = entryPrice - stopLoss + cost;
  return netRisk > 0 ? netReward / netRisk : 0;
}

/** 交易效益標籤（與再平衡共用） */
export function computeTradeEfficiency(
  trancheAmount: number,
  totalAsset:    number,
): '建議交易' | '可觀察' | '效益不足' {
  const frac = trancheAmount / totalAsset;
  return frac > 0.01 ? '建議交易' : frac > 0.005 ? '可觀察' : '效益不足';
}
