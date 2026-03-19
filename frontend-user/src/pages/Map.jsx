// ================================================================
// MapView.jsx — Live Traffic + Routing + Accident Heatmap
// ================================================================
//
//  Map tiles    → OpenStreetMap        (free, no key)
//  Traffic tiles→ TomTom Traffic API   (free, email signup only)
//  Routing      → OpenRouteService     (free, email signup only)
//  Geocoding    → Nominatim            (free, no key)
//  Autocomplete → Photon API           (free, no key)
//  Heatmap      → Leaflet.heat         (free, no key)
//  GPS          → Browser API          (free, built-in)
//  Accidents    → Your backend         (your own server)
//
// Install:
//   npm install leaflet react-leaflet axios react-hot-toast leaflet.heat
//
// .env:
//   REACT_APP_API_URL=http://localhost:5000/api
//   REACT_APP_TOMTOM_KEY=your_tomtom_key_here
//   REACT_APP_ORS_KEY=your_openrouteservice_key_here
//
// Get FREE keys (no credit card):
//   TomTom  → developer.tomtom.com      (2500 req/day free)
//   ORS     → openrouteservice.org      (2000 req/day free)
//
// ================================================================

import React, {
  useEffect, useRef, useState, useCallback, useMemo
} from 'react';
import {
  MapContainer, TileLayer,
  Polyline, Marker, useMap, ZoomControl
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import AccidentMarker from '../components/AccidentMarker';

// ── ENV ───────────────────────────────────────────────────────────────────
const API           = process.env.REACT_APP_API_URL     || 'http://localhost:5000/api';
const TOMTOM_KEY    = process.env.REACT_APP_TOMTOM_KEY  || '';
const ORS_KEY       = process.env.REACT_APP_ORS_KEY     || '';
const GEOAPIFY_KEY  = process.env.REACT_APP_GEOAPIFY_KEY || '';

// Fix Leaflet default icon paths in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Severity config ───────────────────────────────────────────────────────
const SEV = {
  LOW:      { color:'#10b981', fill:'#10b98130', label:'Low',      icon:'🟢', radius:8  },
  MEDIUM:   { color:'#f59e0b', fill:'#f59e0b30', label:'Medium',   icon:'🟡', radius:11 },
  HIGH:     { color:'#f97316', fill:'#f9731630', label:'High',     icon:'🟠', radius:14 },
  CRITICAL: { color:'#ef4444', fill:'#ef444430', label:'Critical', icon:'🔴', radius:17 },
};

const TABS = ['Route', 'Traffic', 'Accidents', 'Stats'];

// ─────────────────────────────────────────────────────────────────────────
// FREE API HELPERS
// ─────────────────────────────────────────────────────────────────────────

// Geoapify geocoding — better India coverage, fuzzy matching
async function geocode(query) {
  const q = query.trim();
  if (!q) return null;

  // Direct coordinates
  const pts = q.split(',').map(s => s.trim());
  if (pts.length === 2) {
    const a = parseFloat(pts[0]), b = parseFloat(pts[1]);
    if (!isNaN(a) && !isNaN(b) && Math.abs(a) <= 90)
      return { lat:a, lon:b, display:`${a}, ${b}` };
  }

  try {
    const res = await fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(q)}&filter=countrycode:in&limit=1&apiKey=${GEOAPIFY_KEY}`
    );
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) {
      const gmUrl = `https://maps.google.com/search?q=${encodeURIComponent(q)}`;
      toast(
        <span style={{ fontSize:13 }}>
          Not found: "{q}"  
          <a href={gmUrl} target="_blank" rel="noreferrer"
            style={{ color:'var(--accent)', fontWeight:600 }}>Open in Google Maps →</a>
        </span>,
        { duration:6000, icon:'⚠️' }
      );
      return null;
    }
    return {
      lat:     feat.properties.lat,
      lon:     feat.properties.lon,
      display: feat.properties.formatted,
    };
  } catch { toast.error('Geocoding failed'); return null; }
}

// Geoapify autocomplete — "as you type" suggestions
async function fetchSuggestions(q) {
  if (!q || q.length < 2) return [];
  try {
    const res = await fetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&filter=countrycode:in&limit=6&apiKey=${GEOAPIFY_KEY}`
    );
    return (await res.json()).features || [];
  } catch { return []; }
}

// Speed → traffic colour
function speedColor(kmh) {
  if (kmh >= 45) return '#10b981';
  if (kmh >= 20) return '#f59e0b';
  return '#ef4444';
}

// OpenRouteService routing — returns full coords + per-step coloured segments
async function getORSRoute(sLat, sLon, eLat, eLon) {
  if (!ORS_KEY) throw new Error('REACT_APP_ORS_KEY not set in .env');
  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':ORS_KEY },
    body: JSON.stringify({
      coordinates:  [[sLon,sLat],[eLon,eLat]],
      instructions: true,
      preference:   'recommended',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error?.message || `ORS HTTP ${res.status}`);
  }
  const data  = await res.json();
  const route = data.features?.[0];
  if (!route) throw new Error('No route returned');

  const allCoords = route.geometry.coordinates.map(([lng,lat])=>[lat,lng]);
  const coloredSegs = [];
  const steps = route.properties.segments?.[0]?.steps || [];
  steps.forEach(step => {
    const [startIdx,endIdx] = step.way_points;
    const pts = allCoords.slice(startIdx, endIdx+1);
    if (pts.length < 2) return;
    const speedKmh = (step.distance/1000)/(step.duration/3600);
    coloredSegs.push({ coords:pts, color:speedColor(speedKmh) });
  });

  const props = route.properties.summary;
  const m = Math.round(props.duration/60);
  return {
    coords:      allCoords,
    coloredSegs,
    distance:    (props.distance/1000).toFixed(1)+' km',
    duration:    m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m} min`,
  };
}

