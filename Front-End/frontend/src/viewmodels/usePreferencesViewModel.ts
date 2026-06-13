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
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {}
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
    let next!: UserPreferences;
    setPrefs(prev => {
      next = { ...prev, chart: { ...prev.chart, ...patch } };
      return next;
    });
    saveToStorage(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updatePreferences(next).catch(() => {});
    }, 500);
  }, []);

  const setExpandTab = useCallback((tab: ExpandTab) => {
    let next!: UserPreferences;
    setPrefs(prev => {
      next = { ...prev, expandTab: tab };
      return next;
    });
    saveToStorage(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updatePreferences(next).catch(() => {});
    }, 500);
  }, []);

  const setWlCollapsedGroups = useCallback((groups: string[]) => {
    let next!: UserPreferences;
    setPrefs(prev => {
      next = { ...prev, wlCollapsedGroups: groups };
      return next;
    });
    saveToStorage(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updatePreferences(next).catch(() => {});
    }, 500);
  }, []);

  const setWlViewMode = useCallback((mode: 'table' | 'card') => {
    let next!: UserPreferences;
    setPrefs(prev => {
      next = { ...prev, wlViewMode: mode };
      return next;
    });
    saveToStorage(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updatePreferences(next).catch(() => {});
    }, 500);
  }, []);

  return { prefs, loaded, setChartPref, setExpandTab, setWlCollapsedGroups, setWlViewMode };
}
