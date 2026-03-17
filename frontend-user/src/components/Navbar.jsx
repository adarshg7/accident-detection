import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const SunIcon  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
const MoonIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
const MapIcon  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>;
const UserIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;

const Navbar = ({ connected, onReport }) => {
  const { user, logout }    = useAuth();
  const { theme, toggle }   = useTheme();
  const navigate            = useNavigate();
  const [menuOpen, setMenu] = useState(false);

  return (
    <nav style={S.nav}>
      {/* Logo */}
      <div style={S.logo}>
        <div style={S.logoIcon}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <span style={S.logoText}>SafeRoute</span>
      </div>

      {/* Nav links */}
      <div style={S.links}>
        <NavLink to="/map"     style={({ isActive }) => ({ ...S.link, color: isActive ? 'var(--text)' : 'var(--muted)' })}>
          <MapIcon /> Map
        </NavLink>
        <NavLink to="/profile" style={({ isActive }) => ({ ...S.link, color: isActive ? 'var(--text)' : 'var(--muted)' })}>
          <UserIcon /> Profile
        </NavLink>
      </div>

      {/* Right */}
      <div style={S.right}>
        {/* Live indicator */}
        <div style={S.liveChip}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--muted)', animation: connected ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: connected ? 'var(--green)' : 'var(--muted)' }}>
            {connected ? 'LIVE' : 'OFF'}
          </span>
        </div>

        {/* Report button */}
        <button className="btn btn-danger" onClick={onReport} style={{ padding: '7px 14px', fontSize: 13 }}>
          🚨 Report
        </button>

        {/* Theme */}
        <button onClick={toggle} style={S.iconBtn}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Avatar menu */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenu(m => !m)} style={S.avatarBtn}>
            {user?.avatar
              ? <img src={user.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 14, fontWeight: 700 }}>{user?.name?.[0]?.toUpperCase() || 'U'}</span>
            }
          </button>

          {menuOpen && (
            <div className="fade-in" style={S.dropdown}>
              <div style={S.dropdownHeader}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{user?.email}</div>
              </div>
              <div style={S.dropdownDivider} />
              <button style={S.dropdownItem} onClick={() => { navigate('/profile'); setMenu(false); }}>
                Profile & Settings
              </button>
              <button style={S.dropdownItem} onClick={() => { logout(); navigate('/login'); }}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

const S = {
  nav: {
    height: 60,
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: 16,
    position: 'sticky',
    top: 0,
    zIndex: 500,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 },
  logoIcon: { width: 34, height: 34, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoText: { fontSize: 16, fontWeight: 700, letterSpacing: 0.3 },
  links: { display: 'flex', gap: 4, flex: 1 },
  link: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.15s' },
  right: { display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  liveChip: { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--surface2)', borderRadius: 20, border: '1px solid var(--border)' },
  iconBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s' },
  avatarBtn: { width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7b5ea7)', border: '2px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' },
  dropdown: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 220, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', overflow: 'hidden', zIndex: 999 },
  dropdownHeader: { padding: '14px 16px' },
  dropdownDivider: { height: 1, background: 'var(--border)' },
  dropdownItem: { width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, color: 'var(--text)', cursor: 'pointer', fontFamily: 'Outfit', transition: 'background 0.15s' },
};

export default Navbar;