import React from 'react';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

function DropEventsCard() {
  const { data, loading, error } = useApi(api.getDropEvents, [20], 60000);

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
      <h2>Chutes de Viewers</h2>

      {!data || data.length === 0 ? (
        <div className="no-data">Aucun evenement enregistre</div>
      ) : (
        <div className="event-list">
          {data.map((event, idx) => (
            <div key={idx} className="event-item">
              <div className="event-info">
                <span className="event-title">
                  <span className="streamer-tag">
                    {event.affected_streamer}
                  </span>
                  {' quand '}
                  <span className="streamer-tag">
                    {event.triggering_streamer}
                  </span>
                  {event.trigger_event === 'START' ? ' lance' : ' coupe'}
                </span>
                <span className="event-time">{formatDate(event.timestamp)}</span>
              </div>
              <div className="event-value negative">
                -{event.drop_count} ({event.drop_percent}%)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DropEventsCard;
