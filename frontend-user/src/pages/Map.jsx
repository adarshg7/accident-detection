import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import Navbar from '../components/Navbar';
import AccidentMarker from '../components/AccidentMarker';
import ReportModal from '../components/ReportModal';
import useLocationHook from '../hooks/useLocation';
import useSocket from '../hooks/useSocket';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';

// User location marker icon
const userIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative">
      <div style="width:16px;height:16px;background:#4361ee;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(67,97,238,0.6)"></div>
    </div>
  `,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Component to fly to user location
const FlyTo = ({ location }) => {
  const map = useMap();
  useEffect(() => {
    if (location) map.flyTo([location.lat, location.lon], 14, { duration: 1.5 });
  }, [location, map]);
  return null;
};

// Sidebar panel for accident list
const AccidentPanel = ({ accidents, loading, onSelect, selected }) => (
  <div style={PS.panel}>
    <div style={PS.header}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Nearby Incidents</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{accidents.length} found</div>
    </div>

    <div style={PS.list}>
      {loading ? (
        <div style={PS.empty}>Loading...</div>
      ) : accidents.length === 0 ? (
        <div style={PS.empty}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          No accidents nearby
        </div>
      ) : (
        accidents.map((acc, i) => (
          <div
            key={acc._id || i}
            className="fade-up"
            style={{
              ...PS.item,
              animationDelay: `${i * 0.03}s`,
              background: selected?._id === acc._id ? 'var(--surface2)' : 'transparent',
            }}
            onClick={() => onSelect(acc)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className={`badge b-${acc.severity}`}>{acc.severity}</span>
              <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--muted)' }}>
                {new Date(acc.timestamp).toLocaleTimeString('en-IN', { hour12: true })}
              </span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 4 }}>
              {acc.description || 'Accident detected'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono' }}>
              {acc.sourceId} · <span className={`badge b-${acc.status}`} style={{ fontSize: 10, padding: '1px 6px' }}>{acc.status}</span>
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

const PS = {
  panel: { width: 300, height: '100%', background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  header: { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  list: { flex: 1, overflowY: 'auto', padding: '8px 0' },
  item: { padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' },
  empty: { padding: '60px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 },
};

// Map controls
const MapControls = ({ onLocate, onRefresh, onToggleTraffic, traffic }) => (
  <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {[
      { label: '⊕', title: 'Go to my location', onClick: onLocate },
      { label: '↺', title: 'Refresh accidents',  onClick: onRefresh },
      { label: '🚦', title: 'Toggle traffic',    onClick: onToggleTraffic, active: traffic },
    ].map(btn => (
      <button key={btn.label} title={btn.title} onClick={btn.onClick} style={{
        width: 40, height: 40,
        background: btn.active ? 'var(--accent)' : 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 9,
        color: btn.active ? '#fff' : 'var(--text)',
        cursor: 'pointer',
        fontSize: 18,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        {btn.label}
      </button>
    ))}
  </div>
);

const MapPage = () => {
  const [accidents,   setAccidents]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [showReport,  setShowReport]  = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [radius,      setRadius]      = useState(5);
  // radius = km around user to show accidents

  const { location, error: locError } = useLocationHook();
  const { connected, newAccident }    = useSocket();

  const mapRef = useRef();

  // Load nearby accidents
  const loadAccidents = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    try {
      const r = await api.get('/accidents/nearby', {
        params: { lat: location.lat, lon: location.lon, radius },
      });
      setAccidents(r.data.data || []);
    } catch {
      toast.error('Failed to load accidents');
    } finally {
      setLoading(false);
    }
  }, [location, radius]);

  useEffect(() => { loadAccidents(); }, [loadAccidents]);

  // Handle real-time new accident
  useEffect(() => {
    if (!newAccident) return;
    setAccidents(prev => {
      const exists = prev.find(a => a.accidentId === newAccident.accidentId);
      if (exists) return prev;
      toast.error(`🚨 New accident: ${newAccident.severity}`, { duration: 6000 });
      return [newAccident, ...prev];
    });
  }, [newAccident]);

  const flyToSelected = (acc) => {
    setSelected(acc);
    const map = mapRef.current;
    if (map && acc.location?.coordinates) {
      map.flyTo([acc.location.coordinates[1], acc.location.coordinates[0]], 16, { duration: 1 });
    }
  };

  // Map tile based on theme
  const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const tileLightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toaster
        position="top-right"
        toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }}
      />
      <Navbar connected={connected} onReport={() => setShowReport(true)} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Accident list panel */}
        <AccidentPanel
          accidents={accidents}
          loading={loading}
          onSelect={flyToSelected}
          selected={selected}
        />

        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer
            center={location ? [location.lat, location.lon] : [19.0760, 72.8777]}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
            ref={mapRef}
          >
            {/* Dark tile layer */}
            <TileLayer
              url={tileUrl}
              attribution='&copy; <a href="https://carto.com">CARTO</a>'
              maxZoom={19}
            />

            {/* Traffic layer (optional, free from openstreetmap) */}
            {showTraffic && (
              <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                opacity={0.3}
              />
            )}

            {/* Fly to user location */}
            {location && <FlyTo location={location} />}

            {/* User location marker */}
            {location && (
              <>
                <Marker position={[location.lat, location.lon]} icon={userIcon}>
                  <Popup><div style={{ fontSize: 13, color: 'var(--text)' }}>📍 Your location<br/><span style={{ fontSize: 11, color: 'var(--muted)' }}>±{Math.round(location.accuracy || 0)}m accuracy</span></div></Popup>
                </Marker>
                {/* Accuracy circle */}
                <Circle
                  center={[location.lat, location.lon]}
                  radius={location.accuracy || 100}
                  pathOptions={{ fillColor: '#4361ee', fillOpacity: 0.08, color: '#4361ee', weight: 1, opacity: 0.3 }}
                />
                {/* Search radius circle */}
                <Circle
                  center={[location.lat, location.lon]}
                  radius={radius * 1000}
                  pathOptions={{ fillColor: 'transparent', color: '#4361ee', weight: 1.5, opacity: 0.2, dashArray: '6 4' }}
                />
              </>
            )}

            {/* Accident markers */}
            {accidents.map((acc, i) => (
              acc.location?.coordinates && (
                <AccidentMarker key={acc._id || i} accident={acc} />
              )
            ))}
          </MapContainer>

          {/* Map controls */}
          <MapControls
            onLocate={() => location && mapRef.current?.flyTo([location.lat, location.lon], 15, { duration: 1 })}
            onRefresh={loadAccidents}
            onToggleTraffic={() => setShowTraffic(t => !t)}
            traffic={showTraffic}
          />

          {/* Radius control */}
          <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>SEARCH RADIUS</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{radius} km</span>
            </div>
            <input type="range" min={1} max={20} value={radius} onChange={e => setRadius(+e.target.value)}
              style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
          </div>

          {/* Live indicator */}
          <div style={{ position: 'absolute', bottom: 16, right: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--muted)', animation: connected ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: connected ? 'var(--green)' : 'var(--muted)' }}>
              {accidents.length} accidents · {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>

          {/* Location error */}
          {locError && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(230,57,70,0.9)', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, zIndex: 1000, whiteSpace: 'nowrap' }}>
              ⚠ {locError}
            </div>
          )}
        </div>
      </div>

      {/* Report modal */}
      {showReport && (
        <ReportModal
          location={location}
          onClose={() => setShowReport(false)}
          onSuccess={loadAccidents}
        />
      )}
    </div>
  );
};

export default MapPage;