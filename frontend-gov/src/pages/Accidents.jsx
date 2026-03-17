import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';

const STATUSES   = ['all','detected','verified','rejected','responding','resolved'];
const SEVERITIES = ['all','LOW','MEDIUM','HIGH','CRITICAL'];

const Accidents = () => {
  const [accidents, setAccidents] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState({ status: 'all', severity: 'all' });
  const [page,      setPage]      = useState(1);
  const [total,     setTotal]     = useState(0);
  const [selected,  setSelected]  = useState(null);
  const [updating,  setUpdating]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (filter.status !== 'all')   params.status   = filter.status;
      if (filter.severity !== 'all') params.severity = filter.severity;
      const r = await api.get('/accidents', { params });
      setAccidents(r.data.data || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load accidents'); }
    finally { setLoading(false); }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, status) => {
    setUpdating(true);
    try {
      await api.patch(`/accidents/${id}/status`, { status });
      toast.success('Status updated');
      load();
      setSelected(s => s ? { ...s, status } : null);
    } catch { toast.error('Update failed'); }
    finally { setUpdating(false); }
  };

  const FilterBtn = ({ active, onClick, children }) => (
    <button onClick={onClick} className="btn" style={{ padding: '5px 12px', fontSize: 11, fontFamily: 'JetBrains Mono', background: active ? 'var(--accent)' : 'var(--surface2)', color: active ? '#fff' : 'var(--muted)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
      {children}
    </button>
  );

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />
      <Header title="Accidents" subtitle={`${total} total incidents`} />

      <div style={{ padding: 24 }}>
        {/* Filters */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, minWidth: 50 }}>Status</span>
              {STATUSES.map(s => <FilterBtn key={s} active={filter.status === s} onClick={() => { setFilter(f => ({ ...f, status: s })); setPage(1); }}>{s}</FilterBtn>)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, minWidth: 50 }}>Severity</span>
              {SEVERITIES.map(s => <FilterBtn key={s} active={filter.severity === s} onClick={() => { setFilter(f => ({ ...f, severity: s })); setPage(1); }}>{s}</FilterBtn>)}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
          ) : accidents.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>No accidents found</div>
          ) : (
            accidents.map((acc, i) => (
              <div key={acc._id} className="fade-up" onClick={() => setSelected(acc)} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'background 0.15s',
                borderLeft: `3px solid ${acc.severity === 'CRITICAL' ? 'var(--red)' : acc.severity === 'HIGH' ? '#fb8500' : 'transparent'}`,
                animationDelay: `${i * 0.03}s`,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
                    <span className={`badge b-${acc.severity}`}>{acc.severity}</span>
                    <span className={`badge b-${acc.status}`}>{acc.status}</span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted)' }}>{acc.sourceId}</span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                      {new Date(acc.timestamp).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.description}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--muted)' }}>Page {page}</span>
          <button className="btn" onClick={() => setPage(p => p + 1)} disabled={accidents.length < 15}>Next →</button>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setSelected(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 580, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>Accident Detail</h2>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{selected.accidentId}</div>
              </div>
              <button className="btn" onClick={() => setSelected(null)} style={{ padding: '6px 10px' }}>✕</button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Detail grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                {[
                  ['Severity',    <span className={`badge b-${selected.severity}`}>{selected.severity}</span>],
                  ['Status',      <span className={`badge b-${selected.status}`}>{selected.status}</span>],
                  ['Source',      selected.sourceId],
                  ['Detected by', selected.detectedBy],
                  ['Confidence',  selected.confidence ? `${(selected.confidence * 100).toFixed(1)}%` : '—'],
                  ['Time',        new Date(selected.timestamp).toLocaleString('en-IN')],
                  ['Description', selected.description, true],
                ].map(([label, value, full]) => (
                  <div key={label} style={{ gridColumn: full ? 'span 2' : 'span 1' }}>
                    <div className="label" style={{ marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 14, fontFamily: typeof value === 'string' && label !== 'Description' ? 'JetBrains Mono' : 'DM Sans', color: 'var(--text)' }}>{value || '—'}</div>
                  </div>
                ))}
              </div>

              {/* Screenshot */}
              {selected.screenshots?.[0]?.url && (
                <img src={selected.screenshots[0].url} alt="Accident" style={{ width: '100%', borderRadius: 10, marginBottom: 24, border: '1px solid var(--border)' }} onError={e => e.target.style.display = 'none'} />
              )}

              {/* Status update */}
              <div style={{ padding: '16px 20px', background: 'var(--surface2)', borderRadius: 10 }}>
                <div className="label" style={{ marginBottom: 12 }}>Update Status</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['verified','responding','resolved','rejected'].map(s => (
                    <button key={s} disabled={selected.status === s || updating} className="btn" onClick={() => updateStatus(selected._id, s)} style={{ fontSize: 12, opacity: selected.status === s ? 0.4 : 1 }}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accidents;