import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { path: '/dashboard', label: 'Dashboard',    icon: <GridIcon /> },
  { path: '/accidents', label: 'Accidents',    icon: <AlertIcon /> },
  { path: '/cameras',   label: 'Live Cameras', icon: <CameraIcon /> },
  { path: '/analytics', label: 'Analytics',    icon: <ChartIcon /> },
];

function GridIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>; }
function AlertIcon()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function CameraIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>; }
function ChartIcon()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function UsersIcon()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>; }

const Sidebar = ({ connected, onMobileClose }) => {
  const { official, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside style={S.sidebar}>
      {/* Brand */}
      <div style={S.brand}>
        <div style={S.brandIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <div style={S.brandName}>AEGIS AI</div>
          <div style={S.brandSub}>Gov Control</div>
        </div>
        {onMobileClose && (
          <button onClick={onMobileClose} style={{ ...S.iconBtn, marginLeft: 'auto' }}>✕</button>
        )}
      </div>

      {/* Status pill */}
      <div style={S.statusRow}>
        <div style={{ ...S.dot, background: connected ? 'var(--green)' : 'var(--red)', boxShadow: connected ? '0 0 0 3px rgba(45,198,83,0.2)' : 'none' }} />
        <span style={S.statusText}>{connected ? 'Live connection' : 'Disconnected'}</span>
      </div>

      {/* Nav */}
      <nav style={S.nav}>
        {NAV.map(item => (
          <NavLink key={item.path} to={item.path} style={({ isActive }) => ({
            ...S.navItem,
            background: isActive ? 'rgba(67,97,238,0.15)' : 'transparent',
            color:      isActive ? '#7b9cff' : 'var(--muted)',
            borderLeft: isActive ? '2px solid #4361ee' : '2px solid transparent',
          })}>
            <span style={{ display: 'flex', opacity: 0.9 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {/* Admin only: Officials management */}
        {official?.role === 'admin' && (
          <NavLink to="/officials" style={({ isActive }) => ({
            ...S.navItem,
            background: isActive ? 'rgba(67,97,238,0.15)' : 'transparent',
            color:      isActive ? '#7b9cff' : 'var(--muted)',
            borderLeft: isActive ? '2px solid #4361ee' : '2px solid transparent',
            marginTop: 8,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
          })}>
            <span style={{ display: 'flex', opacity: 0.9 }}><UsersIcon /></span>
            Officials
          </NavLink>
        )}
      </nav>

      {/* Bottom: profile */}
      <div style={S.profile}>
        <div style={S.avatar}>{official?.name?.[0]?.toUpperCase() || 'G'}</div>
        <div style={S.profileInfo}>
          <div style={S.profileName}>{official?.name || 'Official'}</div>
          <div style={S.profileDept}>{official?.department?.replace(/_/g, ' ')}</div>
        </div>
        <button onClick={handleLogout} style={S.iconBtn} title="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
    </aside>
  );
};

const S = {
  sidebar: {
    width: 240,
    height: '100vh',
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 200,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '20px 20px 18px',
    borderBottom: '1px solid var(--border)',
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    background: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brandName: { fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: 'var(--text)' },
  brandSub: { fontSize: 11, color: 'var(--muted)', marginTop: 1 },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
  },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  statusText: { fontSize: 12, color: 'var(--muted)', fontFamily: 'JetBrains Mono' },
  nav: { flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.15s',
    cursor: 'pointer',
  },
  profile: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    borderTop: '1px solid var(--border)',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--blue), var(--purple))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    color: '#fff',
    flexShrink: 0,
  },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  profileDept: { fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'capitalize' },
  iconBtn: { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6, flexShrink: 0, transition: 'color 0.15s' },
};

export default Sidebar;