import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [affiliate, setAffiliate] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, if we have a token, resolve the current user.
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { affiliate } = await api.me();
        if (active) setAffiliate(affiliate);
      } catch {
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, affiliate } = await api.login({ email, password });
    setToken(token);
    setAffiliate(affiliate);
    return affiliate;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, affiliate } = await api.register(payload);
    setToken(token);
    setAffiliate(affiliate);
    return affiliate;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAffiliate(null);
  }, []);

  const value = { affiliate, loading, login, register, logout, isAdmin: affiliate?.role === 'admin' };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
