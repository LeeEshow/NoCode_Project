import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  res => res,
  err => {
    const msg =
      err.response?.data?.message ??
      err.response?.data?.error ??
      err.message ??
      '請求失敗';
    return Promise.reject(new Error(String(msg)));
  }
);

export default api;
