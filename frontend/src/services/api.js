import { jwtDecode } from 'jwt-decode';
import { apiJson, apiUrl } from './apiClient';

const getAuthToken = () => localStorage.getItem('token');

const headers = () => {
  const h = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
};

const request = (path, options = {}) => apiJson(apiUrl(path), options).then(result => result.data);

// Auth API
export const authApi = {
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      auth: false,
      redirectOn401: false,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),

  getMe: () =>
    request('/auth/me', { headers: headers() }),

  register: (data) =>
    request('/auth/register', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }),
};

// Users API
export const usersApi = {
  getAll: () => request('/users', { headers: headers() }),
  getById: (id) => request(`/users/${id}`, { headers: headers() }),
  update: (id, data) =>
    request(`/users/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }),
  deactivate: (id) =>
    request(`/users/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }),
};

// Dashboard API
export const dashboardApi = {
  getStats: () => request('/dashboard', { headers: headers() }),
};

export const accountMappingsApi = {
  getAll: (locale = 'en') => request(`/finance-ledger/account-mappings?locale=${encodeURIComponent(locale)}`, { headers: headers() }),
  update: (key, account_id) => request(`/finance-ledger/account-mappings/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify({ account_id }),
  }),
  confirmMapping: (key) => request(`/finance-ledger/account-mappings/${encodeURIComponent(key)}/confirm`, {
    method: 'POST', headers: headers(), body: JSON.stringify({}),
  }),
};

// Client-side auth service (mirrors feed factory pattern)
export const authService = {
  isAuthenticated: () => {
    const token = localStorage.getItem('token');
    if (!token) return false;
    try {
      const decoded = jwtDecode(token);
      if (decoded.exp * 1000 < Date.now()) {
        localStorage.removeItem('token');
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  getCurrentUser: () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  setSession: (token, user) => {
    sessionStorage.removeItem('clientPreviewToken');
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  clearSession: () => {
    sessionStorage.removeItem('clientPreviewToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

const apiServices = { authApi, usersApi, dashboardApi, accountMappingsApi, authService };
export default apiServices;
