const {
  db,
  insertViewerDropEvent,
  insertChatterOverlap,
  insertMigrationEvent
} = require('./database');

class AnalysisService {
  constructor() {
    this.streamers = [];
  }

  initialize(streamers) {
    this.streamers = streamers.map(function(s) {
      return s.toLowerCase();
    });
  }

  // Analyser la chute de viewers quand un autre streamer lance son stream
  analyzeViewerDrop(affectedStreamer, triggeringStreamer, triggerEvent, eventTimestamp) {
    try {
      const threeMinutes = 3 * 60;

      // Moyenne des viewers 3 minutes AVANT l'evenement
      const beforeStats = db.prepare(`
        SELECT AVG(viewer_count) as avg_viewers
        FROM viewer_stats
        WHERE streamer = ?
          AND timestamp >= ? AND timestamp < ?
          AND is_live = 1
      `).get(affectedStreamer, eventTimestamp - threeMinutes, eventTimestamp);

      // Moyenne des viewers 3 minutes APRES l'evenement
      const afterStats = db.prepare(`
        SELECT AVG(viewer_count) as avg_viewers
        FROM viewer_stats
        WHERE streamer = ?
          AND timestamp > ? AND timestamp <= ?
          AND is_live = 1
      `).get(affectedStreamer, eventTimestamp, eventTimestamp + threeMinutes);

      // Calculer les moyennes avec valeurs par defaut
      let avgBeforeRaw = 0;
      if (beforeStats && beforeStats.avg_viewers) {
        avgBeforeRaw = beforeStats.avg_viewers;
      }
      const avgBefore = Math.round(avgBeforeRaw);

      let avgAfterRaw = 0;
      if (afterStats && afterStats.avg_viewers) {
        avgAfterRaw = afterStats.avg_viewers;
      }
      const avgAfter = Math.round(avgAfterRaw);

      if (avgBefore === 0) {
        console.log('[Analysis] Pas de donnees avant l\'evenement pour ' + affectedStreamer);
        return null;
      }

      const dropCount = avgBefore - avgAfter;
      const dropPercent = ((dropCount / avgBefore) * 100).toFixed(2);

      // Enregistrer seulement si le streamer affecte etait en live
      if (avgBefore > 0) {
        insertViewerDropEvent.run(
          affectedStreamer,
          triggeringStreamer,
          triggerEvent,
          eventTimestamp,
          avgBefore,
          avgAfter,
          dropCount,
          parseFloat(dropPercent)
        );

        // Construire le message de log
        let actionText;
        if (triggerEvent === 'START') {
          actionText = 'lance';
        } else {
          actionText = 'coupe';
        }
        console.log('[Analysis] Chute detectee: ' + affectedStreamer + ' a perdu ' + dropCount + ' viewers (' + dropPercent + '%) quand ' + triggeringStreamer + ' a ' + actionText + ' son stream');
      }

      return { avgBefore, avgAfter, dropCount, dropPercent };
    } catch (error) {
      console.error('[Analysis] Erreur analyzeViewerDrop:', error.message);
      return null;
    }
  }

  // Calculer le chevauchement des chatters sur une periode
  calculateChatterOverlap(startTimestamp, endTimestamp) {
    try {
      if (this.streamers.length < 2) return null;

      const [streamerA, streamerB] = this.streamers;

      // Chatters uniques pour chaque streamer
      const chattersARows = db.prepare(`
        SELECT DISTINCT username FROM chat_messages
        WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
      `).all(streamerA, startTimestamp, endTimestamp);

      const chattersA = [];
      for (const row of chattersARows) {
        chattersA.push(row.username);
      }

      const chattersBRows = db.prepare(`
        SELECT DISTINCT username FROM chat_messages
        WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
      `).all(streamerB, startTimestamp, endTimestamp);

      const chattersB = [];
      for (const row of chattersBRows) {
        chattersB.push(row.username);
      }

      const setA = new Set(chattersA);
      const setB = new Set(chattersB);

      // Intersection - trouver les chatters communs
      const overlap = [];
      for (const username of setA) {
        if (setB.has(username)) {
          overlap.push(username);
        }
      }
      const overlapCount = overlap.length;

      // Pourcentage par rapport au plus petit groupe
      const minSize = Math.min(setA.size, setB.size);
      let overlapPercent;
      if (minSize > 0) {
        overlapPercent = ((overlapCount / minSize) * 100).toFixed(2);
      } else {
        overlapPercent = 0;
      }

      // Enregistrer
      insertChatterOverlap.run(
        startTimestamp,
        endTimestamp,
        streamerA,
        streamerB,
        setA.size,
        setB.size,
        overlapCount,
        parseFloat(overlapPercent)
      );

      console.log(`[Analysis] Chevauchement: ${overlapCount} chatters communs (${overlapPercent}%) - ${streamerA}: ${setA.size}, ${streamerB}: ${setB.size}`);

      return {
        streamerA: { name: streamerA, uniqueChatters: setA.size },
        streamerB: { name: streamerB, uniqueChatters: setB.size },
        overlapCount,
        overlapPercent: parseFloat(overlapPercent),
        overlapUsers: overlap
      };
    } catch (error) {
      console.error('[Analysis] Erreur calculateChatterOverlap:', error.message);
      return null;
    }
  }

