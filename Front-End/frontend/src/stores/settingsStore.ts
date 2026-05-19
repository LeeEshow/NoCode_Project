import { create } from 'zustand';
import { fetchSettings, updateSettings } from '../models/settingsModel';

interface SettingsState {
  aiReportEnabled: boolean;
  loaded:          boolean;
  load:            () => Promise<void>;
  setAiReportEnabled: (value: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  aiReportEnabled: false,
  loaded: false,

  async load() {
    if (get().loaded) return;
    try {
      const s = await fetchSettings();
      set({ aiReportEnabled: s.aiReportEnabled ?? false, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  async setAiReportEnabled(value) {
    set({ aiReportEnabled: value });
    try {
      await updateSettings({ aiReportEnabled: value });
    } catch {
      set({ aiReportEnabled: !value });
    }
  },
}));
