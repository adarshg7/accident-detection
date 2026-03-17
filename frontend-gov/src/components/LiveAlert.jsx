import React, { useEffect } from 'react';

const LiveAlert = ({ accident, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = { LOW: 'var(--green)', MEDIUM: 'var(--yellow)', HIGH: '#fb8500', CRITICAL: 'var(--red)' };
  const color = colors[accident?.severity] || 'var(--blue)';

  return (
    <div className="slide-right" style={{ ...S.wrap, borderLeftColor: color }}>
      <div style={S.top}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'JetBrains Mono', letterSpacing: 0.5 }}>ACCIDENT DETECTED</span>
        </div>
        <button onClick={onClose} style={S.close}>✕</button>
      </div>
      <div style={S.body}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <span className={`badge b-${accident?.severity}`}>{accident?.severity}</span>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--muted)' }}>{accident?.sourceId}</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)', marginBottom: 4 }}>
          {accident?.description}
        </div>
        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--muted)' }}>
          {accident?.timestamp ? new Date(accident.timestamp).toLocaleTimeString() : ''}
        </div>
      </div>
      {/* Progress */}
      <div style={S.barBg}>
        <div style={{ ...S.bar, background: color, animation: 'progressShrink 8s linear forwards' }} />
      </div>
      <style>{`@keyframes progressShrink { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  );
};

const S = {
  wrap: {
    width: 320,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderLeft: '3px solid',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  top: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px 8px',
    borderBottom: '1px solid var(--border)',
  },
  body: { padding: '10px 14px' },
  close: { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 },
  barBg: { height: 3, background: 'var(--border)' },
  bar: { height: '100%' },
};

export default LiveAlert;