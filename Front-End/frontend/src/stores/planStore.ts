import { create } from 'zustand';

interface PlanStoreState {
  currentYearReturnPct:   number | null;
  currentYearReturnValue: number | null;
  loaded: boolean;
}

export const usePlanStore = create<PlanStoreState>(() => ({
  currentYearReturnPct:   null,
  currentYearReturnValue: null,
  loaded: false,
}));
