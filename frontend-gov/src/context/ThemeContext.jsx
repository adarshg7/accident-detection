import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(
    localStorage.getItem('gov_theme') || 'dark'
  );
  // Read saved theme from localStorage on startup

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // setAttribute on <html> element applies CSS variables
    // [data-theme="light"] in CSS activates light mode variables
    localStorage.setItem('gov_theme', theme);
    // Save preference for next visit
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);