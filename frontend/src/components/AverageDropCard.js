import React from 'react';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

function AverageDropCard() {
  const { data, loading, error } = useApi(api.getAverageDrop, [], 60000);

  if (loading) return <div className="card"><div className="loading">Chargement...</div></div>;
  if (error) return <div className="card"><div className="error">Erreur: {error}</div></div>;
  if (!data) return <div className="card"><div className="no-data">Aucune donnee</div></div>;

  const streamers = Object.keys(data);

  return (
    <div className="card">
      <h2>Chute Moyenne de Viewers</h2>

      {streamers.length === 0 ? (
        <div className="no-data">Pas assez de donnees</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {streamers.map((streamer) => {
            const stats = data[streamer];

            return (
              <div
                key={streamer}
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '16px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span className="streamer-tag">
                    {streamer}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {stats.eventCount} evenements
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Quand {stats.affectedBy} lance son stream:
                </div>

                <div style={{ display: 'flex', gap: '20px' }}>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--danger)' }}>
                      -{stats.avgDrop}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      viewers en moyenne
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--danger)' }}>
                      {stats.avgDropPercent}%
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      chute moyenne
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#888888' }}>
                      {stats.maxDropPercent}%
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      chute max
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AverageDropCard;
