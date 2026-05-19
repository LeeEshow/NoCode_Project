import { useState, useCallback } from 'react';
import { getLatestReport, getReportByDate } from '../models/aiReportModel';
import type { AiReportDTO } from '../types';

export interface AiReportViewModel {
  report:         AiReportDTO | null;
  hasReport:      boolean;
  loading:        boolean;
  error:          string | null;
  availableDates: string[];
  loadLatest:     () => Promise<void>;
  loadByDate:     (date: string) => Promise<void>;
}

export function useAiReportViewModel(): AiReportViewModel {
  const [report, setReport]                 = useState<AiReportDTO | null>(null);
  const [hasReport, setHasReport]           = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  const addDate = useCallback((date: string) => {
    setAvailableDates(prev => prev.includes(date) ? prev : [date, ...prev].sort().reverse());
  }, []);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLatestReport();
      setReport(data);
      if (data) {
        setHasReport(true);
        addDate(data.reportDate);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [addDate]);

  const loadByDate = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReportByDate(date);
      setReport(data);
      if (data) addDate(data.reportDate);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [addDate]);

  return { report, hasReport, loading, error, availableDates, loadLatest, loadByDate };
}