  // Analyser la migration apres la fin d'un stream
  analyzeMigration(fromStreamer, toStreamer, endTimestamp) {
    try {
      const oneHour = 60 * 60;
      const tenMinutes = 10 * 60;

      // Chatters du stream qui vient de se terminer (derniere heure)
      const chattersFromEndingRows = db.prepare(`
        SELECT DISTINCT username FROM chat_messages
        WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
      `).all(fromStreamer, endTimestamp - oneHour, endTimestamp);

      const chattersFromEnding = [];
      for (const row of chattersFromEndingRows) {
        chattersFromEnding.push(row.username);
      }

      // Chatters apparus chez l'autre streamer dans les 10 minutes suivantes
      const chattersAfterRows = db.prepare(`
        SELECT DISTINCT username FROM chat_messages
        WHERE streamer = ? AND timestamp > ? AND timestamp <= ?
      `).all(toStreamer, endTimestamp, endTimestamp + tenMinutes);

      const chattersAfter = [];
      for (const row of chattersAfterRows) {
        chattersAfter.push(row.username);
      }

      const setFrom = new Set(chattersFromEnding);
      const setTo = new Set(chattersAfter);

      // Chatters qui ont migre
      const migrated = [];
      for (const username of setFrom) {
        if (setTo.has(username)) {
          migrated.push(username);
        }
      }
      const migratedCount = migrated.length;

      // Score de migration: pourcentage de chatters qui ont migre
      let migrationScore;
      if (setFrom.size > 0) {
        migrationScore = ((migratedCount / setFrom.size) * 100).toFixed(2);
      } else {
        migrationScore = 0;
      }

      if (setFrom.size > 0) {
        insertMigrationEvent.run(
          fromStreamer,
          toStreamer,
          endTimestamp,
          setFrom.size,
          migratedCount,
          parseFloat(migrationScore)
        );

        console.log(`[Analysis] Migration: ${migratedCount}/${setFrom.size} chatters (${migrationScore}%) ont migre de ${fromStreamer} vers ${toStreamer}`);
      }

      return {
        fromStreamer,
        toStreamer,
        chattersFromEndingStream: setFrom.size,
        chattersAppeared: migratedCount,
        migrationScore: parseFloat(migrationScore),
        migratedUsers: migrated
      };
    } catch (error) {
      console.error('[Analysis] Erreur analyzeMigration:', error.message);
      return null;
    }
  }

  // Calculer les statistiques journalieres de chevauchement
  calculateDailyOverlap() {
    const now = Math.floor(Date.now() / 1000);
    const dayStart = now - (now % 86400); // Debut du jour UTC
    const dayEnd = dayStart + 86400;

    return this.calculateChatterOverlap(dayStart, dayEnd);
  }

