// Integration Portal client. Separate session from the user app (different token, different audience).
import axios from 'axios';

const KEY = 'st-portal-token';
const store = { get: () => { try { return localStorage.getItem(KEY); } catch { return null; } }, set: (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} } };
export const portalAuth = { token: store.get, setToken: store.set, signedIn: () => Boolean(store.get()) };

const http = axios.create({ baseURL: (import.meta.env.VITE_API_URL || '/api') + '/portal', timeout: 60_000 });
http.interceptors.request.use((c) => { const t = store.get(); if (t) c.headers.Authorization = `Bearer ${t}`; return c; });
http.interceptors.response.use((r) => r.data, (err) => {
  const status = err.response?.status;
  if (status === 401 && store.get() && !/\/(login|demo|config)$/.test(err.config.url)) { store.set(null); if (!location.pathname.startsWith('/portal/login')) location.assign('/portal/login'); }
  const message = err.response?.data?.error || (err.code === 'ECONNABORTED' ? 'The request took too long. Try again.' : 'Can’t reach the server. Check that the API is running.');
  return Promise.reject(Object.assign(new Error(message), { status }));
});

export const portal = {
  login: (email, password) => http.post('/login', { email, password }),
  config: () => http.get('/config'),
  demo: () => http.post('/demo'),
  me: () => http.get('/me'),
  keys: () => http.get('/keys'),
  createKey: (name, scopes) => http.post('/keys', { name, scopes }),
  revokeKey: (id) => http.delete(`/keys/${id}`),
  stats: () => http.get('/stats'),
  logs: (limit = 50) => http.get('/logs', { params: { limit } }),
  log: (id) => http.get(`/logs/${id}`),
  testEvent: (event) => http.post('/test-event', event ? { event } : {}),
  user: (phone) => http.get(`/users/${encodeURIComponent(phone)}`),
  ads: () => http.get('/ads'),
};
