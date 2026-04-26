import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPreferences, updatePreferences } from '../models/preferencesModel';
import type { UserPreferences, ChartPreferences, ExpandTab } from '../types';
import { DEFAULT_PREFERENCES } from '../types';

const LS_KEY = 'user_preferences';

function loadFromStorage(): UserPreferences {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
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
        setPrefs(data);
        saveToStorage(data);
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

  return { prefs, loaded, setChartPref, setExpandTab };
}
