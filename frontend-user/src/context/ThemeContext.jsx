import React, { createContext, useContext, useState, useEffect } from 'react';

const Ctx = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(localStorage.getItem('user_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('user_theme', theme);
  }, [theme]);

  return (
    <Ctx.Provider value={{ theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>
      {children}
    </Ctx.Provider>
  );
};

export const useTheme = () => useContext(Ctx);