import React from 'react';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

function SummaryCard() {
  const { data, loading, error, refresh } = useApi(api.getDashboardSummary, [], 30000);

  if (loading) return <div className="card"><div className="loading">Chargement...</div></div>;
  if (error) return <div className="card"><div className="error">Erreur: {error}</div></div>;
  if (!data) return <div className="card"><div className="no-data">Aucune donnee</div></div>;

  const streamers = data.streamers || [];

  return (
    <div className="card card-full">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ marginBottom: 0 }}>Statut en direct</h2>
        <button className="refresh-btn" onClick={refresh}>Actualiser</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        {streamers.map((streamer) => {
          const stats = data.stats24h?.[streamer] || {};

          return (
            <div key={streamer} style={{
              background: 'var(--bg-secondary)',
              padding: '20px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (() => {
                if (stats.currentlyLive) {
                  return '16px';
                } else {
                  return '0';
                }
              })() }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{streamer}</h3>
                {(() => {
                  if (stats.currentlyLive) {
                    return (
                      <span className="live-badge">LIVE ({stats.currentViewers?.toLocaleString()})</span>
                    );
                  } else {
                    return (
                      <span className="offline-badge">Offline</span>
                    );
                  }
                })()}
              </div>

              {stats.currentlyLive && (
                <div className="stat-grid">
                  <div className="stat-item">
                    <div className="stat-value">{stats.currentViewers?.toLocaleString() || 0}</div>
                    <div className="stat-label">Viewers actuels</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{stats.maxViewers?.toLocaleString() || 0}</div>
                    <div className="stat-label">Pic viewers</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{stats.uniqueChatters?.toLocaleString() || 0}</div>
                    <div className="stat-label">Chatters uniques</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{stats.totalMessages?.toLocaleString() || 0}</div>
                    <div className="stat-label">Messages</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data.last7Days && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '20px', justifyContent: 'center' }}>
          <div className="stat-item" style={{ flex: 1, maxWidth: '200px' }}>
            <div className="stat-value">{data.last7Days.dropEvents}</div>
            <div className="stat-label">Chutes detectees (7j)</div>
          </div>
          <div className="stat-item" style={{ flex: 1, maxWidth: '200px' }}>
            <div className="stat-value">{data.last7Days.migrationEvents}</div>
            <div className="stat-label">Migrations detectees (7j)</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SummaryCard;
