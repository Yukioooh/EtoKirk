import React from 'react';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

function OverlapCard() {
  const { data, loading, error } = useApi(api.getCurrentOverlap, [60], 30000);

  if (loading) return <div className="card"><div className="loading">Chargement...</div></div>;
  if (error) return <div className="card"><div className="error">Erreur: {error}</div></div>;
  if (!data) return <div className="card"><div className="no-data">Aucune donnee</div></div>;

  const streamers = Object.keys(data).filter(k => !['overlapCount', 'overlapPercent', 'period'].includes(k));
  const [streamerA, streamerB] = streamers;
  const total = (data[streamerA] || 0) + (data[streamerB] || 0);
  let overlapWidth;
  if (total > 0) {
    overlapWidth = Math.min((data.overlapCount / total) * 100 * 2, 100);
  } else {
    overlapWidth = 0;
  }

  return (
    <div className="card">
      <h2>Chevauchement des Chatters (1h)</h2>

      <div className="stat-grid">
        <div className="stat-item">
          <div className="stat-value">
            {data[streamerA] || 0}
          </div>
          <div className="stat-label">{streamerA}</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">
            {data[streamerB] || 0}
          </div>
          <div className="stat-label">{streamerB}</div>
        </div>
      </div>

      <div className="overlap-bar">
        <div className="overlap-fill" style={{ width: `${overlapWidth}%` }} />
      </div>

      <div className="overlap-stats">
        <span>{data.overlapCount} chatters communs</span>
        <span style={{ fontWeight: 600 }}>{data.overlapPercent}%</span>
      </div>
    </div>
  );
}

export default OverlapCard;
