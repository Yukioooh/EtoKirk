import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

function TraitorCard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const { data: stats, loading: statsLoading } = useApi(api.getTraitorStats, [], 30000);
  const { data: traitors, loading: traitorsLoading } = useApi(api.getTopTraitors, [20], 30000);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      try {
        const result = await api.searchChatter(searchTerm);
        setSearchResults(result.data);
      } catch (error) {
        console.error('Erreur recherche:', error);
      }
    }
  };

  if (statsLoading || traitorsLoading) {
    return <div className="card card-full"><div className="loading">Chargement des traitres...</div></div>;
  }

  return (
    <div className="card card-full">
      <h2>Les Traitres</h2>

      {/* Stats globales */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div className="stat-item">
            <div className="stat-value">{stats.totalChatters?.toLocaleString() || 0}</div>
            <div className="stat-label">Chatters totaux</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#ff0000' }}>{stats.confirmedTraitors || 0}</div>
            <div className="stat-label">Traitres confirmes</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#888888' }}>{stats.potentialTraitors || 0}</div>
            <div className="stat-label">Traitres potentiels</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#ff0000' }}>{stats.traitorPercent}%</div>
            <div className="stat-label">Taux de trahison</div>
          </div>
        </div>
      )}

      {/* Barre de recherche */}
      <form onSubmit={handleSearch} style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher un chatter..."
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '14px'
          }}
        />
        <button type="submit" className="refresh-btn">Rechercher</button>
      </form>

      {/* Resultats de recherche */}
      {searchResults && (
        <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Resultats de recherche</h3>
          {searchResults.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Aucun resultat</p>
          ) : (
            searchResults.map((chatter, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{chatter.username}</span>
                  {chatter.isTraitor && (
                    <span style={{ marginLeft: '8px', padding: '2px 8px', background: '#1a0000', color: '#ff0000', border: '1px solid #ff0000', fontSize: '11px' }}>
                      TRAITRE
                    </span>
                  )}
                  {chatter.traitorLevel === 'TRAITRE POTENTIEL' && (
                    <span style={{ marginLeft: '8px', padding: '2px 8px', background: '#1a1a1a', color: '#888888', border: '1px solid #666666', fontSize: '11px' }}>
                      SUSPECT
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  TikyJr: {chatter.messagesTikyjr} | Etostark: {chatter.messagesEtostark}
                </div>
              </div>
            ))
          )}
          <button
            onClick={() => setSearchResults(null)}
            style={{ marginTop: '10px', padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            Fermer
          </button>
        </div>
      )}

      {/* Liste des top traitres */}
      <h3 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-secondary)' }}>Top Traitres (par messages)</h3>
      <div className="event-list" style={{ maxHeight: '400px' }}>
        {!traitors || traitors.length === 0 ? (
          <div className="no-data">Aucun traitre detecte pour le moment</div>
        ) : (
          traitors.map((traitor, idx) => (
            <div key={idx} className="event-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: idx < 3 ? '#ff0000' : '#888888'
                }}>
                  {idx + 1}
                </span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: '#ff4444' }}>{traitor.username}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>TikyJr: {traitor.messages_tikyjr}</span>
                    {' | '}
                    <span>Etostark: {traitor.messages_etostark}</span>
                    {traitor.follows_tikyjr === 1 && <span style={{ marginLeft: '8px' }}>Follow TikyJr</span>}
                    {traitor.follows_etostark === 1 && <span style={{ marginLeft: '8px' }}>Follow Etostark</span>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff' }}>
                  {traitor.total_messages}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>messages</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TraitorCard;
