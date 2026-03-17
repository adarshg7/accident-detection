import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const Ctx = createContext();

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('user_token');
    const saved = localStorage.getItem('user_data');
    if (token && saved) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(JSON.parse(saved));
    }
    setLoading(false);
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('user_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const updateUser = (data) => {
    const updated = { ...user, ...data };
    localStorage.setItem('user_data', JSON.stringify(updated));
    setUser(updated);
  };

  return (
    <Ctx.Provider value={{ user, login, logout, loading, updateUser }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);