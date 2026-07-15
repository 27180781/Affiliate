// Thin fetch wrapper around the affiliate API.
// VITE_API_URL points at the Express server (empty string in dev → same-origin
// proxy handled by vite.config.js).
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const TOKEN_KEY = 'clicker_affiliate_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  register: (payload) => apiFetch('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => apiFetch('/api/auth/login', { method: 'POST', body: payload, auth: false }),

  me: () => apiFetch('/api/affiliate/me'),
  stats: () => apiFetch('/api/affiliate/stats'),
  myConversions: () => apiFetch('/api/affiliate/conversions'),

  adminAffiliates: () => apiFetch('/api/admin/affiliates'),
  adminConversions: (status) =>
    apiFetch(`/api/admin/conversions${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  adminPayConversion: (id) => apiFetch(`/api/admin/conversions/${id}/pay`, { method: 'POST' }),
  adminPayAll: (affiliateId) => apiFetch(`/api/admin/affiliates/${affiliateId}/pay-all`, { method: 'POST' }),
};
