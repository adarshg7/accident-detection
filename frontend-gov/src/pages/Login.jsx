import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';

const DEPTS = ['police','traffic_police','municipal_corporation','fire_department','ambulance_service','highway_authority','transport_department'];

const Login = () => {
  const [tab,     setTab]     = useState('login');
  const [loading, setLoading] = useState(false);
  const [form,    setForm]    = useState({ name:'', email:'', password:'', department:'police', badgeNumber:'', rank:'' });
  const { login } = useAuth();
  const navigate  = useNavigate();

  const change = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === 'login') {
        const r = await api.post('/auth/gov/login', { email: form.email, password: form.password });
        login(r.data.token, r.data.official);
        toast.success(`Welcome, ${r.data.official.name}`);
        navigate('/dashboard');
      } else {
        await api.post('/auth/gov/register', form);
        toast.success('Request submitted. Awaiting admin approval.');
        setTab('login');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />

      {/* Left */}
      <div style={S.left}>
        <div style={S.leftInner}>
          <div style={S.logoBox}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1 style={S.bigTitle}>AEGIS AI</h1>
          <p style={S.bigSub}>Government Accident Control System</p>

          <div style={S.features}>
            {[
              ['Real-time AI detection', 'YOLOv11 powered accident detection across all cameras'],
              ['Emergency response', 'Auto-alerts police, ambulance and nearby services'],
              ['Live monitoring', 'Full CCTV access with incident management'],
              ['Analytics & reporting', 'Heatmaps, trends, and response time analysis'],
            ].map(([title, desc]) => (
              <div key={title} style={S.feature}>
                <div style={S.featureDot} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right */}
      <div style={S.right}>
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              {tab === 'login' ? 'Sign in' : 'Register'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {tab === 'login' ? 'Access the government control panel' : 'Request official access'}
            </div>
          </div>

          {/* Tabs */}
          <div style={S.tabs}>
            {['login','register'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                ...S.tab,
                background: tab === t ? 'var(--surface)' : 'transparent',
                color: tab === t ? 'var(--text)' : 'var(--muted)',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
              }}>
                {t === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {tab === 'register' && (
              <Field label="Full Name" name="name" value={form.name} onChange={change} placeholder="Your full name" required />
            )}

            <Field label="Government Email" name="email" type="email" value={form.email} onChange={change} placeholder="name@gov.in" required />
            <Field label="Password" name="password" type="password" value={form.password} onChange={change} placeholder="Min 8 characters" required />

            {tab === 'register' && (
              <>
                <div>
                  <label className="label">Department</label>
                  <select name="department" value={form.department} onChange={change} className="input" style={{ cursor: 'pointer' }}>
                    {DEPTS.map(d => <option key={d} value={d}>{d.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
                  </select>
                </div>
                <Field label="Badge / ID Number" name="badgeNumber" value={form.badgeNumber} onChange={change} placeholder="Optional" />
                <Field label="Rank" name="rank" value={form.rank} onChange={change} placeholder="Inspector, DCP, etc." />
              </>
            )}

            <button type="submit" disabled={loading} className="btn btn-accent" style={{ width: '100%', justifyContent: 'center', padding: '11px 0', fontSize: 14, marginTop: 4 }}>
              {loading ? '...' : tab === 'login' ? 'Sign In' : 'Submit Request'}
            </button>
          </form>

          {tab === 'register' && (
            <div style={S.note}>
              Only government email domains (.gov.in, .nic.in) are accepted. All registrations require admin approval.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, ...props }) => (
  <div>
    <label className="label">{label}</label>
    <input className="input" {...props} />
  </div>
);

const S = {
  page: { display: 'flex', minHeight: '100vh' },
  left: {
    flex: 1,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  leftInner: { maxWidth: 420 },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  bigTitle: { fontSize: 42, fontWeight: 800, letterSpacing: 6, marginBottom: 8 },
  bigSub: { fontSize: 14, color: 'var(--muted)', marginBottom: 40, lineHeight: 1.5 },
  features: { display: 'flex', flexDirection: 'column', gap: 24 },
  feature: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  featureDot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 5, flexShrink: 0 },
  right: {
    width: 480,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    background: 'var(--bg)',
  },
  card: {
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 32,
  },
  cardHead: { marginBottom: 24 },
  tabs: {
    display: 'flex',
    background: 'var(--surface2)',
    borderRadius: 9,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'DM Sans',
    transition: 'all 0.15s',
  },
  note: {
    marginTop: 16,
    padding: '10px 14px',
    background: 'rgba(67,97,238,0.08)',
    border: '1px solid rgba(67,97,238,0.2)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--muted)',
    lineHeight: 1.6,
  },
};

export default Login;