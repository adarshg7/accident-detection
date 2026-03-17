import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Custom SVG markers for different severities
const makeIcon = (color) => L.divIcon({
  className: '',
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background: ${color};
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="transform: rotate(45deg); font-size: 14px; margin-top: -2px">⚠</div>
    </div>
    <div style="
      width: 8px;
      height: 8px;
      background: ${color};
      border-radius: 50%;
      margin: -4px auto 0;
      opacity: 0.5;
    "></div>
  `,
  iconSize: [36, 48],
  iconAnchor: [18, 48],
  popupAnchor: [0, -48],
});

const COLORS = {
  LOW:      '#2dc653',
  MEDIUM:   '#f4a261',
  HIGH:     '#fb8500',
  CRITICAL: '#e63946',
};

const AccidentMarker = ({ accident, onVerify }) => {
  const color = COLORS[accident.severity] || '#4361ee';
  const icon  = makeIcon(color);
  const time  = new Date(accident.timestamp).toLocaleTimeString('en-IN', { hour12: true });
  const date  = new Date(accident.timestamp).toLocaleDateString('en-IN');

  return (
    <Marker position={[accident.location.coordinates[1], accident.location.coordinates[0]]} icon={icon}>
      {/* Leaflet uses [lat, lon] but our DB stores [lon, lat] (GeoJSON) */}
      <Popup>
        <div style={{ minWidth: 220 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className={`badge b-${accident.severity}`}>{accident.severity}</span>
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--muted)' }}>{time}</span>
          </div>

          {/* Description */}
          <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10, color: 'var(--text)' }}>
            {accident.description || 'Accident detected'}
          </div>

          {/* Meta */}
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono', marginBottom: 10 }}>
            {accident.sourceId} · {date}
          </div>

          {/* Screenshot thumbnail */}
          {accident.screenshots?.[0]?.url && (
            <img
              src={accident.screenshots[0].url}
              alt="Accident"
              style={{ width: '100%', borderRadius: 8, marginBottom: 10, border: '1px solid var(--border)' }}
              onError={e => e.target.style.display = 'none'}
            />
          )}

          {/* Status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`badge b-${accident.status}`}>{accident.status}</span>
            
              href={`https://maps.google.com/?q=${accident.location.coordinates[1]},${accident.location.coordinates[0]}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
            <a>
              Open in Maps →
            </a>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

export default AccidentMarker;