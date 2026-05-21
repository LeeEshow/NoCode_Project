import { create } from 'zustand';
import type { MarketState } from '../types';
import { fetchSnapshot, fetchSnapshots, updateSnapshot, triggerSnapshotRecord } from '../models/snapshotModel';

const today = () => new Date().toISOString().slice(0, 10);

interface SnapshotState {
  cashBalance:     number;
  vix:             number | null;
  marketStateAuto: MarketState | null;
  loaded:          boolean;
  load:            () => Promise<void>;
  update:          (cashBalance: number) => Promise<void>;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  cashBalance:     0,
  vix:             null,
  marketStateAuto: null,
  loaded:          false,

  async load() {
    if (get().loaded) return;
    try {
      const snap = await fetchSnapshot(today());
      set({
        cashBalance:     snap.cashBalance,
        vix:             snap.vix ?? null,
        marketStateAuto: snap.marketStateAuto ?? null,
        loaded:          true,
      });
    } catch {
      /* 今日快照尚未建立（14:00 前為正常狀態），靜默 fallback 至最近一筆 */
      try {
        const year = new Date().getFullYear();
        const snaps = await fetchSnapshots(year);
        const latest = snaps
          .filter(s => s.date < today())
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        set({
          cashBalance:     latest?.cashBalance ?? 0,
          vix:             latest?.vix ?? null,
          marketStateAuto: latest?.marketStateAuto ?? null,
          loaded:          true,
        });
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
      try {
        await triggerSnapshotRecord();
        await updateSnapshot(date, { cashBalance });
      } catch { /* silent */ }
    }
  },
}));
