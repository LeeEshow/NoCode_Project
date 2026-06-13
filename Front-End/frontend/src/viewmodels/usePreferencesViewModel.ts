import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPreferences, updatePreferences } from '../models/preferencesModel';
import type { UserPreferences, ChartPreferences, ExpandTab } from '../types';
import { DEFAULT_PREFERENCES } from '../types';

const LS_KEY = 'user_preferences';

function mergeWithDefaults(raw: Partial<UserPreferences>): UserPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...raw,
    chart: { ...DEFAULT_PREFERENCES.chart, ...(raw.chart ?? {}) },
  };
}

function loadFromStorage(): UserPreferences {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function saveToStorage(prefs: UserPreferences) {
  localStorage.setItem(LS_KEY, JSON.stringify(prefs));
}

export function usePreferencesViewModel() {
  const [prefs, setPrefs] = useState<UserPreferences>(loadFromStorage);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchPreferences()
      .then(data => {
        const merged = mergeWithDefaults(data);
        setPrefs(merged);
        saveToStorage(merged);
      })
      .catch(() => { /* 後端未就緒時靜默，保留 localStorage 值 */ })
      .finally(() => setLoaded(true));
  }, []);

  const setChartPref = useCallback((patch: Partial<ChartPreferences>) => {
    setPrefs(prev => {
      const next: UserPreferences = { ...prev, chart: { ...prev.chart, ...patch } };
      saveToStorage(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updatePreferences(next).catch(() => {});
      }, 500);
      return next;
    });
  }, []);

  const setExpandTab = useCallback((tab: ExpandTab) => {
    setPrefs(prev => {
      const next: UserPreferences = { ...prev, expandTab: tab };
      saveToStorage(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updatePreferences(next).catch(() => {});
      }, 500);
      return next;
    });
  }, []);

  const setWlCollapsedGroups = useCallback((groups: string[]) => {
    setPrefs(prev => {
      const next: UserPreferences = { ...prev, wlCollapsedGroups: groups };
      saveToStorage(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updatePreferences(next).catch(() => {});
      }, 500);
      return next;
    });
  }, []);

  const setWlViewMode = useCallback((mode: 'table' | 'card') => {
    setPrefs(prev => {
      const next: UserPreferences = { ...prev, wlViewMode: mode };
      saveToStorage(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updatePreferences(next).catch(() => {});
      }, 500);
      return next;
    });
  }, []);

  return { prefs, loaded, setChartPref, setExpandTab, setWlCollapsedGroups, setWlViewMode };
}
