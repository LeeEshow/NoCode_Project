import { create } from 'zustand';

interface PlanStoreState {
  execCapital:      number;
  reinvest:         number;
  forexValue:       number;
  liveStockValue:   number;
  loaded:           boolean;
  updateStockValue: (value: number) => void;
}

export const usePlanStore = create<PlanStoreState>(set => ({
  execCapital:      0,
  reinvest:         0,
  forexValue:       0,
  liveStockValue:   0,
  loaded:           false,
  updateStockValue: (value) => set({ liveStockValue: value }),
}));
