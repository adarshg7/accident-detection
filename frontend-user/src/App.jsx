// ── App.jsx — Root router + context providers ─────────────────────────────
import React from 'react';
import {
  BrowserRouter as Router,
  Routes, Route, Navigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';

// ── Pages ──────────────────────────────────────────────────────────────────
import Login    from './pages/Login';
import Register from './pages/Register';
import MapView  from './pages/Map';
import Vehicles from './pages/Vehicles';
import Profile  from './pages/Profile';

// ── Protected: shows Navbar + page, redirects to /login if not authed ──────
function Protected({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)',
      }}>
        <div style={{
          width: 28, height: 28,
          border: '3px solid var(--border)',
          borderTop: '3px solid var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <Navbar />
      {children}
    </>
  );
}

// ── Public: redirect to /map if already logged in ─────────────────────────
function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/map" replace /> : children;
}

// ── Routes ─────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      {/* Public — no Navbar */}
      <Route path="/login"    element={<Public><Login    /></Public>} />
      <Route path="/register" element={<Public><Register /></Public>} />

      {/* Protected — Navbar rendered by Protected wrapper */}
      <Route path="/map"      element={<Protected><MapView  /></Protected>} />
      <Route path="/vehicles" element={<Protected><Vehicles /></Protected>} />
      <Route path="/profile"  element={<Protected><Profile  /></Protected>} />

      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <ThemeProvider>
          <AppRoutes />
        </ThemeProvider>
      </AuthProvider>
    </Router>
  );
}