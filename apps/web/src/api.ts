import axios from 'axios';

let accessToken = '';
let refreshPromise: Promise<string> | null = null;

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
});

api.interceptors.response.use((response) => response, (error) => Promise.reject(error));

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.clear();
api.interceptors.response.use((response) => response, async (error) => {
  const original = error.config as typeof error.config & { _retried?: boolean };
  if (error.response?.status !== 401 || original?._retried || String(original?.url).includes('/auth/')) return Promise.reject(error);
  original._retried = true;
  refreshPromise ||= axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true }).then((response) => {
    const token = response.data.data.accessToken as string;
    setAccessToken(token);
    return token;
  }).finally(() => { refreshPromise = null; });
  const token = await refreshPromise;
  original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
  return api(original);
});

export function setAccessToken(token = '') { accessToken = token; }
export function getAccessToken() { return accessToken; }
