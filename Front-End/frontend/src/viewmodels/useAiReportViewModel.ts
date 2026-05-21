import { useState, useCallback, useRef } from 'react';
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
  const reqIdRef = useRef(0);

  const addDate = useCallback((date: string) => {
    setAvailableDates(prev => prev.includes(date) ? prev : [date, ...prev].sort().reverse());
  }, []);

  const loadLatest = useCallback(async () => {
    const id = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getLatestReport();
      if (id !== reqIdRef.current) return;
      setReport(data);
      if (data) {
        setHasReport(true);
        addDate(data.reportDate);
      }
    } catch (err) {
      if (id !== reqIdRef.current) return;
      setError((err as Error).message);
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, [addDate]);

  const loadByDate = useCallback(async (date: string) => {
    const id = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getReportByDate(date);
      if (id !== reqIdRef.current) return;
      setReport(data);
      if (data) addDate(data.reportDate);
    } catch (err) {
      if (id !== reqIdRef.current) return;
      setError((err as Error).message);
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, [addDate]);

  return { report, hasReport, loading, error, availableDates, loadLatest, loadByDate };
}
