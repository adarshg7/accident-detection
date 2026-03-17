import React, { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const Header = ({ title, subtitle, actions, onMenuClick }) => {
  const { theme, toggleTheme } = useTheme();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header style={S.header}>
      {/* Mobile menu button */}
      <button onClick={onMenuClick} style={{ ...S.iconBtn, display: 'none' }} className="mobile-menu-btn">
        ☰
      </button>

      <div style={S.left}>
        <h1 style={S.title}>{title}</h1>
        {subtitle && <p style={S.sub}>{subtitle}</p>}
      </div>

      <div style={S.right}>
        {actions}

        {/* Clock */}
        <div style={S.clock}>
          <div style={S.clockTime}>
            {time.toLocaleTimeString('en-IN', { hour12: false })}
          </div>
          <div style={S.clockDate}>
            {time.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </div>
        </div>

        {/* Theme */}
        <button onClick={toggleTheme} style={S.iconBtn} title="Toggle theme">
          {theme === 'dark'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          }
        </button>
      </div>
    </header>
  );
};

const S = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: 64,
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    gap: 16,
  },
  left: { minWidth: 0 },
  title: { fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: 0.3 },
  sub: { fontSize: 12, color: 'var(--muted)', marginTop: 1 },
  right: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  clock: { textAlign: 'right' },
  clockTime: { fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, color: 'var(--accent)', letterSpacing: 1 },
  clockDate: { fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--muted)' },
  iconBtn: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: 16,
    transition: 'all 0.15s',
  },
};

export default Header;