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
    this.streamers = streamers.map(s => s.toLowerCase());
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

      const avgBefore = Math.round(beforeStats?.avg_viewers || 0);
      const avgAfter = Math.round(afterStats?.avg_viewers || 0);

      if (avgBefore === 0) {
        console.log(`[Analysis] Pas de donnees avant l'evenement pour ${affectedStreamer}`);
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

        console.log(`[Analysis] Chute detectee: ${affectedStreamer} a perdu ${dropCount} viewers (${dropPercent}%) quand ${triggeringStreamer} a ${triggerEvent === 'START' ? 'lance' : 'coupe'} son stream`);
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
      const chattersA = db.prepare(`
        SELECT DISTINCT username FROM chat_messages
        WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
      `).all(streamerA, startTimestamp, endTimestamp).map(r => r.username);

      const chattersB = db.prepare(`
        SELECT DISTINCT username FROM chat_messages
        WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
      `).all(streamerB, startTimestamp, endTimestamp).map(r => r.username);

      const setA = new Set(chattersA);
      const setB = new Set(chattersB);

      // Intersection
      const overlap = [...setA].filter(x => setB.has(x));
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
      const chattersFromEnding = db.prepare(`
        SELECT DISTINCT username FROM chat_messages
        WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
      `).all(fromStreamer, endTimestamp - oneHour, endTimestamp).map(r => r.username);

      // Chatters apparus chez l'autre streamer dans les 10 minutes suivantes
      const chattersAfter = db.prepare(`
        SELECT DISTINCT username FROM chat_messages
        WHERE streamer = ? AND timestamp > ? AND timestamp <= ?
      `).all(toStreamer, endTimestamp, endTimestamp + tenMinutes).map(r => r.username);

      const setFrom = new Set(chattersFromEnding);
      const setTo = new Set(chattersAfter);

      // Chatters qui ont migre
      const migrated = [...setFrom].filter(x => setTo.has(x));
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
      if (this.streamers.length < 2) return null;

      const stats = {};

      for (const streamer of this.streamers) {
        const otherStreamer = this.streamers.find(s => s !== streamer);

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

        stats[streamer] = {
          affectedBy: otherStreamer,
          eventCount: result.event_count,
          avgDrop: Math.round(result.avg_drop || 0),
          avgDropPercent: parseFloat((result.avg_drop_percent || 0).toFixed(2)),
          maxDrop: result.max_drop || 0,
          maxDropPercent: parseFloat((result.max_drop_percent || 0).toFixed(2))
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

        data[streamer] = rows.map(r => ({
          timestamp: r.timestamp * 1000, // Convertir en ms pour JS
          viewerCount: r.viewer_count,
          isLive: r.is_live === 1,
          gameName: r.game_name
        }));
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
      return db.prepare(`
        SELECT * FROM viewer_drop_events
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit).map(r => ({
        ...r,
        timestamp: r.timestamp * 1000
      }));
    } catch (error) {
      console.error('[Analysis] Erreur getDropEvents:', error.message);
      return [];
    }
  }

  // Obtenir tous les evenements de migration
  getMigrationEvents(limit = 50) {
    try {
      return db.prepare(`
        SELECT * FROM migration_events
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit).map(r => ({
        ...r,
        timestamp: r.timestamp * 1000
      }));
    } catch (error) {
      console.error('[Analysis] Erreur getMigrationEvents:', error.message);
      return [];
    }
  }

  // Obtenir l'historique des chevauchements
  getOverlapHistory(limit = 30) {
    try {
      return db.prepare(`
        SELECT * FROM chatter_overlap
        ORDER BY period_end DESC
        LIMIT ?
      `).all(limit).map(r => ({
        ...r,
        periodStart: r.period_start * 1000,
        periodEnd: r.period_end * 1000
      }));
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

        stats24h[streamer] = {
          maxViewers: viewerStats.max_viewers || 0,
          avgViewers: Math.round(viewerStats.avg_viewers || 0),
          liveMinutes: (viewerStats.live_checks || 0),
          uniqueChatters: chatStats.unique_chatters,
          totalMessages: chatStats.total_messages,
          currentlyLive: currentStatus?.is_live === 1,
          currentViewers: currentStatus?.viewer_count || 0
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
    if (this.streamers.length < 2) return null;

    const [streamerA, streamerB] = this.streamers;

    const chattersA = db.prepare(`
      SELECT DISTINCT username FROM chat_messages
      WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
    `).all(streamerA, startTimestamp, endTimestamp).map(r => r.username);

    const chattersB = db.prepare(`
      SELECT DISTINCT username FROM chat_messages
      WHERE streamer = ? AND timestamp >= ? AND timestamp <= ?
    `).all(streamerB, startTimestamp, endTimestamp).map(r => r.username);

    const setA = new Set(chattersA);
    const setB = new Set(chattersB);
    const overlap = [...setA].filter(x => setB.has(x));

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