  // Obtenir les statistiques de chute moyennes
  getAverageDropStats() {
    try {
      if (this.streamers.length < 2) {
        return null;
      }

      const stats = {};

      for (const streamer of this.streamers) {
        // Trouver l'autre streamer
        let otherStreamer = null;
        for (const s of this.streamers) {
          if (s !== streamer) {
            otherStreamer = s;
            break;
          }
        }

        const result = db.prepare(`
          SELECT
            COUNT(*) as event_count,
            AVG(drop_count) as avg_drop,
            AVG(drop_percent) as avg_drop_percent,
            MAX(drop_count) as max_drop,
            MAX(drop_percent) as max_drop_percent
          FROM viewer_drop_events
          WHERE affected_streamer = ? AND triggering_streamer = ?
        `).get(streamer, otherStreamer);

        // Calculer les valeurs avec valeurs par defaut
        let avgDrop = 0;
        if (result.avg_drop) {
          avgDrop = result.avg_drop;
        }

        let avgDropPercent = 0;
        if (result.avg_drop_percent) {
          avgDropPercent = result.avg_drop_percent;
        }

        let maxDrop = 0;
        if (result.max_drop) {
          maxDrop = result.max_drop;
        }

        let maxDropPercent = 0;
        if (result.max_drop_percent) {
          maxDropPercent = result.max_drop_percent;
        }

        stats[streamer] = {
          affectedBy: otherStreamer,
          eventCount: result.event_count,
          avgDrop: Math.round(avgDrop),
          avgDropPercent: parseFloat(avgDropPercent.toFixed(2)),
          maxDrop: maxDrop,
          maxDropPercent: parseFloat(maxDropPercent.toFixed(2))
        };
      }

      return stats;
    } catch (error) {
      console.error('[Analysis] Erreur getAverageDropStats:', error.message);
      return null;
    }
  }

  // Timeline des viewers pour une periode donnee
  getViewerTimeline(startTimestamp, endTimestamp) {
    try {
      const data = {};

      for (const streamer of this.streamers) {
        const rows = db.prepare(`
          SELECT timestamp, viewer_count, is_live, game_name
          FROM viewer_stats
          WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
          ORDER BY timestamp ASC
        `).all(streamer, startTimestamp, endTimestamp);

        // Transformer les donnees
        const transformedRows = [];
        for (const row of rows) {
          transformedRows.push({
            timestamp: row.timestamp * 1000, // Convertir en ms pour JS
            viewerCount: row.viewer_count,
            isLive: row.is_live === 1,
            gameName: row.game_name
          });
        }
        data[streamer] = transformedRows;
      }

      return data;
    } catch (error) {
      console.error('[Analysis] Erreur getViewerTimeline:', error.message);
      return {};
    }
  }

  // Obtenir tous les evenements de chute
  getDropEvents(limit = 50) {
    try {
      const rows = db.prepare(`
        SELECT * FROM viewer_drop_events
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit);

      // Transformer les donnees
      const results = [];
      for (const row of rows) {
        const transformed = Object.assign({}, row);
        transformed.timestamp = row.timestamp * 1000;
        results.push(transformed);
      }
      return results;
    } catch (error) {
      console.error('[Analysis] Erreur getDropEvents:', error.message);
      return [];
    }
  }

  // Obtenir tous les evenements de migration
  getMigrationEvents(limit = 50) {
    try {
      const rows = db.prepare(`
        SELECT * FROM migration_events
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit);

      // Transformer les donnees
      const results = [];
      for (const row of rows) {
        const transformed = Object.assign({}, row);
        transformed.timestamp = row.timestamp * 1000;
        results.push(transformed);
      }
      return results;
    } catch (error) {
      console.error('[Analysis] Erreur getMigrationEvents:', error.message);
      return [];
    }
  }

  // Obtenir l'historique des chevauchements
  getOverlapHistory(limit = 30) {
    try {
      const rows = db.prepare(`
        SELECT * FROM chatter_overlap
        ORDER BY period_end DESC
        LIMIT ?
      `).all(limit);

      // Transformer les donnees
      const results = [];
      for (const row of rows) {
        const transformed = Object.assign({}, row);
        transformed.periodStart = row.period_start * 1000;
        transformed.periodEnd = row.period_end * 1000;
        results.push(transformed);
      }
      return results;
    } catch (error) {
      console.error('[Analysis] Erreur getOverlapHistory:', error.message);
      return [];
    }
  }

  // Resume pour le dashboard
  getDashboardSummary() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const last24h = now - 86400;
      const last7d = now - 7 * 86400;

