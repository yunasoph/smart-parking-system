import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { get, post, onUnauthorized } from './api';

const AuthContext = createContext(null);

export function homeForRole(role) {
  if (role === 'PARKER') return '/my-parking';
  return '/';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const me = await get('/api/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
    });
    checkSession();
  }, [checkSession]);

  const login = async (email, password) => {
    const loggedIn = await post('/api/auth/login', { email, password });
    setUser(loggedIn);
    return loggedIn;
  };

  const register = async (payload) => {
    const created = await post('/api/auth/register', payload);
    setUser(created);
    return created;
  };

  const logout = async () => {
    try {
      await post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
