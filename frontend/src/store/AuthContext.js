import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => {
    const user = authService.getCurrentUser();
    return { user, isAuthenticated: !!user, loading: false, error: null };
  });
  const setUser = useCallback((user) => setState(previous => ({
    ...previous, user, isAuthenticated: !!user, loading: false,
  })), []);
  const setLoading = useCallback((loading) => setState(previous => ({ ...previous, loading })), []);
  const setError = useCallback((error) => setState(previous => ({ ...previous, error, loading: false })), []);
  const logout = useCallback(() => {
    authService.clearSession();
    setState({ user: null, isAuthenticated: false, loading: false, error: null });
  }, []);
  const value = useMemo(() => ({ ...state, setUser, setLoading, setError, logout }), [state, setUser, setLoading, setError, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
