import React, { useState } from 'react';
import api from '../services/api';
import './PublicSearch.css';

function PublicSearch() {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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
                            {result.tikyjr.follows === true ? 'Oui' : result.tikyjr.follows === false ? 'Non' : '-'}
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
                            {result.etostark.follows === true ? 'Oui' : result.etostark.follows === false ? 'Non' : '-'}
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
      </div>
    </div>
  );
}

export default PublicSearch;
