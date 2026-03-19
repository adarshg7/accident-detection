import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';
import useSocket from '../hooks/useSocket';

const Profile = () => {
  const { user, logout, updateUser } = useAuth();
  const { theme, toggle }            = useTheme();
  const { connected }                = useSocket();
  const navigate                     = useNavigate();

  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const r = await api.put('/auth/user/profile', form);
      updateUser(r.data.user);
      toast.success('Profile updated');
      setEditing(false);
    } catch { toast.error('Update failed'); }
    finally { setLoading(false); }
  };

  const Section = ({ title, children }) => (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{title}</div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );

  const Row = ({ label, value, action }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14 }}>{value || '—'}</div>
      </div>
      {action}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 20px' }}>
        {/* Avatar header */}
        <div className="card fade-up" style={{ padding: 28, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7b5ea7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {user?.avatar
              ? <img src={user.avatar} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
              : user?.name?.[0]?.toUpperCase()
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{user?.name}</h1>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{user?.email}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="badge b-LOW" style={{ fontSize: 10 }}>Verified User</span>
              {user?.authProvider === 'google' && <span className="badge b-MEDIUM" style={{ fontSize: 10 }}>Google</span>}
            </div>
          </div>
        </div>

        {/* Profile info */}
        <Section title="Personal Information">
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 9876543210" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-accent" onClick={save} disabled={loading} style={{ flex: 1 }}>{loading ? 'Saving...' : 'Save'}</button>
                <button className="btn" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <Row label="Name"  value={user?.name}  action={<button className="btn" onClick={() => setEditing(true)} style={{ padding: '6px 14px', fontSize: 12 }}>Edit</button>} />
              <Row label="Email" value={user?.email} />
              <Row label="Phone" value={user?.phone} />
              <Row label="Member since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : '—'} />
            </>
          )}
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Theme</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</div>
            </div>
            <button className="btn" onClick={toggle} style={{ gap: 8 }}>
              {theme === 'dark' ? '☀ Light' : '◑ Dark'}
            </button>
          </div>
        </Section>

        {/* Future features — ready to build on */}
        <Section title="Vehicle & Documents">
          <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 9, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🚗</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Vehicle Details Coming Soon</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              Link your vehicle, view challans, insurance status, and maintenance records.
            </div>
          </div>
        </Section>

        {/* Car system integration */}
        <Section title="Car System Integration">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '14px 16px', background: 'var(--surface2)', borderRadius: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Android Auto / CarPlay</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Connect for in-car accident alerts</div>
              </div>
              <span className="badge b-MEDIUM">Soon</span>
            </div>
            <div style={{ padding: '14px 16px', background: 'var(--surface2)', borderRadius: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>OBD-II Integration</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Auto-detect and report accidents</div>
              </div>
              <span className="badge b-MEDIUM">Soon</span>
            </div>
          </div>
        </Section>

        {/* Danger zone */}
        <Section title="Account">
          <button
            className="btn"
            onClick={async () => { await logout(); navigate('/login'); }}
            style={{ width: '100%', color: 'var(--danger)', borderColor: 'rgba(230,57,70,0.3)' }}
          >
            Sign Out
          </button>
        </Section>
      </div>
    </div>
  );
};

export default Profile;