// ── Map controller — flyTo on state change ────────────────────────────────
function MapController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target.pos, target.zoom || 14, { duration: 1.2 });
  }, [target]); // eslint-disable-line
  return null;
}

// ── Traffic layer controller ──────────────────────────────────────────────
function TrafficLayerController({ enabled, tomtomKey, style }) {
  const map   = useMap();
  const layer = useRef(null);

  useEffect(() => {
    if (!tomtomKey) return;
    const STYLES = {
      flow:      `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtomKey}`,
      incidents: `https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${tomtomKey}`,
    };

    if (enabled) {
      layer.current = L.tileLayer(STYLES[style] || STYLES.flow, {
        opacity:    0.8,
        maxZoom:    22,
        attribution: '© TomTom Traffic',
      });
      layer.current.addTo(map);
    } else {
      if (layer.current) { map.removeLayer(layer.current); layer.current = null; }
    }
    return () => { if (layer.current) { map.removeLayer(layer.current); layer.current = null; } };
  }, [enabled, style, tomtomKey]); // eslint-disable-line

  return null;
}

// ── Heatmap layer controller ──────────────────────────────────────────────
function HeatmapController({ points, enabled, intensity }) {
  const map   = useMap();
  const layer = useRef(null);

  useEffect(() => {
    if (layer.current) { map.removeLayer(layer.current); layer.current = null; }
    if (!enabled || !points.length) return;

    // Each point: [lat, lng, intensity]
    // Weight critical accidents more
    layer.current = L.heatLayer(points, {
      radius:    intensity === 'high' ? 35 : 25,
      blur:      intensity === 'high' ? 20 : 15,
      maxZoom:   18,
      max:       1.0,
      gradient: {
        0.0: '#1e3a5f',
        0.3: '#10b981',
        0.5: '#f59e0b',
        0.7: '#f97316',
        1.0: '#ef4444',
      },
    });
    layer.current.addTo(map);

    return () => { if (layer.current) { map.removeLayer(layer.current); layer.current = null; } };
  }, [points, enabled, intensity]); // eslint-disable-line

  return null;
}

