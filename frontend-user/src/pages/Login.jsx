import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';

const Login = () => {
  const [form,    setForm]    = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post('/auth/user/login', form);
      login(r.data.token, r.data.user);
      navigate('/map');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async tokenResponse => {
      try {
        const r = await api.post('/auth/google/callback', { token: tokenResponse.access_token });
        login(r.data.token, r.data.user);
        navigate('/map');
      } catch { toast.error('Google login failed'); }
    },
    onError: () => toast.error('Google login failed'),
  });

  return (
    <div style={S.page}>
      <Toaster position="top-center" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />

      <div style={S.left}>
        <div style={S.hero}>
          <div style={S.heroIcon}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1 style={S.heroTitle}>Aegis AI</h1>
          <p style={S.heroSub}>Your City's AI Guardian — Real-time accident detection</p>

          <div style={S.stats}>
            {[['AI Detection','YOLOv11 powered'],['Live Alerts','Instant notifications'],['Community','Report & help others']].map(([t,d]) => (
              <div key={t} style={S.statItem}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={S.right}>
        <div style={S.card}>
          <h2 style={S.cardTitle}>Welcome back</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Sign in to stay safe on the road</p>

          {/* Google login */}
          <button onClick={() => googleLogin()} className="btn" style={{ width: '100%', marginBottom: 16, gap: 10, justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <div style={S.divider}><span>or</span></div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <button type="submit" disabled={loading} className="btn btn-accent" style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600, marginTop: 4 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

const S = {
  page: { display: 'flex', minHeight: '100vh' },
  left: { flex: 1, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 },
  hero: { maxWidth: 380 },
  heroIcon: { width: 60, height: 60, borderRadius: 16, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  heroTitle: { fontSize: 44, fontWeight: 800, letterSpacing: -1, marginBottom: 10 },
  heroSub: { fontSize: 16, color: 'var(--muted)', marginBottom: 44, lineHeight: 1.5 },
  stats: { display: 'flex', flexDirection: 'column', gap: 20 },
  statItem: { display: 'flex', flexDirection: 'column', paddingLeft: 16, borderLeft: '3px solid var(--accent)' },
  right: { width: 460, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 },
  card: { width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 },
  cardTitle: { fontSize: 24, fontWeight: 700, marginBottom: 6 },
  divider: { display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0', color: 'var(--muted)', fontSize: 12 },
};

export default Login;