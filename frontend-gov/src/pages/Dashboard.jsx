import React, { useEffect, useState, useCallback } from 'react';
import Header from '../components/Header';
import LiveAlert from '../components/LiveAlert';
import api from '../services/api';

const StatCard = ({ icon, label, value, color, trend, delay = 0 }) => (
  <div className="card fade-up" style={{ padding: '20px 22px', animationDelay: `${delay}s` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
        {icon}
      </div>
      {trend !== undefined && (
        <span style={{ fontSize: 12, color: trend >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono', fontWeight: 600 }}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </span>
      )}
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', letterSpacing: -1, marginBottom: 4 }}>
      {value ?? '—'}
    </div>
    <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
  </div>
);

const Dashboard = ({ newAccident }) => {
  const [stats,   setStats]   = useState(null);
  const [recent,  setRecent]  = useState([]);
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        api.get('/accidents/stats').catch(() => ({ data: { data: null } })),
        api.get('/accidents?limit=8').catch(() => ({ data: { data: [] } })),
      ]);
      setStats(s.data.data);
      setRecent(a.data.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!newAccident) return;
    setAlerts(p => [newAccident, ...p].slice(0, 5));
    setRecent(p => [newAccident, ...p].slice(0, 8));
    load();
  }, [newAccident, load]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Header title="Dashboard" subtitle="Real-time overview" />

      {/* Floating alerts */}
      <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
        {alerts.map((a, i) => <LiveAlert key={i} accident={a} onClose={() => setAlerts(p => p.filter((_, j) => j !== i))} />)}
      </div>

      <div style={{ padding: '24px', maxWidth: 1400 }}>
        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard icon="⚡" label="Today's Accidents"  value={stats?.today    ?? 0} color="#e63946" delay={0}    />
          <StatCard icon="🔴" label="Active Incidents"   value={stats?.active   ?? 0} color="#f4a261" delay={0.05} />
          <StatCard icon="✓"  label="Resolved Today"    value={stats?.resolved ?? 0} color="#2dc653" delay={0.1}  />
          <StatCard icon="🚨" label="Critical Alerts"   value={stats?.critical ?? 0} color="#e63946" delay={0.15} />
        </div>

        {/* Recent table */}
        <div className="card fade-up" style={{ animationDelay: '0.2s', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>Recent Accidents</h2>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{recent.length} latest incidents</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: 'var(--green)' }}>LIVE</span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
          ) : recent.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>◉</div>
              No accidents recorded
            </div>
          ) : (
            <>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 110px 90px 1fr 100px', gap: 12, padding: '10px 20px', background: 'var(--surface2)', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>
                <div>Time</div><div>Source</div><div>Severity</div><div>Description</div><div>Status</div>
              </div>

              {recent.map((acc, i) => (
                <div key={acc._id || i} className="fade-up" style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 110px 90px 1fr 100px',
                  gap: 12,
                  padding: '13px 20px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                  animationDelay: `${i * 0.04}s`,
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted)' }}>
                    {new Date(acc.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.sourceId}
                  </div>
                  <div><span className={`badge b-${acc.severity}`}>{acc.severity}</span></div>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.description}</div>
                  <div><span className={`badge b-${acc.status}`}>{acc.status}</span></div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;