// ── Custom pin icon factory ───────────────────────────────────────────────
const makePin = (color, label) => L.divIcon({
  className: '',
  html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
    <div style="background:${color};color:#fff;padding:4px 11px;border-radius:16px;font-size:11px;font-weight:700;box-shadow:0 4px 12px ${color}70;white-space:nowrap;font-family:sans-serif;max-width:170px;overflow:hidden;text-overflow:ellipsis">${label}</div>
    <div style="width:2px;height:7px;background:${color}"></div>
    <div style="width:8px;height:8px;background:${color};border-radius:50%;margin-top:0px"></div>
  </div>`,
  iconSize:[180,46], iconAnchor:[90,46],
});

const userIcon = L.divIcon({
  className: '',
  html:`<div style="position:relative;width:18px;height:18px">
    <div style="position:absolute;inset:0;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(59,130,246,0.25)"></div>
  </div>`,
  iconSize:[18,18], iconAnchor:[9,9],
});

// ═══════════════════════════════════════════════════════════════════════════
export default function MapView() {
  // Map state
  const [userPos,      setUserPos]     = useState(null);
  const [mapTarget,    setMapTarget]   = useState(null);

  // Accidents
  const [accidents,    setAccidents]   = useState([]);
  const [selected,     setSelected]    = useState(null);
  const [radius,       setRadius]      = useState(10);
  const [sevFilter,    setSevFilter]   = useState('all');
  const [lastRefresh,  setLastRefresh] = useState(null);
  const [liveOn,       setLiveOn]      = useState(false);

  // Route
  const [origin,       setOrigin]      = useState('');
  const [dest,         setDest]        = useState('');
  const [routeCoords,  setRouteCoords] = useState(null);
  const [routeSegs,    setRouteSegs]   = useState([]);
  const [routeInfo,    setRouteInfo]   = useState(null);
  const [routeLoad,    setRouteLoad]   = useState(false);
  const [routePins,    setRoutePins]   = useState([]);
  const [routeMode,    setRouteMode]   = useState('recommended'); // recommended | fastest | shortest

  // Traffic
  const [trafficFlow,  setTrafficFlow]  = useState(false);
  const [trafficInc,   setTrafficInc]   = useState(false);
  const [heatmapOn,    setHeatmapOn]    = useState(true);
  const [heatIntensity,setHeatIntensity]= useState('medium');

  // Search / UI
  const [searchQ,      setSearchQ]     = useState('');
  const [searchLoad,   setSearchLoad]  = useState(false);
  const [searchPin,    setSearchPin]   = useState(null);
  const [activeTab,    setActiveTab]   = useState('Route');
  const [sidebar,      setSidebar]     = useState(true);
  const [originSugg,   setOriginSugg]  = useState([]);
  const [destSugg,     setDestSugg]    = useState([]);
  const [searchSugg,   setSearchSugg]  = useState([]);
  const [focusField,   setFocusField]  = useState(null);

  const watchRef   = useRef(null);
  const refreshRef = useRef(null);
  const debRef     = useRef({});

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const bySev = { LOW:0, MEDIUM:0, HIGH:0, CRITICAL:0 };
    accidents.forEach(a => { if (bySev[a.severity] !== undefined) bySev[a.severity]++; });
    return {
      total:  accidents.length,
      bySev,
      recent: accidents.filter(a => Date.now()-new Date(a.timestamp).getTime() < 3_600_000).length,
    };
  }, [accidents]);

  // ── Heatmap points from accidents ────────────────────────────────────────
  const heatPoints = useMemo(() => {
    const weights = { LOW:0.25, MEDIUM:0.5, HIGH:0.75, CRITICAL:1.0 };
    return accidents
      .filter(a => a.location?.coordinates)
      .map(a => {
        const [lng, lat] = a.location.coordinates;
        return [lat, lng, weights[a.severity] || 0.5];
      });
  }, [accidents]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      p => setUserPos([p.coords.latitude, p.coords.longitude]),
      e => console.warn('GPS:', e.message),
      { enableHighAccuracy:true, maximumAge:4000 }
    );
    return () => navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  // ── Live refresh ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (liveOn) refreshRef.current = setInterval(fetchAccidents, 15000);
    else        clearInterval(refreshRef.current);
    return () => clearInterval(refreshRef.current);
  }, [liveOn, radius, userPos]); // eslint-disable-line

  // ── Fetch accidents ───────────────────────────────────────────────────────
  const fetchAccidents = useCallback(async () => {
    try {
      const lat = userPos?.[0] ?? 20.5937, lon = userPos?.[1] ?? 78.9629;
      const tkn = localStorage.getItem('user_token');
      const res = await axios.get(`${API}/accidents/nearby`, {
        params:  { lat, lon, radius },
        headers: tkn ? { Authorization:`Bearer ${tkn}` } : {},
      });
      setAccidents(res.data.data || []);
      setLastRefresh(new Date());
    } catch(e) { console.error('Accidents:', e.message); }
  }, [radius, userPos]); // eslint-disable-line

  useEffect(() => { fetchAccidents(); }, [radius]); // eslint-disable-line

  // ── Debounce helper ───────────────────────────────────────────────────────
  const debounce = (key, fn, ms=350) => {
    clearTimeout(debRef.current[key]);
    debRef.current[key] = setTimeout(fn, ms);
  };

  // ── Get Route via OpenRouteService ────────────────────────────────────────
  const getRoute = async () => {
    if (!origin.trim() || !dest.trim()) { toast.error('Enter both origin and destination'); return; }
    if (!ORS_KEY) { toast.error('REACT_APP_ORS_KEY not set in .env'); return; }

    setRouteLoad(true); setRouteInfo(null); setRouteCoords(null); setRoutePins([]); setRouteSegs([]);

    try {
      const id = toast.loading('Locating places…');
      const [og, dg] = await Promise.all([geocode(origin), geocode(dest)]);
      toast.dismiss(id);
      if (!og || !dg) { setRouteLoad(false); return; }

      toast.loading('Calculating traffic-aware route…', { id:'rt' });
      const r = await getORSRoute(og.lat, og.lon, dg.lat, dg.lon);
      toast.dismiss('rt');

      setRouteCoords(r.coords);
      setRouteSegs(r.coloredSegs || []);
      setRouteInfo({
        distance: r.distance,
        duration: r.duration,
        from:     og.display.split(',')[0],
        to:       dg.display.split(',')[0],
      });
      setRoutePins([
        { pos:[og.lat, og.lon], label:'▶ ' + og.display.split(',')[0].slice(0,20), color:'#10b981' },
        { pos:[dg.lat, dg.lon], label:'⬛ ' + dg.display.split(',')[0].slice(0,20), color:'#ef4444' },
      ]);
      setMapTarget({ pos:[(og.lat+dg.lat)/2, (og.lon+dg.lon)/2], zoom:9 });
      toast.success(`Route found · ${r.distance} · ${r.duration}`);

    } catch(e) {
      toast.error('Route error: ' + e.message);
    } finally {
      setRouteLoad(false);
    }
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const searchPlace = async () => {
    if (!searchQ.trim()) return;
    setSearchLoad(true);
    try {
      const geo = await geocode(searchQ);
      if (geo) {
        setSearchPin({ pos:[geo.lat, geo.lon], label:geo.display.split(',')[0] });
        setMapTarget({ pos:[geo.lat, geo.lon], zoom:15 });
        setSearchSugg([]);
        toast.success(geo.display.split(',')[0]);
      }
    } finally { setSearchLoad(false); }
  };

  const navigateTo = (acc) => {
    const [lng,lat] = acc.location?.coordinates || [0,0];
    if (!lat || !lng) return;
    setDest(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setActiveTab('Route'); setSidebar(true); setSelected(null);
    toast('Destination set — click Get Route', { icon:'📍' });
  };

  const flyToUser = () => {
    if (!userPos) { toast.error('Location unavailable'); return; }
    setMapTarget({ pos:[...userPos], zoom:15 });
  };

  const clearRoute = () => {
    setRouteCoords(null); setRoutePins([]); setSearchPin(null); setRouteSegs([]);
    setRouteInfo(null);   setOrigin('');    setDest('');
  };

  const filteredAccidents = useMemo(() =>
    sevFilter === 'all' ? accidents : accidents.filter(a => a.severity === sevFilter),
    [accidents, sevFilter]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'calc(100vh - 60px)', background:'var(--bg)', fontFamily:"'Outfit',sans-serif", overflow:'hidden' }}>
      <Toaster position="top-right" toastOptions={{
        style:{ background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border2)', fontSize:13, fontFamily:"'Outfit',sans-serif" },
      }}/>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        .fi{width:100%;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:9px;color:var(--text);font-size:13px;font-family:'Outfit',sans-serif;outline:none;transition:border-color .2s,box-shadow .2s}
        .fi:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(67,97,238,0.15)}
        .fi::placeholder{color:var(--muted)}
        .bm{display:flex;align-items:center;justify-content:center;gap:7px;padding:11px 0;width:100%;background:var(--accent);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;letter-spacing:.2px;transition:all .2s}
        .bm:hover{filter:brightness(1.12);transform:translateY(-1px)}
        .bm:disabled{opacity:.4;cursor:not-allowed;transform:none;filter:none}
        .bg{background:var(--surface2);border:1px solid var(--border);color:var(--muted);border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .15s;display:flex;align-items:center;justify-content:center}
        .bg:hover{background:var(--border2);color:var(--text)}
        .tb{padding:8px 0;border:none;background:none;color:var(--muted);font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;cursor:pointer;border-radius:8px;transition:all .15s;flex:1}
        .tb.on{background:rgba(67,97,238,0.14);color:var(--accent)}
        .rm{padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);font-size:11px;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .15s;letter-spacing:.3px}
        .rm.on{background:rgba(67,97,238,0.14);color:var(--accent);border-color:rgba(67,97,238,0.35)}
        .ar{padding:11px 13px;margin-bottom:7px;border-radius:10px;cursor:pointer;transition:all .15s;border:1px solid var(--border)}
        .ar:hover{background:var(--surface2)!important;transform:translateX(2px)}
        .sg{padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px;font-family:'Outfit';transition:background .1s}
        .sg:hover{background:rgba(67,97,238,0.10)}
        .tg{width:38px;height:21px;border-radius:11px;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
        ::-webkit-scrollbar{width:4px};::-webkit-scrollbar-track{background:transparent};::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes puls{0%,100%{box-shadow:0 0 0 0 rgba(230,57,70,.5)}60%{box-shadow:0 0 0 8px rgba(230,57,70,0)}}
        .map-sidebar{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .leaflet-container{background:var(--bg)!important;font-family:'Outfit',sans-serif!important}
        .leaflet-tile{filter:none!important}
        .leaflet-control-zoom a{background:var(--surface)!important;color:var(--text)!important;border-color:var(--border2)!important}
        .leaflet-control-zoom a:hover{background:var(--surface2)!important}
        .leaflet-popup-content-wrapper{background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border2)!important;border-radius:12px!important;box-shadow:0 10px 40px rgba(0,0,0,0.6)!important}
        .leaflet-popup-tip{background:var(--surface)!important}
        .leaflet-popup-close-button{color:var(--muted)!important;font-size:18px!important;top:8px!important;right:10px!important}
        .leaflet-popup-content{margin:14px 16px!important;font-family:'Outfit',sans-serif!important}
        .leaflet-control-attribution{background:rgba(0,0,0,0.5)!important;color:rgba(255,255,255,0.2)!important;font-size:9px!important}
        .leaflet-control-attribution a{color:rgba(255,255,255,0.25)!important}
        @media(max-width:768px){
          .map-sidebar{position:fixed!important;bottom:0!important;left:0!important;right:0!important;top:auto!important;width:100%!important;min-width:100%!important;height:55vh!important;border-right:none!important;border-top:1px solid var(--border2)!important;border-radius:16px 16px 0 0!important;z-index:500!important;}
          .map-sidebar-hidden{height:0!important;overflow:hidden!important}
          .map-toggle-btn{bottom:16px!important;left:50%!important;transform:translateX(-50%)!important;top:auto!important}
        }
      `}</style>

      {/* ═══ SIDEBAR ═══════════════════════════════════════════════════════ */}
      <div className={`map-sidebar${sidebar?'':' map-sidebar-hidden'}`} style={{ width:sidebar?345:0, minWidth:sidebar?345:0, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:10 }}>

        {/* Header */}
        <div style={{ padding:'20px 20px 0', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:'#ef4444', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 4px 15px rgba(239,68,68,0.3)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4M12 16h.01" strokeLinecap="round"/></svg>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:800, color:'#f3f4f6', letterSpacing:.3 }}>AEGIS AI</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginTop:1 }}>
                Traffic · Routing · Heatmap
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
              {liveOn && (
                <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 9px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:20 }}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background:'#10b981', animation:'blink .8s infinite' }}/>
                  <span style={{ fontSize:10, color:'#34d399', fontWeight:700 }}>LIVE</span>
                </div>
              )}
              {(trafficFlow || trafficInc) && (
                <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 9px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:20 }}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background:'#f59e0b', animation:'blink 1.2s infinite' }}/>
                  <span style={{ fontSize:10, color:'#fbbf24', fontWeight:700 }}>TRAFFIC</span>
                </div>
              )}
            </div>
          </div>

          {/* GPS bar */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 11px', background:'rgba(255,255,255,0.03)', borderRadius:8, marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:userPos?'#10b981':'#f59e0b', animation:userPos?'none':'blink 1.5s infinite' }}/>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)', fontFamily:'JetBrains Mono' }}>
                {userPos ? `${userPos[0].toFixed(4)}, ${userPos[1].toFixed(4)}` : 'Acquiring GPS…'}
              </span>
            </div>
            {lastRefresh && <span style={{ fontSize:9, color:'rgba(255,255,255,0.18)', fontFamily:'JetBrains Mono' }}>↻ {lastRefresh.toLocaleTimeString('en-IN',{hour12:false})}</span>}
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, background:'rgba(255,255,255,0.03)', borderRadius:10, padding:4 }}>
            {TABS.map(t => <button key={t} className={`tb${activeTab===t?' on':''}`} onClick={()=>setActiveTab(t)}>{t}</button>)}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px 16px' }}>

          {/* ════ ROUTE TAB ════════════════════════════════════════════════ */}
          {activeTab==='Route' && (
            <div style={{ animation:'fadeUp .25s ease' }}>
              {/* Route mode */}
              <Lbl>Route preference</Lbl>
              <div style={{ display:'flex', gap:6, marginBottom:14 }}>
                {[['recommended','🚦 Recommended'],['fastest','⚡ Fastest'],['shortest','📏 Shortest']].map(([val,label])=>(
                  <button key={val} className={`rm${routeMode===val?' on':''}`} onClick={()=>setRouteMode(val)}>{label}</button>
                ))}
              </div>

              <Lbl>From</Lbl>
              <div style={{ position:'relative', marginBottom:12 }}>
                <div style={{ display:'flex', gap:7 }}>
                  <input className="fi" style={{ flex:1 }} value={origin}
                    onChange={e=>{ setOrigin(e.target.value); debounce('og', async()=>setOriginSugg(await fetchSuggestions(e.target.value))); }}
                    onFocus={()=>setFocusField('origin')} onBlur={()=>setTimeout(()=>setFocusField(null),200)}
                    placeholder="City, area, landmark…" onKeyDown={e=>e.key==='Enter'&&getRoute()}
                  />
                  <button className="bg" style={{ width:40, height:40, borderRadius:10, fontSize:16, flexShrink:0 }}
                    onClick={()=>{ if(!userPos){toast.error('Waiting for GPS…');return;} setOrigin(`${userPos[0].toFixed(6)}, ${userPos[1].toFixed(6)}`); toast.success('GPS set as origin'); }}>◎</button>
                </div>
                {focusField==='origin' && <SuggestBox items={originSugg} onSelect={f=>{ setOrigin(getName(f)); setOriginSugg([]); }}/>}
              </div>

              <Lbl>To</Lbl>
              <div style={{ position:'relative', marginBottom:14 }}>
                <input className="fi" value={dest}
                  onChange={e=>{ setDest(e.target.value); debounce('dt', async()=>setDestSugg(await fetchSuggestions(e.target.value))); }}
                  onFocus={()=>setFocusField('dest')} onBlur={()=>setTimeout(()=>setFocusField(null),200)}
                  placeholder="Destination or lat, lon…" onKeyDown={e=>e.key==='Enter'&&getRoute()}
                />
                {focusField==='dest' && <SuggestBox items={destSugg} onSelect={f=>{ setDest(getName(f)); setDestSugg([]); }}/>}
              </div>

              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                <button className="bm" style={{ flex:1 }} onClick={getRoute} disabled={routeLoad}>
                  {routeLoad ? <><Sp/> Calculating…</> : '🚦 Get Traffic Route'}
                </button>
                <button className="bg" style={{ width:42, height:42, borderRadius:10, fontSize:15, flexShrink:0 }} onClick={clearRoute}>✕</button>
              </div>

              {routeInfo && (
                <div style={{ background:'rgba(99,102,241,0.07)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:12, padding:'16px 18px', animation:'fadeUp .3s ease', marginBottom:14 }}>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.28)', marginBottom:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {routeInfo.from} → {routeInfo.to}
                  </div>
                  <div style={{ display:'flex', gap:20 }}>
                    <div>
                      <div style={{ fontSize:28, fontWeight:800, color:'#818cf8', fontFamily:'JetBrains Mono', lineHeight:1 }}>{routeInfo.distance}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginTop:4, fontWeight:700, letterSpacing:.5 }}>DISTANCE</div>
                    </div>
                    <div style={{ width:1, height:38, background:'rgba(255,255,255,0.06)' }}/>
                    <div>
                      <div style={{ fontSize:28, fontWeight:800, color:'#818cf8', fontFamily:'JetBrains Mono', lineHeight:1 }}>{routeInfo.duration}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginTop:4, fontWeight:700, letterSpacing:.5 }}>ETA</div>
                    </div>
                  </div>
                  <div style={{ marginTop:12, padding:'8px 10px', background:'rgba(16,185,129,0.08)', borderRadius:8, fontSize:11, color:'rgba(16,185,129,0.8)' }}>
                    ✅ Route calculated by OpenRouteService (traffic-aware)
                  </div>
                </div>
              )}

              {/* ORS key warning */}
              {!ORS_KEY && (
                <div style={{ padding:'10px 12px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, fontSize:11, color:'rgba(239,68,68,0.8)', lineHeight:1.8 }}>
                  ⚠️ Add <b>REACT_APP_ORS_KEY</b> to your .env<br/>
                  Get free key at openrouteservice.org (no card)
                </div>
              )}
            </div>
          )}

          {/* ════ TRAFFIC TAB ══════════════════════════════════════════════ */}
          {activeTab==='Traffic' && (
            <div style={{ animation:'fadeUp .25s ease' }}>
              <Lbl>TomTom Traffic Layers</Lbl>

              {!TOMTOM_KEY && (
                <div style={{ padding:'10px 12px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:8, fontSize:11, color:'rgba(245,158,11,0.8)', lineHeight:1.8, marginBottom:14 }}>
                  ⚠️ Add <b>REACT_APP_TOMTOM_KEY</b> to your .env<br/>
                  Get free key at developer.tomtom.com (no card)
                </div>
              )}

              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
                <TRow
                  label={<span>🚗 <b>Traffic Flow</b> — road speed colours</span>}
                  sub="Green = free · Yellow = slow · Red = jam"
                  value={trafficFlow}
                  onToggle={()=>{ if(!TOMTOM_KEY){toast.error('Add REACT_APP_TOMTOM_KEY to .env');return;} setTrafficFlow(v=>!v); }}
                  accent="#f59e0b"
                />
                <TRow
                  label={<span>⚠️ <b>Traffic Incidents</b> — accidents, closures</span>}
                  sub="Live road incident icons on map"
                  value={trafficInc}
                  onToggle={()=>{ if(!TOMTOM_KEY){toast.error('Add REACT_APP_TOMTOM_KEY to .env');return;} setTrafficInc(v=>!v); }}
                  accent="#ef4444"
                />
              </div>

              <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:16, marginBottom:16 }}>
                <Lbl>Accident Heatmap</Lbl>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <TRow
                    label={<span>🔥 <b>Heatmap overlay</b> — your accident data</span>}
                    sub="Hot zones = high accident density"
                    value={heatmapOn}
                    onToggle={()=>setHeatmapOn(v=>!v)}
                    accent="#f97316"
                  />
                </div>
                {heatmapOn && (
                  <div style={{ marginTop:10 }}>
                    <Lbl>Heatmap intensity</Lbl>
                    <div style={{ display:'flex', gap:6 }}>
                      {['low','medium','high'].map(v=>(
                        <button key={v} onClick={()=>setHeatIntensity(v)}
                          style={{ flex:1, padding:'7px 0', borderRadius:8, border:'1px solid rgba(255,255,255,0.09)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Plus Jakarta Sans', transition:'all .15s',
                            background: heatIntensity===v?'rgba(249,115,22,0.2)':'rgba(255,255,255,0.04)',
                            color:      heatIntensity===v?'#fb923c':'rgba(255,255,255,0.4)',
                            borderColor:heatIntensity===v?'rgba(249,115,22,0.4)':'rgba(255,255,255,0.09)',
                          }}>
                          {v.charAt(0).toUpperCase()+v.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Heatmap legend */}
              {heatmapOn && (
                <div style={{ padding:'12px 14px', background:'rgba(255,255,255,0.02)', borderRadius:10 }}>
                  <Lbl>Heatmap legend</Lbl>
                  <div style={{ display:'flex', alignItems:'center', gap:0, borderRadius:6, overflow:'hidden', height:14, marginBottom:8 }}>
                    {['#1e3a5f','#10b981','#f59e0b','#f97316','#ef4444'].map((c,i)=>(
                      <div key={i} style={{ flex:1, height:'100%', background:c }}/>
                    ))}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'rgba(255,255,255,0.3)', fontFamily:'JetBrains Mono' }}>
                    <span>Low</span><span>Medium</span><span>High</span>
                  </div>
                </div>
              )}

              <div style={{ marginTop:14, borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:14 }}>
                <Lbl>Live Refresh</Lbl>
                <TRow
                  label={<span>🔴 <b>Auto-refresh</b> accidents every 15s</span>}
                  value={liveOn}
                  onToggle={()=>setLiveOn(v=>!v)}
                  accent="#10b981"
                />
              </div>

              {/* Search */}
              <div style={{ marginTop:14, borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:14 }}>
                <Lbl>Quick place search</Lbl>
                <div style={{ position:'relative' }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="fi" style={{ flex:1 }} value={searchQ}
                      onChange={e=>{ setSearchQ(e.target.value); debounce('sq', async()=>setSearchSugg(await fetchSuggestions(e.target.value))); }}
                      onFocus={()=>setFocusField('search')} onBlur={()=>setTimeout(()=>setFocusField(null),200)}
                      placeholder="Search place on map…" onKeyDown={e=>e.key==='Enter'&&searchPlace()}
                    />
                    <button className="bm" style={{ width:44, borderRadius:10 }} onClick={searchPlace} disabled={searchLoad}>
                      {searchLoad?<Sp/>:'⌕'}
                    </button>
                  </div>
                  {focusField==='search' && <SuggestBox items={searchSugg} onSelect={f=>{ setSearchQ(getName(f)); setSearchSugg([]); }}/>}
                </div>
              </div>
            </div>
          )}

          {/* ════ ACCIDENTS TAB ════════════════════════════════════════════ */}
          {activeTab==='Accidents' && (
            <div style={{ animation:'fadeUp .25s ease' }}>
              <div style={{ marginBottom:14 }}>
                <Lbl>Radius: {radius} km</Lbl>
                <input type="range" min={1} max={50} step={1} value={radius} onChange={e=>setRadius(+e.target.value)} style={{ width:'100%', accentColor:'#6366f1', cursor:'pointer', marginBottom:4 }}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'rgba(255,255,255,0.2)', fontFamily:'JetBrains Mono' }}><span>1 km</span><span>50 km</span></div>
              </div>

              <div style={{ marginBottom:14 }}>
                <Lbl>Severity</Lbl>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {['all',...Object.keys(SEV)].map(s=>{
                    const on=sevFilter===s, col=s==='all'?'#6366f1':SEV[s]?.color;
                    return <button key={s} onClick={()=>setSevFilter(s)} style={{ padding:'4px 11px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Plus Jakarta Sans', transition:'all .15s', background:on?col:'rgba(255,255,255,0.05)', color:on?'#fff':'rgba(255,255,255,0.4)', boxShadow:on?`0 2px 10px ${col}40`:'none' }}>{s==='all'?'All':`${SEV[s].icon} ${SEV[s].label}`}</button>;
                  })}
                </div>
              </div>

              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                <button className="bg" style={{ flex:1, padding:'9px 0', fontSize:12, fontWeight:700 }} onClick={fetchAccidents}>↻ Refresh</button>
                <button className="bg" onClick={()=>setLiveOn(v=>!v)} style={{ flex:1, padding:'9px 0', fontSize:12, fontWeight:700, color:liveOn?'#34d399':'rgba(255,255,255,0.4)', borderColor:liveOn?'rgba(52,211,153,0.3)':'rgba(255,255,255,0.09)' }}>{liveOn?'⏸ Stop Live':'▶ Go Live'}</button>
              </div>

              {filteredAccidents.length===0 ? (
                <div style={{ padding:'40px 0', textAlign:'center', color:'rgba(255,255,255,0.2)', fontSize:13 }}>No accidents within {radius} km</div>
              ) : filteredAccidents.map((acc,i)=>{
                const [lng,lat]=acc.location?.coordinates||[0,0];
                const s=SEV[acc.severity]||{color:'#6b7280',fill:'rgba(107,114,128,0.12)',icon:'⚫',label:'Unknown'};
                return (
                  <div key={acc._id||i} className="ar" style={{ background:'rgba(255,255,255,0.03)', borderLeft:`3px solid ${s.color}`, animation:`fadeUp .3s ease ${i*.04}s both` }}
                    onClick={()=>{ setSelected(acc); const [lng,lat]=acc.location?.coordinates||[0,0]; if(lat&&lng) setMapTarget({pos:[lat,lng],zoom:15}); }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:s.color, background:s.fill, padding:'2px 8px', borderRadius:12 }}>{s.icon} {s.label}</span>
                      <span style={{ fontSize:9, color:'rgba(255,255,255,0.2)', fontFamily:'JetBrains Mono' }}>{new Date(acc.timestamp).toLocaleTimeString('en-IN',{hour12:false})}</span>
                    </div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>{acc.description||'Accident reported'}</div>
                    {lat&&lng&&<div style={{ fontSize:9, color:'rgba(255,255,255,0.18)', fontFamily:'JetBrains Mono' }}>{lat.toFixed(4)}, {lng.toFixed(4)}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ════ STATS TAB ════════════════════════════════════════════════ */}
          {activeTab==='Stats' && (
            <div style={{ animation:'fadeUp .25s ease' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:18 }}>
                <SC value={stats.total}                           label="Total"     color="#6366f1"/>
                <SC value={stats.recent}                          label="Last Hour" color="#f59e0b"/>
                <SC value={stats.bySev.HIGH+stats.bySev.CRITICAL} label="High Risk" color="#ef4444"/>
                <SC value={`${radius}km`}                         label="Radius"    color="#10b981"/>
              </div>
              <Lbl>By Severity</Lbl>
              {Object.entries(SEV).map(([key,val])=>{
                const count=stats.bySev[key]||0, pct=stats.total>0?(count/stats.total)*100:0;
                return (
                  <div key={key} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)', fontWeight:600 }}>{val.icon} {val.label}</span>
                      <span style={{ fontSize:12, color:val.color, fontFamily:'JetBrains Mono', fontWeight:700 }}>{count}</span>
                    </div>
                    <div style={{ height:7, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:val.color, borderRadius:4, transition:'width .6s ease' }}/>
                    </div>
                  </div>
                );
              })}

              {/* Active features */}
              <div style={{ marginTop:14, padding:'14px 16px', background:'rgba(255,255,255,0.02)', borderRadius:10 }}>
                <Lbl>Active features</Lbl>
                {[
                  ['🗺 Map tiles',         'OpenStreetMap',       true],
                  ['🚗 Traffic flow',       'TomTom',              trafficFlow],
                  ['⚠️ Traffic incidents',  'TomTom',              trafficInc],
                  ['🔥 Accident heatmap',   'Leaflet.heat',        heatmapOn],
                  ['🛣 Route engine',       'OpenRouteService',    !!ORS_KEY],
                  ['🔴 Live refresh',       '15s interval',        liveOn],
                ].map(([label,provider,active])=>(
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{label}</span>
                    <span style={{ fontSize:11, color:active?'#34d399':'rgba(255,255,255,0.2)', fontWeight:600 }}>
                      {active ? `✓ ${provider}` : '○ off'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', gap:8 }}>
          <button className="bg" style={{ flex:1, padding:'9px 0', fontSize:13, fontWeight:700 }} onClick={flyToUser}>◎ My Location</button>
          <button className="bg" style={{ width:42, height:42, borderRadius:8, fontSize:15 }} onClick={clearRoute} title="Clear map">🗑</button>
        </div>
      </div>

      {/* ═══ MAP AREA ══════════════════════════════════════════════════════ */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>

        {/* Toggle sidebar */}
        <button onClick={()=>setSidebar(o=>!o)} style={{ position:'absolute', top:14, left:14, zIndex:1000, width:38, height:38, borderRadius:10, background:'#0d1117', border:'1px solid rgba(255,255,255,0.12)', color:'#f3f4f6', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.6)' }}>
          {sidebar?'◁':'▷'}
        </button>

        {/* Severity badges */}
        {accidents.length>0 && (
          <div style={{ position:'absolute', top:14, right:14, zIndex:1000, display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
            {Object.entries(SEV).filter(([k])=>stats.bySev[k]>0).map(([k,v])=>(
              <div key={k} style={{ padding:'5px 11px', background:'rgba(13,17,23,0.92)', border:`1px solid ${v.color}40`, borderRadius:20, display:'flex', alignItems:'center', gap:5, boxShadow:'0 4px 15px rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:v.color, animation:k==='CRITICAL'?'puls 1.5s infinite':'none' }}/>
                <span style={{ fontSize:12, fontWeight:700, color:v.color, fontFamily:'JetBrains Mono' }}>{stats.bySev[k]}</span>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>{v.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Traffic layer legend */}
        {(trafficFlow||trafficInc) && (
          <div style={{ position:'absolute', bottom:40, right:14, zIndex:1000, background:'rgba(13,17,23,0.92)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 14px', backdropFilter:'blur(8px)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', marginBottom:6, letterSpacing:.5 }}>TRAFFIC LEGEND</div>
            {[['#10b981','Free flow'],['#f59e0b','Slow traffic'],['#ef4444','Traffic jam']].map(([c,l])=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <div style={{ width:20, height:4, background:c, borderRadius:2 }}/>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>{l}</span>
              </div>
            ))}
          </div>
        )}

        {/* Leaflet map */}
        <MapContainer center={[20.5937,78.9629]} zoom={5} style={{ width:'100%', height:'100%' }} zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='© <a href="https://carto.com/">CartoDB</a>'
            maxZoom={19}
          />
          <ZoomControl position="bottomright"/>
          <MapController target={mapTarget}/>

          {/* TomTom Traffic Layers */}
          <TrafficLayerController enabled={trafficFlow} tomtomKey={TOMTOM_KEY} style="flow"/>
          <TrafficLayerController enabled={trafficInc}  tomtomKey={TOMTOM_KEY} style="incidents"/>

          {/* Accident Heatmap */}
          <HeatmapController points={heatPoints} enabled={heatmapOn} intensity={heatIntensity}/>

          {/* User position */}
          {userPos && <Marker position={userPos} icon={userIcon}/>}

          {/* Route polyline — dark base + traffic-coloured step overlays */}
          {routeCoords && (
            <Polyline positions={routeCoords} pathOptions={{ color:'#1e1e2e', weight:8, opacity:1 }}/>
          )}
          {routeSegs.length > 0
            ? routeSegs.map((seg, i) => (
                <Polyline key={i} positions={seg.coords}
                  pathOptions={{ color:seg.color, weight:5, opacity:0.92, lineCap:'round', lineJoin:'round' }}/>
              ))
            : routeCoords && (
                <Polyline positions={routeCoords} pathOptions={{ color:'#4361ee', weight:5, opacity:.9 }}/>
              )
          }

          {/* Route start/end pins */}
          {routePins.map((p,i) => <Marker key={i} position={p.pos} icon={makePin(p.color,p.label)}/>)}

          {/* Search pin */}
          {searchPin && <Marker position={searchPin.pos} icon={makePin('#8b5cf6', searchPin.label.slice(0,22))}/>}

          {/* Accident markers — uses AccidentMarker with Leaflet Popup */}
          {filteredAccidents.map((acc,i)=>{
            if (!acc.location?.coordinates) return null;
            return <AccidentMarker key={acc._id||i} accident={acc} onVerify={()=>{}} />;
          })}
        </MapContainer>

      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────
const getName = f => f.properties?.formatted || f.properties?.name || '';

function Lbl({children}) {
  return <div style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', marginBottom:8 }}>{children}</div>;
}
function Sp() {
  return <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.2)', borderTop:'2px solid #fff', borderRadius:'50%', animation:'spin .7s linear infinite', flexShrink:0 }}/>;
}
function SC({value,label,color}) {
  return (
    <div style={{ padding:'14px 16px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, borderTop:`2px solid ${color}` }}>
      <div style={{ fontSize:26, fontWeight:800, color, fontFamily:'JetBrains Mono', marginBottom:4 }}>{value}</div>
      <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', fontWeight:700, letterSpacing:.5, textTransform:'uppercase' }}>{label}</div>
    </div>
  );
}
function TRow({label,sub,value,onToggle,accent='#6366f1'}) {
  return (
    <div style={{ padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:sub?4:0 }}>
        <span style={{ fontSize:13, color:'rgba(255,255,255,0.55)', fontWeight:500 }}>{label}</span>
        <button className="tg" onClick={onToggle} style={{ background:value?accent:'rgba(255,255,255,0.1)' }}>
          <div style={{ position:'absolute', top:2.5, left:value?19:2.5, width:16, height:16, background:'#fff', borderRadius:'50%', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
        </button>
      </div>
      {sub && <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)' }}>{sub}</div>}
    </div>
  );
}
function SuggestBox({items,onSelect}) {
  if (!items.length) return null;
  return (
    <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#12121f', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, marginTop:4, zIndex:9999, maxHeight:200, overflowY:'auto', boxShadow:'0 10px 40px rgba(0,0,0,0.6)' }}>
      {items.slice(0,6).map((f,i)=>{
        const p    = f.properties;
        const name = p.name || p.street || p.city || '';
        const sub  = p.formatted || '';
        return (
          <div key={i} className="sg" onClick={()=>onSelect(f)}>
            <div style={{ fontWeight:600, color:'rgba(255,255,255,0.7)', marginBottom:2 }}>{name}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sub}</div>
          </div>
        );
      })}
    </div>
  );
}