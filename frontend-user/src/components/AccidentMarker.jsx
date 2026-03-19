import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// SVG pin icon for severity levels
const makeIcon = (color, isCameraDetected) => L.divIcon({
  className: '',
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="
        width:34px;height:34px;
        background:${color};
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:2.5px solid rgba(255,255,255,0.85);
        box-shadow:0 4px 16px ${color}70;
        display:flex;align-items:center;justify-content:center;
        position:relative;
      ">
        ${isCameraDetected
          ? `<svg style="transform:rotate(45deg)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`
          : `<svg style="transform:rotate(45deg)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
        }
      </div>
      <div style="width:2px;height:6px;background:${color};opacity:0.7;margin-top:-1px;"></div>
      <div style="width:6px;height:6px;background:${color};border-radius:50%;opacity:0.5;"></div>
    </div>
  `,
  iconSize: [34, 50],
  iconAnchor: [17, 50],
  popupAnchor: [0, -52],
});

const COLORS = {
  LOW:      '#2dc653',
  MEDIUM:   '#f4a261',
  HIGH:     '#fb8500',
  CRITICAL: '#e63946',
};

const SEV_LABELS = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical',
};

const AccidentMarker = ({ accident, onVerify }) => {
  const isCameraDetected = !!accident.sourceId;
  const color  = COLORS[accident.severity] || '#4361ee';
  const icon   = makeIcon(color, isCameraDetected);
  const time   = new Date(accident.timestamp).toLocaleTimeString('en-IN', { hour12: true });
  const date   = new Date(accident.timestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  const lat    = accident.location.coordinates[1];
  const lng    = accident.location.coordinates[0];
  const gmLink = `https://maps.google.com/?q=${lat},${lng}`;

  return (
    <Marker position={[lat, lng]} icon={icon}>
      <Popup minWidth={240} maxWidth={300}>
        <div style={{ fontFamily:"'Outfit',sans-serif" }}>

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span className={`badge b-${accident.severity}`}>
              {SEV_LABELS[accident.severity] || accident.severity}
            </span>
            {isCameraDetected && (
              <span style={{
                fontSize:10, fontWeight:600, padding:'2px 8px',
                background:'rgba(67,97,238,0.12)', color:'var(--accent)',
                borderRadius:12, border:'1px solid rgba(67,97,238,0.25)',
                letterSpacing:0.3,
              }}>
                CAMERA
              </span>
            )}
          </div>

          {/* Description */}
          <div style={{ fontSize:13, lineHeight:1.55, marginBottom:10, color:'var(--text)' }}>
            {accident.description || 'Accident detected at this location'}
          </div>

          {/* Screenshot */}
          {accident.screenshots?.[0]?.url && (
            <img
              src={accident.screenshots[0].url}
              alt="Accident screenshot"
              style={{ width:'100%', borderRadius:8, marginBottom:10, border:'1px solid var(--border)', display:'block' }}
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}

          {/* Meta */}
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12, lineHeight:1.7 }}>
            <div>{date} · {time}</div>
            {accident.sourceId && <div style={{ fontFamily:'JetBrains Mono, monospace' }}>Camera: {accident.sourceId}</div>}
            <div style={{ fontFamily:'JetBrains Mono, monospace' }}>{lat.toFixed(5)}, {lng.toFixed(5)}</div>
          </div>

          {/* Status + Actions */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
            <span className={`badge b-status-${(accident.status||'ACTIVE').toLowerCase()}`}>
              {accident.status || 'Active'}
            </span>
            <a
              href={gmLink}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize:12, color:'var(--accent)', textDecoration:'none',
                fontWeight:600, display:'flex', alignItems:'center', gap:4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Google Maps
            </a>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

export default AccidentMarker;