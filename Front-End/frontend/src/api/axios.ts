import axios from 'axios';

// Production 環境強制升級為 HTTPS，防止環境變數誤設 http:// 造成 Mixed Content
const rawBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const baseURL = import.meta.env.PROD
  ? rawBase.replace(/^http:\/\//, 'https://')
  : rawBase;

const api = axios.create({
  baseURL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  res => res,
  err => {
    if (import.meta.env.DEV) {
      console.error('[API Error]', err);
    }
    const msg =
      err.response?.data?.message ??
      err.response?.data?.error ??
      err.message ??
      '請求失敗';
    const error = new Error(String(msg));
    /* 無 HTTP response = timeout 或 network error，允許上層 retry */
    if (!err.response) {
      (error as Error & { retryable: boolean }).retryable = true;
    }
    return Promise.reject(error);
  }
);

export default api;
