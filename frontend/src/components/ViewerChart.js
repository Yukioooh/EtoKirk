import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

const COLORS = {
  tikyjr: '#9146ff',
  etostark: '#00b4d8'
};

function ViewerChart() {
  const [hours, setHours] = useState(24);
  const { data, loading, error } = useApi(api.getViewerTimeline, [hours], 60000);

  if (loading) return <div className="loading">Chargement du graphique...</div>;
  if (error) return <div className="error">Erreur: {error}</div>;
  if (!data) return <div className="no-data">Aucune donnee disponible</div>;

  // Preparer les donnees pour Recharts
  const streamers = Object.keys(data);
  if (streamers.length === 0) return <div className="no-data">Aucune donnee disponible</div>;

  // Fusionner les donnees des deux streamers par timestamp
  const timestamps = new Set();
  streamers.forEach(s => data[s].forEach(d => timestamps.add(d.timestamp)));

  const chartData = Array.from(timestamps)
    .sort((a, b) => a - b)
    .map(ts => {
      const point = { timestamp: ts };
      streamers.forEach(s => {
        const entry = data[s].find(d => d.timestamp === ts);
        point[s] = entry?.viewerCount || null;
        point[`${s}_live`] = entry?.isLive;
      });
      return point;
    });

  const formatTime = (ts) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts) => {
    const date = new Date(ts);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="card card-full">
      <h2>Timeline des Viewers</h2>

      <div className="time-selector">
        {[1, 6, 12, 24, 48, 168].map(h => (
          <button
            key={h}
            className={`time-btn ${hours === h ? 'active' : ''}`}
            onClick={() => setHours(h)}
          >
            {(() => {
              if (h < 24) {
                return `${h}h`;
              } else {
                return `${h / 24}j`;
              }
            })()}
          </button>
        ))}
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#303036" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              stroke="#adadb8"
              fontSize={12}
            />
            <YAxis stroke="#adadb8" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: '#1f1f23',
                border: '1px solid #303036',
                borderRadius: '8px'
              }}
              labelFormatter={formatDate}
              formatter={(value, name) => [value?.toLocaleString() || 'Offline', name]}
            />
            <Legend />
            {streamers.map(s => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                name={s}
                stroke={COLORS[s] || '#888'}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ViewerChart;