      // Stats des derniers 24h
      const stats24h = {};
      for (const streamer of this.streamers) {
        const viewerStats = db.prepare(`
          SELECT
            MAX(viewer_count) as max_viewers,
            AVG(viewer_count) as avg_viewers,
            SUM(CASE WHEN is_live = 1 THEN 1 ELSE 0 END) as live_checks
          FROM viewer_stats
          WHERE streamer = ? AND timestamp >= ?
        `).get(streamer, last24h);

        const chatStats = db.prepare(`
          SELECT COUNT(DISTINCT username) as unique_chatters, COUNT(*) as total_messages
          FROM chat_messages
          WHERE streamer = ? AND timestamp >= ?
        `).get(streamer, last24h);

        // Verifier le statut actuel (derniere entree)
        const currentStatus = db.prepare(`
          SELECT is_live, viewer_count FROM viewer_stats
          WHERE streamer = ?
          ORDER BY timestamp DESC
          LIMIT 1
        `).get(streamer);

        // Calculer les valeurs avec valeurs par defaut
        let maxViewers = 0;
        if (viewerStats.max_viewers) {
          maxViewers = viewerStats.max_viewers;
        }

        let avgViewersRaw = 0;
        if (viewerStats.avg_viewers) {
          avgViewersRaw = viewerStats.avg_viewers;
        }

        let liveMinutes = 0;
        if (viewerStats.live_checks) {
          liveMinutes = viewerStats.live_checks;
        }

        let currentlyLive = false;
        if (currentStatus && currentStatus.is_live === 1) {
          currentlyLive = true;
        }

        let currentViewers = 0;
        if (currentStatus && currentStatus.viewer_count) {
          currentViewers = currentStatus.viewer_count;
        }

        stats24h[streamer] = {
          maxViewers: maxViewers,
          avgViewers: Math.round(avgViewersRaw),
          liveMinutes: liveMinutes,
          uniqueChatters: chatStats.unique_chatters,
          totalMessages: chatStats.total_messages,
          currentlyLive: currentlyLive,
          currentViewers: currentViewers
        };
      }

      // Chevauchement actuel (derniere heure)
      const lastHour = now - 3600;
      const currentOverlap = this.calculateChatterOverlapWithoutSave(lastHour, now);

      // Nombre d'evenements de chute
      const dropCount = db.prepare(`
        SELECT COUNT(*) as count FROM viewer_drop_events WHERE timestamp >= ?
      `).get(last7d).count;

      // Nombre d'evenements de migration
      const migrationCount = db.prepare(`
        SELECT COUNT(*) as count FROM migration_events WHERE timestamp >= ?
      `).get(last7d).count;

      return {
        streamers: this.streamers,
        stats24h,
        currentOverlap,
        last7Days: {
          dropEvents: dropCount,
          migrationEvents: migrationCount
        }
      };
    } catch (error) {
      console.error('[Analysis] Erreur getDashboardSummary:', error.message);
      return null;
    }
  }

  // Version sans sauvegarde pour les calculs temporaires
  calculateChatterOverlapWithoutSave(startTimestamp, endTimestamp) {
    if (this.streamers.length < 2) {
      return null;
    }

    const [streamerA, streamerB] = this.streamers;

    const chattersARows = db.prepare(`
      SELECT DISTINCT username FROM chat_messages
      WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
    `).all(streamerA, startTimestamp, endTimestamp);

    const chattersA = [];
    for (const row of chattersARows) {
      chattersA.push(row.username);
    }

    const chattersBRows = db.prepare(`
      SELECT DISTINCT username FROM chat_messages
      WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
    `).all(streamerB, startTimestamp, endTimestamp);

    const chattersB = [];
    for (const row of chattersBRows) {
      chattersB.push(row.username);
    }

    const setA = new Set(chattersA);
    const setB = new Set(chattersB);

    // Trouver les chatters communs
    const overlap = [];
    for (const username of setA) {
      if (setB.has(username)) {
        overlap.push(username);
      }
    }

    const minSize = Math.min(setA.size, setB.size);
    let overlapPercent;
    if (minSize > 0) {
      overlapPercent = ((overlap.length / minSize) * 100).toFixed(2);
    } else {
      overlapPercent = 0;
    }

    return {
      [streamerA]: setA.size,
      [streamerB]: setB.size,
      overlapCount: overlap.length,
      overlapPercent: parseFloat(overlapPercent)
    };
  }
}

module.exports = new AnalysisService();
