import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login    from './pages/Login';
import Register from './pages/Register';
import MapPage  from './pages/Map';
import Profile  from './pages/Profile';

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'JetBrains Mono', color:'var(--muted)', fontSize:13 }}>
      Loading...
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
};

const App = () => (
  <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/map"      element={<Protected><MapPage /></Protected>} />
          <Route path="/profile"  element={<Protected><Profile /></Protected>} />
          <Route path="*"         element={<Navigate to="/map" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </ThemeProvider>
);

export default App;