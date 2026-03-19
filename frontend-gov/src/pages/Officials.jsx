import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Officials = () => {
  const [officials, setOfficials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const { official: currentAdmin } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/auth/gov/officials');
      setOfficials(r.data.officials || []);
    } catch {
      toast.error('Failed to load officials');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    setUpdating(true);
    try {
      await api.patch(`/auth/gov/approve/${id}`);
      toast.success('Official approved');
      load();
    } catch {
      toast.error('Approval failed');
    } finally {
      setUpdating(false);
    }
  };

  const updateRole = async (id, role) => {
    setUpdating(true);
    try {
      await api.patch(`/auth/gov/role/${id}`, { role });
      toast.success(`Role updated to ${role}`);
      load();
    } catch {
      toast.error('Failed to update role');
    } finally {
      setUpdating(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Are you sure you want to remove this official?')) return;
    setUpdating(true);
    try {
      await api.delete(`/auth/gov/${id}`);
      toast.success('Official removed');
      load();
    } catch {
      toast.error('Deletion failed');
    } finally {
      setUpdating(false);
    }
  };

  const ActionBtn = ({ onClick, children, color = 'var(--surface2)', disabled }) => (
    <button 
      onClick={onClick} 
      disabled={disabled || updating}
      className="btn" 
      style={{ padding: '6px 12px', fontSize: 12, background: color, color: color === 'var(--surface2)' ? 'var(--text)' : '#fff', borderColor: color === 'var(--surface2)' ? 'var(--border)' : color }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />
      <Header title="Officials Management" subtitle="Manage government accounts and approvals" />

      <div style={{ padding: 24 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                {['Official', 'Department', 'Status', 'Role', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '14px 20px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading...</td></tr>
              ) : officials.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>No officials registered</td></tr>
              ) : (
                officials.map((off) => (
                  <tr key={off._id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{off.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{off.email}</div>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: 13, textTransform: 'capitalize' }}>
                      {off.department?.replace(/_/g, ' ')}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span className={`badge ${off.isApproved ? 'b-verified' : 'b-rejected'}`}>
                        {off.isApproved ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--surface2)', color: 'var(--muted)', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
                        {off.role}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {!off.isApproved && (
                          <ActionBtn onClick={() => approve(off._id)} color="var(--green)">Approve</ActionBtn>
                        )}
                        {off._id !== currentAdmin.id && (
                          <>
                            {off.role !== 'admin' ? (
                              <ActionBtn onClick={() => updateRole(off._id, 'admin')}>Promote Admin</ActionBtn>
                            ) : (
                              <ActionBtn onClick={() => updateRole(off._id, 'official')}>Demote</ActionBtn>
                            )}
                            <ActionBtn onClick={() => remove(off._id)} color="var(--red)">Remove</ActionBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div style={{ marginTop: 20, padding: 16, background: 'rgba(67,97,238,0.05)', borderRadius: 10, border: '1px dashed rgba(67,97,238,0.2)' }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>Note:</span> New government officials cannot access accident data or live cameras until they are approved by an administrator. Administrators can also promote trusted officials to the Admin role.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Officials;
