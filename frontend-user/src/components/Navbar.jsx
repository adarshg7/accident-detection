import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const SunIcon  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
const MoonIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
const MapIcon  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>;
const UserIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const CarIcon  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const ReportIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

const Navbar = ({ connected, onReport }) => {
  const { user, logout }    = useAuth();
  const { theme, toggle }   = useTheme();
  const navigate            = useNavigate();
  const [menuOpen, setMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    setMenu(false);
  };

  const linkStyle = (isActive) => ({
    ...S.link,
    color:      isActive ? 'var(--text)'    : 'var(--muted)',
    fontWeight: isActive ? 600              : 500,
    background: isActive ? 'var(--surface2)': 'transparent',
  });

  return (
    <>
      <nav style={S.nav}>
        {/* ── Logo ─────────────────────────────── */}
        <div style={S.logo} onClick={() => navigate('/map')} role="button">
          <div style={S.logoIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <span style={S.logoText}>Aegis AI</span>
        </div>

        {/* ── Desktop Nav Links ─────────────────── */}
        <div style={S.links}>
          <NavLink
            to="/map"
            style={({ isActive }) => linkStyle(isActive)}
          >
            <MapIcon /> Map
          </NavLink>

          <NavLink
            to="/vehicles"
            style={({ isActive }) => linkStyle(isActive)}
          >
            <CarIcon /> My Vehicles
          </NavLink>

          <NavLink
            to="/profile"
            style={({ isActive }) => linkStyle(isActive)}
          >
            <UserIcon /> Profile
          </NavLink>
        </div>

        {/* ── Right Side ────────────────────────── */}
        <div style={S.right}>

          {/* Live indicator */}
          <div style={S.liveChip}>
            <div style={{
              width:      6,
              height:     6,
              borderRadius: '50%',
              background: connected ? 'var(--green)' : 'var(--muted)',
              animation:  connected ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{
              fontSize:   11,
              fontFamily: 'Inconsolata',
              color:      connected ? 'var(--green)' : 'var(--muted)',
            }}>
              {connected ? 'LIVE' : 'OFF'}
            </span>
          </div>

          {/* Report button */}
          <button
            onClick={onReport || (() => navigate('/report'))}
            style={S.reportBtn}
          >
            <ReportIcon />
            <span>Report</span>
          </button>

          {/* Theme toggle */}
          <button onClick={toggle} style={S.iconBtn} title="Toggle theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Avatar + dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMenu(m => !m)}
              style={S.avatarBtn}
              title={user?.name}
            >
              {user?.avatar
                ? <img
                    src={user.avatar}
                    alt={user.name}
                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                  />
                : <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
              }
            </button>

            {/* Dropdown menu */}
            {menuOpen && (
              <>
                {/* Click outside to close */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                  onClick={() => setMenu(false)}
                />

                <div className="fade-in" style={S.dropdown}>
                  {/* User info */}
                  <div style={S.dropdownHeader}>
                    <div style={S.dropdownAvatar}>
                      {user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                        {user?.email}
                      </div>
                    </div>
                  </div>

                  <div style={S.dropdownDivider} />

                  {/* Menu items */}
                  <button
                    style={S.dropdownItem}
                    onClick={() => { navigate('/map');      setMenu(false); }}
                  >
                    <MapIcon /> Live Map
                  </button>

                  <button
                    style={S.dropdownItem}
                    onClick={() => { navigate('/vehicles'); setMenu(false); }}
                  >
                    <CarIcon /> My Vehicles
                  </button>

                  <button
                    style={S.dropdownItem}
                    onClick={() => { navigate('/report');   setMenu(false); }}
                  >
                    <ReportIcon /> Report Accident
                  </button>

                  <button
                    style={S.dropdownItem}
                    onClick={() => { navigate('/profile');  setMenu(false); }}
                  >
                    <UserIcon /> Profile & Settings
                  </button>

                  <div style={S.dropdownDivider} />

                  <button
                    style={{ ...S.dropdownItem, color: 'var(--accent)' }}
                    onClick={handleLogout}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(m => !m)}
            style={{ ...S.iconBtn, display: 'none' }}
            className="mobile-menu-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Mobile Menu ───────────────────────────── */}
      {mobileOpen && (
        <div style={S.mobileMenu}>
          {[
            { to: '/map',      label: 'Live Map',        icon: <MapIcon />    },
            { to: '/vehicles', label: 'My Vehicles',     icon: <CarIcon />    },
            { to: '/report',   label: 'Report Accident', icon: <ReportIcon /> },
            { to: '/profile',  label: 'Profile',         icon: <UserIcon />   },
          ].map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                ...S.mobileLink,
                background: isActive ? 'var(--surface2)' : 'transparent',
                color:      isActive ? 'var(--text)'     : 'var(--muted)',
              })}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}

          <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />

          <button
            style={{ ...S.mobileLink, color: 'var(--accent)', border: 'none', background: 'none', cursor: 'pointer', width: '100%', fontFamily: 'Outfit' }}
            onClick={handleLogout}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      )}

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
          .desktop-links   { display: none !important; }
        }
      `}</style>
    </>
  );
};

const S = {
  nav: {
    height:       60,
    background:   'var(--surface)',
    borderBottom: '1px solid var(--border)',
    display:      'flex',
    alignItems:   'center',
    padding:      '0 20px',
    gap:          12,
    position:     'sticky',
    top:          0,
    zIndex:       500,
    backdropFilter: 'blur(10px)',
  },

  logo: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
    marginRight: 8,
    cursor:     'pointer',
    flexShrink: 0,
  },
  logoIcon: {
    width:           34,
    height:          34,
    borderRadius:    9,
    background:      'var(--accent)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  logoText: {
    fontSize:   16,
    fontWeight: 700,
    letterSpacing: 0.3,
    color:      'var(--text)',
  },

  links: {
    display:    'flex',
    gap:        4,
    flex:       1,
  },
  link: {
    display:        'flex',
    alignItems:     'center',
    gap:            6,
    padding:        '6px 12px',
    borderRadius:   8,
    textDecoration: 'none',
    fontSize:       14,
    transition:     'all 0.15s',
    whiteSpace:     'nowrap',
  },

  right: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
    marginLeft: 'auto',
    flexShrink: 0,
  },

  liveChip: {
    display:      'flex',
    alignItems:   'center',
    gap:          5,
    padding:      '4px 10px',
    background:   'var(--surface2)',
    borderRadius: 20,
    border:       '1px solid var(--border)',
    whiteSpace:   'nowrap',
  },

  reportBtn: {
    display:      'flex',
    alignItems:   'center',
    gap:          6,
    padding:      '7px 14px',
    background:   'var(--accent)',
    border:       'none',
    borderRadius: 9,
    color:        '#fff',
    fontSize:     13,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'Outfit',
    transition:   'all 0.15s',
    whiteSpace:   'nowrap',
  },

  iconBtn: {
    width:          36,
    height:         36,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'var(--surface2)',
    border:         '1px solid var(--border)',
    borderRadius:   9,
    color:          'var(--muted)',
    cursor:         'pointer',
    transition:     'all 0.15s',
    flexShrink:     0,
  },

  avatarBtn: {
    width:          36,
    height:         36,
    borderRadius:   '50%',
    background:     'linear-gradient(135deg, var(--accent), #7b5ea7)',
    border:         '2px solid var(--border2)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    cursor:         'pointer',
    color:          '#fff',
    flexShrink:     0,
  },

  dropdown: {
    position:     'absolute',
    top:          'calc(100% + 8px)',
    right:        0,
    width:        220,
    background:   'var(--surface)',
    border:       '1px solid var(--border2)',
    borderRadius: 12,
    boxShadow:    '0 12px 40px rgba(0,0,0,0.2)',
    overflow:     'hidden',
    zIndex:       999,
  },
  dropdownHeader: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
    padding:    '14px 16px',
  },
  dropdownAvatar: {
    width:          34,
    height:         34,
    borderRadius:   '50%',
    background:     'linear-gradient(135deg, var(--accent), #7b5ea7)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    color:          '#fff',
    fontWeight:     700,
    fontSize:       13,
    flexShrink:     0,
  },
  dropdownDivider: {
    height:     1,
    background: 'var(--border)',
  },
  dropdownItem: {
    width:      '100%',
    padding:    '10px 16px',
    background: 'none',
    border:     'none',
    textAlign:  'left',
    fontSize:   14,
    color:      'var(--text)',
    cursor:     'pointer',
    fontFamily: 'Outfit',
    transition: 'background 0.15s',
    display:    'flex',
    alignItems: 'center',
    gap:        10,
  },

  mobileMenu: {
    position:     'fixed',
    top:          60,
    left:         0,
    right:        0,
    background:   'var(--surface)',
    borderBottom: '1px solid var(--border)',
    padding:      '8px 12px',
    zIndex:       499,
    display:      'flex',
    flexDirection:'column',
    gap:          2,
  },
  mobileLink: {
    display:        'flex',
    alignItems:     'center',
    gap:            10,
    padding:        '10px 14px',
    borderRadius:   8,
    textDecoration: 'none',
    fontSize:       14,
    fontWeight:     500,
    transition:     'all 0.15s',
  },
};

export default Navbar;