import React from 'react';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

function MigrationCard() {
  const { data, loading, error } = useApi(api.getMigrationEvents, [20], 60000);

  if (loading) return <div className="card"><div className="loading">Chargement...</div></div>;
  if (error) return <div className="card"><div className="error">Erreur: {error}</div></div>;

  const formatDate = (ts) => {
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="card">
      <h2>Migrations de Viewers</h2>

      {!data || data.length === 0 ? (
        <div className="no-data">Aucune migration enregistree</div>
      ) : (
        <div className="event-list">
          {data.map((event, idx) => (
            <div key={idx} className="event-item">
              <div className="event-info">
                <span className="event-title">
                  <span className={`streamer-tag ${(() => {
                    if (event.from_streamer === 'tikyjr') {
                      return 'streamer-1';
                    } else {
                      return 'streamer-2';
                    }
                  })()}`}>
                    {event.from_streamer}
                  </span>
                  {' -> '}
                  <span className={`streamer-tag ${(() => {
                    if (event.to_streamer === 'tikyjr') {
                      return 'streamer-1';
                    } else {
                      return 'streamer-2';
                    }
                  })()}`}>
                    {event.to_streamer}
                  </span>
                </span>
                <span className="event-time">{formatDate(event.timestamp)}</span>
              </div>
              <div className="event-value positive">
                {event.chatters_appeared_after}/{event.chatters_from_ending_stream} ({event.migration_score}%)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MigrationCard;
