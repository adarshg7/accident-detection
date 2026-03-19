import React, { useState, useEffect } from 'react';

import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';

const TABS = ['vehicles', 'challans', 'insurance'];

const Vehicles = () => {
  const [tab,       setTab]       = useState('vehicles');
  const [vehicles,  setVehicles]  = useState([]);
  const [challans,  setChallans]  = useState([]);
  const [insurance, setInsurance] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({});

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [v, c, i] = await Promise.all([
        api.get('/vehicles'),
        api.get('/vehicles/challans'),
        api.get('/vehicles/insurance'),
      ]);
      setVehicles(v.data.data  || []);
      setChallans(c.data.data  || []);
      setInsurance(i.data.data || []);
    } catch (e) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const addVehicle = async e => {
    e.preventDefault();
    try {
      await api.post('/vehicles', form);
      toast.success('Vehicle added');
      setShowForm(false);
      setForm({});
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const removeVehicle = async id => {
    if (!window.confirm('Remove this vehicle?')) return;
    try {
      await api.delete(`/vehicles/${id}`);
      toast.success('Vehicle removed');
      loadAll();
    } catch (e) {
      toast.error('Failed to remove');
    }
  };

  const payChallan = async id => {
    try {
      await api.patch(`/vehicles/challans/${id}/pay`);
      toast.success('Marked as paid');
      loadAll();
    } catch (e) {
      toast.error('Failed');
    }
  };

  const VEHICLE_TYPES = ['car','bike','truck','bus','auto','other'];

  return (
    <div style={S.page}>
      <Toaster position="top-center" />

      <div style={S.content}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <h1 style={S.title}>My Vehicles</h1>
            <p style={S.sub}>Manage your vehicles, challans and insurance</p>
          </div>
          <button className="btn btn-accent" onClick={() => setShowForm(true)}>
            + Add Vehicle
          </button>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...S.tab,
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color:        tab === t ? 'var(--text)' : 'var(--muted)',
              fontWeight:   tab === t ? 700 : 500,
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'challans' && challans.filter(c => c.status === 'pending').length > 0 && (
                <span style={S.badge}>
                  {challans.filter(c => c.status === 'pending').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={S.empty}>Loading...</div>
        ) : (
          <>
            {/* ── VEHICLES TAB ── */}
            {tab === 'vehicles' && (
              <div style={S.grid}>
                {vehicles.length === 0 ? (
                  <div style={S.emptyCard}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>No vehicles added</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Add your vehicle to track challans and insurance</div>
                  </div>
                ) : (
                  vehicles.map(v => (
                    <div key={v._id} className="card fade-up" style={S.vehicleCard}>
                      <div style={S.plateRow}>
                        <div style={S.plate}>{v.plateNumber}</div>
                        <button onClick={() => removeVehicle(v._id)} style={S.deleteBtn}>✕</button>
                      </div>
                      <div style={S.vehicleInfo}>
                        <div style={S.infoRow}>
                          <span style={S.infoLabel}>Type</span>
                          <span style={S.infoValue}>{v.type}</span>
                        </div>
                        <div style={S.infoRow}>
                          <span style={S.infoLabel}>Model</span>
                          <span style={S.infoValue}>{v.model}</span>
                        </div>
                        {v.year && (
                          <div style={S.infoRow}>
                            <span style={S.infoLabel}>Year</span>
                            <span style={S.infoValue}>{v.year}</span>
                          </div>
                        )}
                        {v.color && (
                          <div style={S.infoRow}>
                            <span style={S.infoLabel}>Color</span>
                            <span style={S.infoValue}>{v.color}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── CHALLANS TAB ── */}
            {tab === 'challans' && (
              <div>
                {challans.length === 0 ? (
                  <div style={S.emptyCard}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                    <div style={{ fontWeight: 600 }}>No challans</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>You have no traffic violations on record</div>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div style={S.summaryRow}>
                      <div className="card" style={S.summaryCard}>
                        <div style={S.summaryLabel}>Total Challans</div>
                        <div style={S.summaryValue}>{challans.length}</div>
                      </div>
                      <div className="card" style={S.summaryCard}>
                        <div style={S.summaryLabel}>Pending Amount</div>
                        <div style={{ ...S.summaryValue, color: 'var(--accent)' }}>
                          ₹{challans.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="card" style={S.summaryCard}>
                        <div style={S.summaryLabel}>Paid</div>
                        <div style={{ ...S.summaryValue, color: 'var(--green)' }}>
                          {challans.filter(c => c.status === 'paid').length}
                        </div>
                      </div>
                    </div>

                    {/* List */}
                    {challans.map(c => (
                      <div key={c._id} className="card fade-up" style={S.challanCard}>
                        <div style={S.challanTop}>
                          <div>
                            <div style={S.challanId}>#{c.challanId}</div>
                            <div style={S.challanOffense}>{c.offense || 'Traffic Violation'}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: c.status === 'paid' ? 'var(--green)' : 'var(--accent)' }}>
                              ₹{c.amount?.toLocaleString('en-IN')}
                            </div>
                            <span style={{
                              fontSize: 11,
                              padding: '2px 10px',
                              borderRadius: 20,
                              background: c.status === 'paid' ? 'rgba(22,163,74,0.1)' : 'rgba(230,57,70,0.1)',
                              color: c.status === 'paid' ? 'var(--green)' : 'var(--accent)',
                              fontWeight: 600,
                            }}>
                              {c.status?.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div style={S.challanDetails}>
                          {c.plateNumber && <span>🚗 {c.plateNumber}</span>}
                          {c.location    && <span>📍 {c.location}</span>}
                          {c.date        && <span>📅 {new Date(c.date).toLocaleDateString('en-IN')}</span>}
                        </div>

                        {c.status === 'pending' && (
                          <button
                            className="btn btn-accent"
                            onClick={() => payChallan(c._id)}
                            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                          >
                            Mark as Paid
                          </button>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ── INSURANCE TAB ── */}
            {tab === 'insurance' && (
              <div style={S.grid}>
                {insurance.length === 0 ? (
                  <div style={S.emptyCard}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🛡</div>
                    <div style={{ fontWeight: 600 }}>No insurance records</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>Add your vehicle insurance to track expiry</div>
                  </div>
                ) : (
                  insurance.map(ins => (
                    <div key={ins._id} className="card fade-up" style={{
                      ...S.vehicleCard,
                      borderTop: `3px solid ${
                        ins.expiryStatus === 'expired'       ? 'var(--accent)' :
                        ins.expiryStatus === 'expiring_soon' ? 'var(--yellow)' :
                        'var(--green)'
                      }`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{ins.provider}</div>
                        <span style={{
                          fontSize: 11,
                          padding: '2px 10px',
                          borderRadius: 20,
                          background:
                            ins.expiryStatus === 'expired'       ? 'rgba(230,57,70,0.1)' :
                            ins.expiryStatus === 'expiring_soon' ? 'rgba(217,119,6,0.1)' :
                            'rgba(22,163,74,0.1)',
                          color:
                            ins.expiryStatus === 'expired'       ? 'var(--accent)' :
                            ins.expiryStatus === 'expiring_soon' ? 'var(--yellow)' :
                            'var(--green)',
                          fontWeight: 600,
                        }}>
                          {ins.expiryStatus === 'expired'       ? 'EXPIRED' :
                           ins.expiryStatus === 'expiring_soon' ? `${ins.daysLeft}d left` :
                           'ACTIVE'}
                        </span>
                      </div>
                      <div style={S.vehicleInfo}>
                        <div style={S.infoRow}>
                          <span style={S.infoLabel}>Policy No.</span>
                          <span style={{ ...S.infoValue, fontFamily: 'Inconsolata', fontSize: 13 }}>{ins.policyNumber}</span>
                        </div>
                        <div style={S.infoRow}>
                          <span style={S.infoLabel}>Type</span>
                          <span style={S.infoValue}>{ins.type?.replace(/_/g, ' ')}</span>
                        </div>
                        <div style={S.infoRow}>
                          <span style={S.infoLabel}>Expires</span>
                          <span style={S.infoValue}>{new Date(ins.expiryDate).toLocaleDateString('en-IN')}</span>
                        </div>
                        {ins.premium > 0 && (
                          <div style={S.infoRow}>
                            <span style={S.infoLabel}>Premium</span>
                            <span style={S.infoValue}>₹{ins.premium?.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add Vehicle Modal ── */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add Vehicle</h2>
              <button onClick={() => setShowForm(false)} style={S.closeBtn}>✕</button>
            </div>

            <form onSubmit={addVehicle} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={S.formGrid}>
                <div>
                  <label className="label">Plate Number *</label>
                  <input className="input" placeholder="MH01AB1234" value={form.plateNumber || ''} onChange={e => setForm(p => ({ ...p, plateNumber: e.target.value.toUpperCase() }))} required />
                </div>
                <div>
                  <label className="label">Vehicle Type *</label>
                  <select className="input" value={form.type || ''} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} required style={{ cursor: 'pointer' }}>
                    <option value="">Select type</option>
                    {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Model *</label>
                <input className="input" placeholder="Honda City, Royal Enfield, etc." value={form.model || ''} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} required />
              </div>

              <div style={S.formGrid}>
                <div>
                  <label className="label">Year</label>
                  <input className="input" type="number" placeholder="2022" min="1990" max={new Date().getFullYear()} value={form.year || ''} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Color</label>
                  <input className="input" placeholder="White, Black, etc." value={form.color || ''} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} />
                </div>
              </div>

              <button type="submit" className="btn btn-accent" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 15 }}>
                Add Vehicle
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const S = {
  page:    { minHeight: '100vh', background: 'var(--bg)' },
  content: { maxWidth: 900, margin: '0 auto', padding: '80px 20px 40px' },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:   { fontSize: 26, fontWeight: 800 },
  sub:     { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  tabs:    { display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 },
  tab:     { padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'Outfit', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8 },
  badge:   { background: 'var(--accent)', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  grid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  vehicleCard: { padding: 20, overflow: 'hidden' },
  plateRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  plate:       { fontFamily: 'Inconsolata', fontSize: 18, fontWeight: 700, letterSpacing: 2, background: 'var(--surface2)', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border2)' },
  deleteBtn:   { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: 4 },
  vehicleInfo: { display: 'flex', flexDirection: 'column', gap: 8 },
  infoRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 },
  infoLabel:   { color: 'var(--muted)', fontWeight: 500 },
  infoValue:   { fontWeight: 600, textTransform: 'capitalize' },
  summaryRow:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 },
  summaryCard: { padding: '14px 18px', textAlign: 'center' },
  summaryLabel:{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 },
  summaryValue:{ fontSize: 22, fontWeight: 800 },
  challanCard: { padding: 18, marginBottom: 12 },
  challanTop:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  challanId:   { fontFamily: 'Inconsolata', fontSize: 13, color: 'var(--muted)', marginBottom: 4 },
  challanOffense: { fontSize: 14, fontWeight: 600 },
  challanDetails: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' },
  emptyCard:   { gridColumn: '1/-1', padding: '60px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' },
  empty:       { padding: 60, textAlign: 'center', color: 'var(--muted)' },
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal:       { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)' },
  closeBtn:    { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 },
  formGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
};

export default Vehicles;