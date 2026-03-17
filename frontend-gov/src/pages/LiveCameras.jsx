import React, { useState } from 'react';
import Header from '../components/Header';

const CAMERAS = [
  { id: 'camera_0', label: 'Main Road Junction',   location: 'MG Road, Zone A',    status: 'live'    },
  { id: 'camera_1', label: 'Highway Entry',         location: 'NH-48, Zone B',      status: 'live'    },
  { id: 'camera_2', label: 'Market Area',           location: 'Linking Road, Zone C',status: 'offline' },
  { id: 'camera_3', label: 'Flyover Camera',        location: 'Andheri Flyover',    status: 'live'    },
  { id: 'camera_4', label: 'School Zone',           location: 'SV Road, Zone D',    status: 'live'    },
  { id: 'camera_5', label: 'Residential Cross',     location: 'Lokhandwala, Zone E', status: 'offline' },
];

const LiveCameras = ({ socket }) => {
  const [active, setActive] = useState(null);
  const live    = CAMERAS.filter(c => c.status === 'live').length;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Header
        title="Live Cameras"
        subtitle={`${live} of ${CAMERAS.length} cameras online`}
      />

      <div style={{ padding: 24 }}>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Online', value: live, color: 'var(--green)' },
            { label: 'Offline', value: CAMERAS.length - live, color: 'var(--red)' },
            { label: 'Total', value: CAMERAS.length, color: 'var(--blue)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{s.label}</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Camera grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {CAMERAS.map(cam => {
            const isActive = active === cam.id;
            return (
              <div key={cam.id} className={`card fade-up`} onClick={() => cam.status === 'live' && setActive(isActive ? null : cam.id)} style={{
                overflow: 'hidden',
                cursor: cam.status === 'live' ? 'pointer' : 'default',
                border: `1px solid ${isActive ? 'var(--blue)' : 'var(--border)'}`,
                transition: 'all 0.2s',
                transform: isActive ? 'scale(1.01)' : 'scale(1)',
              }}>
                {/* Feed area */}
                <div style={{ aspectRatio: '16/9', background: '#080810', position: 'relative', overflow: 'hidden' }}>
                  {cam.status === 'offline' ? (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <div style={{ fontSize: 32, opacity: 0.2 }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/><line x1="1" y1="1" x2="23" y2="23" stroke="#e63946"/></svg>
                      </div>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#ffffff30', letterSpacing: 3 }}>OFFLINE</span>
                    </div>
                  ) : (
                    <>
                      {/* Scanline effect */}
                      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,100,0.015) 2px, rgba(0,255,100,0.015) 4px)', pointerEvents: 'none' }} />

                      {/* Camera ID watermark */}
                      <div style={{ position: 'absolute', top: 10, left: 12 }}>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0,255,100,0.5)', letterSpacing: 2 }}>{cam.id.toUpperCase()}</div>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 1 }}>
                          {new Date().toLocaleTimeString('en-IN', { hour12: false })}
                        </div>
                      </div>

                      {/* Live badge */}
                      <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(230,57,70,0.85)', padding: '3px 8px', borderRadius: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#fff', letterSpacing: 1 }}>LIVE</span>
                      </div>

                      {/* Corner brackets */}
                      {[{t:8,l:8,bt:'top',bl:'left'},{t:8,r:8,bt:'top',bl:'right'},{b:8,l:8,bt:'bottom',bl:'left'},{b:8,r:8,bt:'bottom',bl:'right'}].map((c,i) => (
                        <div key={i} style={{ position: 'absolute', ...c, width: 14, height: 14, borderTop: c.bt === 'top' ? '1.5px solid rgba(0,255,100,0.4)' : 'none', borderBottom: c.bt === 'bottom' ? '1.5px solid rgba(0,255,100,0.4)' : 'none', borderLeft: c.bl === 'left' ? '1.5px solid rgba(0,255,100,0.4)' : 'none', borderRight: c.bl === 'right' ? '1.5px solid rgba(0,255,100,0.4)' : 'none' }} />
                      ))}

                      {/* Simulated noise */}
                      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 30%, rgba(0,60,40,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
                    </>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{cam.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{cam.location}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: cam.status === 'live' ? 'var(--green)' : 'var(--red)' }} />
                    <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--muted)' }}>{cam.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Note */}
        <div style={{ marginTop: 20, padding: '14px 18px', background: 'rgba(67,97,238,0.06)', border: '1px solid rgba(67,97,238,0.15)', borderRadius: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--blue)' }}>Note:</strong> Live RTSP streams require HLS/WebRTC configuration on the backend. Connect your CCTV sources via <code style={{ fontFamily: 'JetBrains Mono', fontSize: 11, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>VIDEO_SOURCES</code> in the AI system's .env file. Gov-only access enforced.
        </div>
      </div>
    </div>
  );
};

export default LiveCameras;