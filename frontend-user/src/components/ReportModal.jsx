import React, { useState, useRef } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const ReportModal = ({ location, onClose, onSuccess }) => {
  const [form,     setForm]     = useState({ description: '', severity: 'MEDIUM', latitude: location?.lat || '', longitude: location?.lon || '' });
  const [photo,    setPhoto]    = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const fileRef = useRef();

  const handlePhoto = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Photo must be under 10MB'); return; }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    // URL.createObjectURL = creates temporary URL to display file preview
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.latitude || !form.longitude) { toast.error('Location required'); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      // FormData = sends files + text in multipart/form-data format
      // Required for file uploads — JSON can't carry binary files
      fd.append('description', form.description);
      fd.append('severity',    form.severity);
      fd.append('latitude',    form.latitude);
      fd.append('longitude',   form.longitude);
      if (photo) fd.append('photo', photo);

      await api.post('/accidents/report', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Accident reported. Thank you for helping!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to report');
    } finally {
      setLoading(false);
    }
  };

  const SEVS = ['LOW','MEDIUM','HIGH','CRITICAL'];
  const SEV_LABELS = { LOW: 'Minor', MEDIUM: 'Moderate', HIGH: 'Serious', CRITICAL: 'Critical' };
  const SEV_COLORS = { LOW: 'var(--green)', MEDIUM: 'var(--yellow)', HIGH: '#fb8500', CRITICAL: 'var(--danger)' };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div className="slide-up" style={S.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <h2 style={S.title}>Report Accident</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Help others by reporting what you see</p>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        <form onSubmit={submit} style={{ padding: '20px 24px' }}>
          {/* Severity selector */}
          <div style={{ marginBottom: 20 }}>
            <label className="label">Severity</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {SEVS.map(s => (
                <button key={s} type="button" onClick={() => setForm(f => ({ ...f, severity: s }))} style={{
                  padding: '10px 8px',
                  borderRadius: 9,
                  border: `2px solid ${form.severity === s ? SEV_COLORS[s] : 'var(--border)'}`,
                  background: form.severity === s ? `${SEV_COLORS[s]}18` : 'var(--surface2)',
                  color: form.severity === s ? SEV_COLORS[s] : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'JetBrains Mono',
                  transition: 'all 0.15s',
                  textAlign: 'center',
                }}>
                  {SEV_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Describe the accident — vehicles involved, injuries, road conditions..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ resize: 'vertical', minHeight: 90 }}
            />
          </div>

          {/* Location */}
          <div style={{ marginBottom: 20 }}>
            <label className="label">Location</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <input className="input" type="number" step="any" placeholder="Latitude" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} required />
              </div>
              <div>
                <input className="input" type="number" step="any" placeholder="Longitude" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} required />
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => setForm(f => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude })),
                    () => toast.error('Failed to get location. Please allow location access.')
                  );
                } else {
                  toast.error('Geolocation is not supported by this browser.');
                }
              }} 
              style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              ⊕ Use my current location
            </button>
          </div>

          {/* Photo upload */}
          <div style={{ marginBottom: 24 }}>
            <label className="label">Photo (Optional)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />

            {preview ? (
              <div style={{ position: 'relative' }}>
                <img src={preview} alt="Preview" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--border)' }} />
                <button type="button" onClick={() => { setPhoto(null); setPreview(null); }} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 13 }}>✕</button>
              </div>
            ) : (
              <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed var(--border2)', borderRadius: 9, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Tap to add photo</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Max 10MB</div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading} className="btn btn-danger" style={{ width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600 }}>
            {loading ? 'Submitting...' : '🚨 Submit Report'}
          </button>
        </form>
      </div>
    </div>
  );
};

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 9000, padding: '0 0 0 0' },
  modal: { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 },
  title: { fontSize: 18, fontWeight: 700 },
  closeBtn: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 },
};

export default ReportModal;