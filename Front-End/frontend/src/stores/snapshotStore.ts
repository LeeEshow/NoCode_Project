import { create } from 'zustand';
import { fetchSnapshot, updateSnapshot, createSnapshot } from '../models/snapshotModel';

const today = () => new Date().toISOString().slice(0, 10);

interface SnapshotState {
  cashBalance: number;
  loaded:      boolean;
  load:        () => Promise<void>;
  update:      (cashBalance: number) => Promise<void>;
}

export const useSnapshotStore = create<SnapshotState>((set) => ({
  cashBalance: 0,
  loaded: false,

  async load() {
    try {
      const snap = await fetchSnapshot(today());
      set({ cashBalance: snap.cashBalance, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  async update(cashBalance) {
    set({ cashBalance });
    const date = today();
    try {
      await updateSnapshot(date, { cashBalance });
    } catch {
      /* 今日尚無快照 → 建立一筆 */
      try {
        await createSnapshot({
          date,
          cashBalance,
          totalInvested: 0,
          stockValue:    0,
          forexValue:    0,
          unrealizedProfit: 0,
          realizedProfit:   0,
          returnRate:       0,
        });
      } catch { /* silent */ }
    }
  },
}));
