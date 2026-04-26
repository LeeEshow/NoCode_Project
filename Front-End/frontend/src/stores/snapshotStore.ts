import { create } from 'zustand';
import { fetchSnapshot, fetchSnapshots, updateSnapshot, createSnapshot } from '../models/snapshotModel';
import { toast } from '../views/components/Toast/toastStore';

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
      /* 今日尚無快照 → 用今年最近一筆的 cashBalance 作 fallback */
      toast.error(`查無 ${today()} 的快照紀錄，流動資金顯示上次記錄值`);
      try {
        const year = new Date().getFullYear();
        const snaps = await fetchSnapshots(year);
        const latest = snaps
          .filter(s => s.date < today())
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        set({ cashBalance: latest?.cashBalance ?? 0, loaded: true });
      } catch {
        set({ loaded: true });
      }
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
