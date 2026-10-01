import { jwtDecode } from 'jwt-decode';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/api`;

const getAuthToken = () => localStorage.getItem('token');

const headers = (includeAuth = true) => {
  const h = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    const token = getAuthToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
  }
  return h;
};

const handleResponse = async (response) => {
  if (!response.ok) {
    let error;
    try {
      error = await response.json();
    } catch {
      error = { error: `HTTP ${response.status}` };
    }
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
};

// Auth API
export const authApi = {
  login: (email, password) =>
    fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: headers(false),
      body: JSON.stringify({ email, password }),
    }).then(handleResponse),

  getMe: () =>
    fetch(`${API_URL}/auth/me`, { headers: headers() }).then(handleResponse),

  register: (data) =>
    fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),
};

// Users API
export const usersApi = {
  getAll: () => fetch(`${API_URL}/users`, { headers: headers() }).then(handleResponse),
  getById: (id) => fetch(`${API_URL}/users/${id}`, { headers: headers() }).then(handleResponse),
  update: (id, data) =>
    fetch(`${API_URL}/users/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),
  deactivate: (id) =>
    fetch(`${API_URL}/users/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),
};

// Dashboard API
export const dashboardApi = {
  getStats: () => fetch(`${API_URL}/dashboard`, { headers: headers() }).then(handleResponse),
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

const apiServices = { authApi, usersApi, dashboardApi, authService };
export default apiServices;
