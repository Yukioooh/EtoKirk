import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './TopTraitors.css';

function TopTraitors() {
  const [traitors, setTraitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(function() {
    loadTraitors();
  }, []);

  function loadTraitors() {
    setLoading(true);
    api.getTopTraitorsDetailed(10)
      .then(function(response) {
        if (response.success) {
          setTraitors(response.data);
        }
      })
      .catch(function(err) {
        setError('Erreur de chargement');
        console.error(err);
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
      year: 'numeric'
    });
  }

  function formatFollowDate(dateStr) {
    if (!dateStr) return '-';
    var match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      return match[2] + '/' + match[1] + '/' + match[3];
    }
    return dateStr;
  }

  if (loading) {
    return (
      <div className="top-page">
        <div className="top-container">
          <h1 className="top-title">Top 10 Traitres</h1>
          <p className="loading">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="top-page">
        <div className="top-container">
          <h1 className="top-title">Top 10 Traitres</h1>
          <p className="error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="top-page">
      <div className="top-container">
        <h1 className="top-title">Top 10 Traitres</h1>
        <p className="top-subtitle">Les viewers les plus actifs sur les deux chats</p>

        <div className="traitors-list">
          {traitors.map(function(traitor, index) {
            return (
              <div className="traitor-card" key={traitor.username}>
                <div className="traitor-rank">#{index + 1}</div>
                <div className="traitor-info">
                  <div className="traitor-header">
                    <span className="traitor-username">{traitor.username}</span>
                    <span className="traitor-total">{traitor.totalMessages} messages</span>
                  </div>

                  <div className="traitor-stats">
                    <div className="stat-column">
                      <h4>TikyJr</h4>
                      <table className="stat-table">
                        <tbody>
                          <tr>
                            <td>Messages</td>
                            <td>{traitor.tikyjr.messages}</td>
                          </tr>
                          <tr>
                            <td>Follow</td>
                            <td>{traitor.tikyjr.follows === true ? 'Oui' : traitor.tikyjr.follows === false ? 'Non' : '-'}</td>
                          </tr>
                          <tr>
                            <td>Date follow</td>
                            <td>{formatFollowDate(traitor.tikyjr.followedAt)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="stat-column">
                      <h4>Etostark</h4>
                      <table className="stat-table">
                        <tbody>
                          <tr>
                            <td>Messages</td>
                            <td>{traitor.etostark.messages}</td>
                          </tr>
                          <tr>
                            <td>Follow</td>
                            <td>{traitor.etostark.follows === true ? 'Oui' : traitor.etostark.follows === false ? 'Non' : '-'}</td>
                          </tr>
                          <tr>
                            <td>Date follow</td>
                            <td>{formatFollowDate(traitor.etostark.followedAt)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="traitor-footer">
                    <span>Vu depuis: {formatDate(traitor.firstSeen)}</span>
                    <span>Dernier msg: {formatDate(traitor.lastSeen)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TopTraitors;
