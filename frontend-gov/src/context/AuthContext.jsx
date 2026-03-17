import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [official, setOfficial] = useState(null);
  const [loading, setLoading]   = useState(true);
  // loading=true while we check if user is already logged in

  useEffect(() => {
    // On app start: check if token exists and is valid
    const token = localStorage.getItem('gov_token');
    const saved = localStorage.getItem('gov_official');

    if (token && saved) {
      setOfficial(JSON.parse(saved));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Set token on all future API requests automatically
    }
    setLoading(false);
  }, []);

  const login = (token, officialData) => {
    localStorage.setItem('gov_token', token);
    localStorage.setItem('gov_official', JSON.stringify(officialData));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setOfficial(officialData);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {}
    // Try to blacklist token on server
    // Even if it fails: clear local state

    localStorage.removeItem('gov_token');
    localStorage.removeItem('gov_official');
    delete api.defaults.headers.common['Authorization'];
    setOfficial(null);
  };

  return (
    <AuthContext.Provider value={{ official, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);