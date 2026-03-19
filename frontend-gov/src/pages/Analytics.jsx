import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import api from '../services/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

const opts = (title) => ({
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { labels: { color: '#7070a0', font: { family: 'JetBrains Mono', size: 11 }, boxWidth: 12 } },
    title: { display: false },
    tooltip: { backgroundColor: '#13131e', borderColor: '#ffffff14', borderWidth: 1, titleColor: '#f0f0f8', bodyColor: '#7070a0', titleFont: { family: 'DM Sans', size: 13 }, bodyFont: { family: 'JetBrains Mono', size: 12 } },
  },
  scales: {
    x: { ticks: { color: '#7070a0', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'rgba(255,255,255,0.08)' } },
    y: { ticks: { color: '#7070a0', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'rgba(255,255,255,0.08)' } },
  },
});

const Analytics = () => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [range,   setRange]   = useState('7d');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await api.get(`/accidents/analytics?range=${range}`);
        setData(r.data.data);
      } catch { setData(mock()); }
      finally { setLoading(false); }
    };
    load();
  }, [range]);

  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const HOURS = Array.from({length:24}, (_,i) => `${i}h`);

  const barData = {
    labels: data?.daily?.labels || DAYS,
    datasets: [{ label: 'Accidents', data: data?.daily?.values || [3,5,2,8,4,6,1], backgroundColor: 'rgba(230,57,70,0.65)', borderColor: '#e63946', borderWidth: 1.5, borderRadius: 5 }],
  };

  const lineData = {
    labels: data?.hourly?.labels || HOURS,
    datasets: [{ label: 'Hourly', data: data?.hourly?.values || [1,0,1,2,1,0,3,5,4,3,2,4,5,3,2,3,4,6,5,4,3,2,1,0], borderColor: '#4361ee', backgroundColor: 'rgba(67,97,238,0.08)', fill: true, tension: 0.45, pointRadius: 3, pointBackgroundColor: '#4361ee' }],
  };

  const donutData = {
    labels: ['LOW','MEDIUM','HIGH','CRITICAL'],
    datasets: [{ data: data?.severity || [20,35,30,15], backgroundColor: ['rgba(45,198,83,0.8)','rgba(244,162,97,0.8)','rgba(251,133,0,0.8)','rgba(230,57,70,0.8)'], borderColor: '#0d0d14', borderWidth: 3, hoverOffset: 6 }],
  };

  const summaryItems = [
    { label: 'Total this period', value: data?.total || 0,           color: 'var(--accent)'  },
    { label: 'Avg response time', value: `${data?.avgResponse||0}s`, color: 'var(--blue)'    },
    { label: 'Resolution rate',   value: `${data?.resRate||0}%`,     color: 'var(--green)'   },
    { label: 'Peak hour',         value: data?.peakHour || '—',      color: 'var(--yellow)'  },
    { label: 'Top camera',        value: data?.topCamera || '—',     color: 'var(--purple)'  },
  ];

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Header title="Analytics" subtitle="Accident patterns and trends" />

      <div style={{ padding: 24 }}>
        {/* Range */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {[['7d','7 Days'],['30d','30 Days'],['90d','90 Days']].map(([v,l]) => (
            <button key={v} className="btn" onClick={() => setRange(v)} style={{ background: range === v ? 'var(--accent)' : 'var(--surface2)', borderColor: range === v ? 'var(--accent)' : 'var(--border)', color: range === v ? '#fff' : 'var(--muted)' }}>{l}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading analytics...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            {/* Daily bar */}
            <div className="card fade-up" style={{ padding: 24, gridColumn: 'span 2' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Daily Accidents</div>
              <Bar data={barData} options={opts()} />
            </div>

            {/* Hourly line */}
            <div className="card fade-up" style={{ padding: 24, gridColumn: 'span 2', animationDelay: '0.1s' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Hourly Pattern</div>
              <Line data={lineData} options={opts()} />
            </div>

            {/* Donut */}
            <div className="card fade-up" style={{ padding: 24, animationDelay: '0.15s' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Severity Distribution</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut data={donutData} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#7070a0', font: { family: 'JetBrains Mono', size: 11 }, boxWidth: 12, padding: 16 } } }, cutout: '65%' }} />
              </div>
            </div>

            {/* Summary */}
            <div className="card fade-up" style={{ padding: 24, animationDelay: '0.2s' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Summary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {summaryItems.map((item, i) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < summaryItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{item.label}</span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const mock = () => ({
  daily:   { labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], values: [3,5,2,8,4,6,1] },
  hourly:  { labels: Array.from({length:24},(_,i)=>`${i}h`),     values: [1,0,1,2,1,0,3,5,4,3,2,4,5,3,2,3,4,6,5,4,3,2,1,0] },
  severity: [20,35,30,15],
  total: 84, avgResponse: 42, resRate: 78, peakHour: '17:00', topCamera: 'camera_0',
});

export default Analytics;