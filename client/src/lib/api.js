import axios from 'axios';
import { QueryClient, useQuery } from '@tanstack/react-query';

const KEY = 'st-token';
const store = { get: () => { try { return localStorage.getItem(KEY); } catch { return null; } }, set: (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} } };
export const auth = { token: store.get, setToken: store.set, signedIn: () => Boolean(store.get()) };

export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 120_000 });
http.interceptors.request.use((c) => { const t = store.get(); if (t) c.headers.Authorization = `Bearer ${t}`; return c; });
http.interceptors.response.use((r) => r.data, (err) => {
  if (err.response?.status === 401 && store.get()) { store.set(null); if (!location.pathname.startsWith('/signin')) location.assign('/signin'); }
  const message = err.response?.data?.error || (err.code === 'ECONNABORTED' ? 'The request took too long. Try again.' : 'Can’t reach the server. Check that the API is running.');
  return Promise.reject(Object.assign(new Error(message), { status: err.response?.status }));
});

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });

export const api = {
  health: () => http.get('/health'),
  me: () => http.get('/me'),
  register: (b) => http.post('/auth/register', b),
  login: (b) => http.post('/auth/login', b),
  demo: (persona) => http.post('/auth/demo', { persona }),
  paytmStart: (phone) => http.post('/auth/paytm/start', { phone }),
  paytmVerify: (requestId, code) => http.post('/auth/paytm/verify', { request_id: requestId, code }),
  logout: () => http.post('/auth/logout'),
  settings: (b) => http.put('/auth/settings', b),
  deleteAccount: () => http.delete('/auth/account'),
  categories: () => http.get('/spending/categories'),
  importData: (b) => http.post('/spending/import', b),
  transactions: (params) => http.get('/spending/transactions', { params }),
  recategorize: (id, b) => http.put(`/spending/${id}/categorize`, b),
  deleteTxn: (id) => http.delete(`/spending/${id}`),
  dashboard: (period) => http.get('/analysis/dashboard', { params: { period } }),
  trends: (months) => http.get('/analysis/trends', { params: { months } }),
  insights: (ai) => http.get('/analysis/insights', { params: ai ? { ai: 1 } : {} }),
  category: (id, period) => http.get(`/analysis/category/${id}`, { params: { period } }),
  merchant: (id) => http.get(`/analysis/merchant/${id}`),
  comparison: () => http.get('/analysis/comparison'),
  profile: () => http.get('/analysis/behavioral-profile'),
  ask: (question, opts = {}) => http.post('/analysis/ask', { question, engine_only: !!opts.engineOnly }),
  aiPrompt: (kind, question) => http.post('/analysis/ai/prompt', { kind, question }),
  recs: () => http.get('/recommendations/all'),
  impact: () => http.get('/recommendations/impact'),
  acceptRec: (id) => http.post(`/recommendations/${id}/accept`),
  dismissRec: (id) => http.post(`/recommendations/${id}/dismiss`),
  resetRec: (id) => http.post(`/recommendations/${id}/reset`),
  acceptChallenge: (id) => http.post(`/recommendations/challenges/${id}/accept`),
  leaveChallenge: (id) => http.post(`/recommendations/challenges/${id}/leave`),
  offers: (limit) => http.get('/ads/relevant', { params: { limit } }),
  adView: (id) => http.post(`/ads/${id}/view`),
  adClick: (id) => http.post(`/ads/${id}/click`),
  adFeedback: (adId, feedback) => http.post('/ads/feedback', { adId, feedback }),
  adPerformance: () => http.get('/ads/performance'),
  budgetStatus: () => http.get('/budget/status'),
  budgetSuggest: () => http.get('/budget/suggest'),
  budgetSave: (budgets) => http.post('/budget/create', { budgets }),
  budgetDelete: (id) => http.delete(`/budget/${id}`),
  alerts: () => http.get('/alerts/all'),
  alertSettings: (b) => http.post('/alerts/settings', b),
  alertRead: (id) => http.put(`/alerts/read/${id}`),
  alertDelete: (id) => http.delete(`/alerts/${id}`),
  report: (kind) => http.get(`/report/${kind}`),
  download: async (path, filename) => {
    const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${store.get()}` } });
    if (!res.ok) throw new Error('Export failed. Try again.');
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
  },
};

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me, enabled: auth.signedIn() });
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });
