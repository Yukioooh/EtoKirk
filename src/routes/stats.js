const express = require('express');
const router = express.Router();
const analysisService = require('../services/analysis');
const traitorService = require('../services/traitorService');
const { db } = require('../services/database');

// GET /stats/viewers/timeline
// Parametres: start (timestamp), end (timestamp), hours (alternative: dernières X heures)
router.get('/viewers/timeline', (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    let { start, end, hours } = req.query;

    if (hours) {
      end = now;
      start = now - (parseInt(hours) * 3600);
    } else {
      start = parseInt(start) || (now - 86400); // Par defaut: 24h
      end = parseInt(end) || now;
    }

    const data = analysisService.getViewerTimeline(start, end);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/drop-events
// Parametres: limit (nombre d'evenements)
router.get('/drop-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = analysisService.getDropEvents(limit);
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/average-drop
router.get('/average-drop', (req, res) => {
  try {
    const stats = analysisService.getAverageDropStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/overlap/daily
router.get('/overlap/daily', (req, res) => {
  try {
    const overlap = analysisService.calculateDailyOverlap();
    res.json({ success: true, data: overlap });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/overlap/history
router.get('/overlap/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const history = analysisService.getOverlapHistory(limit);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/overlap/current
// Parametres: minutes (periode a analyser, defaut: 60)
router.get('/overlap/current', (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes) || 60;
    const now = Math.floor(Date.now() / 1000);
    const start = now - (minutes * 60);

    const overlap = analysisService.calculateChatterOverlapWithoutSave(start, now);
    res.json({ success: true, data: { period: minutes, ...overlap } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/migration/events
router.get('/migration/events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = analysisService.getMigrationEvents(limit);
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/dashboard-summary
router.get('/dashboard-summary', (req, res) => {
  try {
    const summary = analysisService.getDashboardSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/stream-events
// Historique des evenements de stream (START/END)
router.get('/stream-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = db.prepare(`
      SELECT * FROM stream_events
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit).map(r => ({
      ...r,
      timestamp: r.timestamp * 1000
    }));

    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/chatters/top
// Top chatters par streamer
router.get('/chatters/top', (req, res) => {
  try {
    const { streamer } = req.query;
    const limit = parseInt(req.query.limit) || 20;
    const hours = parseInt(req.query.hours) || 24;

    const now = Math.floor(Date.now() / 1000);
    const start = now - (hours * 3600);

    let query;
    let params;

    if (streamer) {
      query = `
        SELECT username, COUNT(*) as message_count
        FROM chat_messages
        WHERE streamer = ? AND timestamp >= ?
        GROUP BY username
        ORDER BY message_count DESC
        LIMIT ?
      `;
      params = [streamer.toLowerCase(), start, limit];
    } else {
      query = `
        SELECT streamer, username, COUNT(*) as message_count
        FROM chat_messages
        WHERE timestamp >= ?
        GROUP BY streamer, username
        ORDER BY message_count DESC
        LIMIT ?
      `;
      params = [start, limit];
    }

    const chatters = db.prepare(query).all(...params);
    res.json({ success: true, data: chatters });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/common-chatters
// Liste des chatters communs aux deux streams
router.get('/common-chatters', (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const now = Math.floor(Date.now() / 1000);
    const start = now - (hours * 3600);

    const streamers = analysisService.streamers;
    if (streamers.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const [streamerA, streamerB] = streamers;

    const commonChatters = db.prepare(`
      SELECT a.username,
             COUNT(DISTINCT CASE WHEN a.streamer = ? THEN a.id END) as messages_a,
             COUNT(DISTINCT CASE WHEN a.streamer = ? THEN a.id END) as messages_b
      FROM chat_messages a
      WHERE a.timestamp >= ?
      GROUP BY a.username
      HAVING messages_a > 0 AND messages_b > 0
      ORDER BY (messages_a + messages_b) DESC
      LIMIT 100
    `).all(streamerA, streamerB, start);

    res.json({
      success: true,
      data: {
        streamers: [streamerA, streamerB],
        commonChatters
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES TRAITRES
// ============================================

// GET /stats/traitors
// Liste de tous les traitres (confirmes et potentiels)
router.get('/traitors', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const traitors = traitorService.getAllTraitors(limit);
    res.json({ success: true, data: traitors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/traitors/top
// Top traitres par nombre de messages
router.get('/traitors/top', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const traitors = traitorService.getTopTraitors(limit);
    res.json({ success: true, data: traitors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/traitors/stats
// Statistiques globales sur les traitres
router.get('/traitors/stats', (req, res) => {
  try {
    const stats = traitorService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/traitors/search
// Rechercher un chatter
router.get('/traitors/search', (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username requis' });
    }
    const results = traitorService.searchChatter(username);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/traitors/reports
// Historique des rapports journaliers
router.get('/traitors/reports', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const reports = traitorService.getReportHistory(days);
    res.json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
