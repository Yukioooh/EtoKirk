import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import './PublicSearch.css';

function PublicSearch() {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [topTraitors, setTopTraitors] = useState([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const refreshTimerRef = useRef(null);
  const searchRefreshTimerRef = useRef(null);

  useEffect(function() {
    loadTopTraitors();
    return function() {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (searchRefreshTimerRef.current) clearTimeout(searchRefreshTimerRef.current);
    };
  }, []);

  // Auto-refresh du Top 10 si des follows sont null
  useEffect(function() {
    if (topTraitors.length > 0) {
      var hasNullFollows = topTraitors.some(function(t) {
        return t.tikyjr.follows === null || t.etostark.follows === null;
      });

      if (hasNullFollows) {
        refreshTimerRef.current = setTimeout(function() {
          loadTopTraitors();
        }, 5000);
      }
    }
  }, [topTraitors]);

  // Auto-refresh du resultat de recherche si follows null
  useEffect(function() {
    if (result && (result.tikyjr.follows === null || result.etostark.follows === null)) {
      searchRefreshTimerRef.current = setTimeout(function() {
        refreshSearch();
      }, 5000);
    }
  }, [result]);

  function loadTopTraitors() {
    api.getTopTraitorsDetailed(10)
      .then(function(response) {
        if (response.success) {
          setTopTraitors(response.data);
        }
      })
      .catch(function(err) {
        console.error('Erreur chargement top:', err);
      })
      .finally(function() {
        setLoadingTop(false);
      });
  }

  function refreshSearch() {
    if (!result) return;
    api.getViewerDetails(result.username)
      .then(function(response) {
        if (response.success && response.data) {
          setResult(response.data);
        }
      })
      .catch(function(err) {
        console.error('Erreur refresh:', err);
      });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setSearched(true);

    api.getViewerDetails(username.trim())
      .then(function(response) {
        if (response.success && response.data) {
          setResult(response.data);
        } else {
          setResult(null);
        }
      })
      .catch(function(error) {
        console.error('Erreur:', error);
        setResult(null);
      })
      .finally(function() {
        setLoading(false);
      });
  }

  function formatDate(timestamp) {
    if (!timestamp) return '-';
    var date = new Date(timestamp);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatFollowDate(dateStr) {
    if (!dateStr) return '-';
    // La date vient du scraper au format "MM/DD/YYYYHH:MM AM/PM"
    // On extrait juste la partie date et on la convertit en DD/MM/YYYY
    var match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      return match[2] + '/' + match[1] + '/' + match[3];
    }
    return dateStr;
  }

  function getTraitorStatus(user) {
    if (user.isTraitor) {
      return 'TRAITRE';
    }
    return 'NON TRAITRE';
  }

  function getStatusClass(user) {
    if (user.isTraitor) {
      return 'status-traitor';
    }
    return 'status-clean';
  }

  return (
    <div className="public-page">
      <div className="public-container">
        <h1 className="public-title">Recherche de Viewer</h1>

        <form className="search-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="search-input"
            placeholder="Pseudo Twitch"
            value={username}
            onChange={function(e) { setUsername(e.target.value); }}
          />
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? 'Recherche...' : 'Rechercher'}
          </button>
        </form>

        {searched && !loading && (
          <div className="result-container">
            {result ? (
              <div className="result-card">
                <div className="result-header">
                  <span className="result-username">{result.username}</span>
                  <span className={'result-status ' + getStatusClass(result)}>
                    {getTraitorStatus(result)}
                  </span>
                </div>

                <div className="result-grid">
                  <div className="result-section">
                    <h3 className="section-title">TikyJr</h3>
                    <table className="info-table">
                      <tbody>
                        <tr>
                          <td className="info-label">Messages</td>
                          <td className="info-value">{result.tikyjr.messages || 0}</td>
                        </tr>
                        <tr>
                          <td className="info-label">Follow</td>
                          <td className="info-value">
                            {result.tikyjr.follows === true ? 'Oui' : result.tikyjr.follows === false ? 'Non' : <span className="loading-dots">...</span>}
                          </td>
                        </tr>
                        <tr>
                          <td className="info-label">Date follow</td>
                          <td className="info-value">{formatFollowDate(result.tikyjr.followedAt)}</td>
                        </tr>
                        <tr>
                          <td className="info-label">Dernier msg</td>
                          <td className="info-value">{formatDate(result.tikyjr.lastMessage)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="result-section">
                    <h3 className="section-title">Etostark</h3>
                    <table className="info-table">
                      <tbody>
                        <tr>
                          <td className="info-label">Messages</td>
                          <td className="info-value">{result.etostark.messages || 0}</td>
                        </tr>
                        <tr>
                          <td className="info-label">Follow</td>
                          <td className="info-value">
                            {result.etostark.follows === true ? 'Oui' : result.etostark.follows === false ? 'Non' : <span className="loading-dots">...</span>}
                          </td>
                        </tr>
                        <tr>
                          <td className="info-label">Date follow</td>
                          <td className="info-value">{formatFollowDate(result.etostark.followedAt)}</td>
                        </tr>
                        <tr>
                          <td className="info-label">Dernier msg</td>
                          <td className="info-value">{formatDate(result.etostark.lastMessage)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="result-footer">
                  <span>Premier message: {formatDate(result.firstSeen)}</span>
                </div>
              </div>
            ) : (
              <div className="no-result">
                <p>Aucun viewer trouve avec ce pseudo</p>
              </div>
            )}
          </div>
        )}

        <div className="top-section">
          <h2 className="top-title">Top 10 Traitres</h2>
          {loadingTop ? (
            <p className="loading-text">Chargement...</p>
          ) : (
            <div className="top-list">
              {topTraitors.map(function(traitor, index) {
                return (
                  <div className="top-card" key={traitor.username}>
                    <div className="top-rank">#{index + 1}</div>
                    <div className="top-info">
                      <div className="top-header">
                        <span className="top-username">{traitor.username}</span>
                        <span className="top-total">{traitor.totalMessages} msgs</span>
                      </div>
                      <div className="top-stats">
                        <div className="top-stat">
                          <span className="stat-label">TikyJr:</span>
                          <span>{traitor.tikyjr.messages} msgs</span>
                          <span>{traitor.tikyjr.follows === true ? '/ Follow' : traitor.tikyjr.follows === false ? '/ No follow' : <span className="loading-dots">/ ...</span>}</span>
                        </div>
                        <div className="top-stat">
                          <span className="stat-label">Etostark:</span>
                          <span>{traitor.etostark.messages} msgs</span>
                          <span>{traitor.etostark.follows === true ? '/ Follow' : traitor.etostark.follows === false ? '/ No follow' : <span className="loading-dots">/ ...</span>}</span>
                        </div>
                      </div>
                      <div className="top-dates">
                        <span>Dernier msg: {formatDate(traitor.lastSeen)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PublicSearch;
