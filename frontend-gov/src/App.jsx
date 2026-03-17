import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Sidebar from './components/Sidebar';
import useSocket from './hooks/useSocket';
import Login      from './pages/Login';
import Dashboard  from './pages/Dashboard';
import Accidents  from './pages/Accidents';
import LiveCameras from './pages/LiveCameras';
import Analytics  from './pages/Analytics';

const Layout = () => {
  const { official, loading } = useAuth();
  const { connected, newAccident, socket } = useSocket();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'JetBrains Mono', color:'var(--muted)', fontSize: 13 }}>
      Loading...
    </div>
  );

  if (!official) return <Navigate to="/login" replace />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <Sidebar connected={connected} onMobileClose={() => setMobileOpen(false)} />

      {/* Main content */}
      <main style={{ marginLeft: 240, flex: 1, minWidth: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/dashboard"  element={<Dashboard   newAccident={newAccident} />} />
          <Route path="/accidents"  element={<Accidents />} />
          <Route path="/cameras"    element={<LiveCameras socket={socket} />} />
          <Route path="/analytics"  element={<Analytics />} />
          <Route path="*"           element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      {/* Responsive style */}
      <style>{`
        @media (max-width: 900px) {
          main { margin-left: 0 !important; }
          aside { transform: translateX(${mobileOpen ? '0' : '-100%'}); transition: transform 0.25s; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </div>
  );
};

const App = () => (
  <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*"     element={<Layout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </ThemeProvider>
);

export default App;