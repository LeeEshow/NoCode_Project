import axios from 'axios';

// Production 使用固定 HTTPS URL；本機開發走 .env 的 VITE_API_BASE_URL（預設 localhost:8000）
const PROD_API = 'https://finance-backend-py-b8b2hbc4eaezd4gb.southeastasia-01.azurewebsites.net/api/v1';
const DEV_API  = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const baseURL  = import.meta.env.PROD ? PROD_API : DEV_API;

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
