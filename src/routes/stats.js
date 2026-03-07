const express = require('express');
const router = express.Router();
const analysisService = require('../services/analysis');
const traitorService = require('../services/traitorService');
const followScraper = require('../services/followScraper');
const vodChatScraper = require('../services/vodChatScraper');
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

// GET /stats/traitors/top-detailed
// Top traitres avec stats detaillees (utilise le cache DB - instantane)
router.get('/traitors/top-detailed', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Recuperer les top traitres
    const traitors = db.prepare(`
      SELECT * FROM chatters
      WHERE is_traitor = 1
      ORDER BY (messages_tikyjr + messages_etostark) DESC
      LIMIT ?
    `).all(limit);

    // Utiliser le cache DB pour les follows (instantane)
    const results = traitors.map(function(t) {
      var followTikyjr = followScraper.getCachedFollows(t.username, 'tikyjr');
      var followEtostark = followScraper.getCachedFollows(t.username, 'etostark__');

      // Si pas en cache, ajouter a la queue de scraping
      if (!followTikyjr) followScraper.queueScrape(t.username);
      if (!followEtostark) followScraper.queueScrape(t.username);

      return {
        username: t.username,
        totalMessages: t.messages_tikyjr + t.messages_etostark,
        tikyjr: {
          messages: t.messages_tikyjr,
          follows: followTikyjr ? followTikyjr.follows : null,
          followedAt: followTikyjr ? followTikyjr.followedAt : null
        },
        etostark: {
          messages: t.messages_etostark,
          follows: followEtostark ? followEtostark.follows : null,
          followedAt: followEtostark ? followEtostark.followedAt : null
        },
        firstSeen: t.first_seen * 1000,
        lastSeen: t.last_seen * 1000
      };
    });

    res.json({ success: true, data: results });
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

// GET /stats/viewer/:username
// Recherche detaillee d'un viewer avec dates de follow
router.get('/viewer/:username', (req, res) => {
  try {
    const username = req.params.username.toLowerCase();

    // Chercher dans la base de donnees
    const chatter = db.prepare(`
      SELECT * FROM chatters WHERE LOWER(username) = ?
    `).get(username);

    if (!chatter) {
      return res.json({ success: true, data: null });
    }

    // Recuperer le dernier message pour chaque streamer
    const lastMessageTikyjr = db.prepare(`
      SELECT timestamp FROM chat_messages
      WHERE LOWER(username) = ? AND streamer = 'tikyjr'
      ORDER BY timestamp DESC LIMIT 1
    `).get(username);

    const lastMessageEtostark = db.prepare(`
      SELECT timestamp FROM chat_messages
      WHERE LOWER(username) = ? AND streamer = 'etostark__'
      ORDER BY timestamp DESC LIMIT 1
    `).get(username);

    // Recuperer les infos de follow depuis le cache (instantane)
    var followTikyjr = followScraper.getCachedFollows(username, 'tikyjr');
    var followEtostark = followScraper.getCachedFollows(username, 'etostark__');

    // Si pas en cache, ajouter a la queue pour prochain rafraichissement
    if (!followTikyjr || !followEtostark) {
      followScraper.queueScrape(username);
    }

    // Utiliser last_seen si pas de message dans chat_messages
    const lastMsgTiky = lastMessageTikyjr ? lastMessageTikyjr.timestamp * 1000 :
                        (chatter.seen_at_tikyjr ? chatter.last_seen * 1000 : null);
    const lastMsgEto = lastMessageEtostark ? lastMessageEtostark.timestamp * 1000 :
                       (chatter.seen_at_etostark ? chatter.last_seen * 1000 : null);

    const result = {
      username: chatter.username,
      isTraitor: chatter.is_traitor === 1,
      traitorLevel: chatter.traitor_level,
      traitorScore: chatter.traitor_score,
      tikyjr: {
        messages: chatter.messages_tikyjr,
        lastMessage: lastMsgTiky,
        follows: followTikyjr ? followTikyjr.follows : null,
        followedAt: followTikyjr ? followTikyjr.followedAt : null
      },
      etostark: {
        messages: chatter.messages_etostark,
        lastMessage: lastMsgEto,
        follows: followEtostark ? followEtostark.follows : null,
        followedAt: followEtostark ? followEtostark.followedAt : null
      },
      firstSeen: chatter.first_seen * 1000,
      lastSeen: chatter.last_seen * 1000
    };

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES VOD SCRAPING
// ============================================

// POST /stats/vod/scrape
// Lancer le scraping des VODs (peut prendre du temps)
router.post('/vod/scrape', async (req, res) => {
  try {
    const maxVods = parseInt(req.query.max) || 10;
    const streamer = req.query.streamer;

    res.json({ success: true, message: 'Scraping demarre en arriere-plan' });

    // Lancer en arriere-plan
    if (streamer) {
      vodChatScraper.scrapeStreamerVods(streamer, maxVods)
        .then(function(result) {
          console.log('[API] Scraping termine pour', streamer, ':', result);
        })
        .catch(function(err) {
          console.error('[API] Erreur scraping:', err);
        });
    } else {
      vodChatScraper.scrapeAllStreamers(maxVods)
        .then(function(result) {
          console.log('[API] Scraping termine:', result);
        })
        .catch(function(err) {
          console.error('[API] Erreur scraping:', err);
        });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/vod/scraped
// Liste des VODs deja scrapees
router.get('/vod/scraped', (req, res) => {
  try {
    const vods = db.prepare(`
      SELECT * FROM scraped_vods
      ORDER BY scraped_at DESC
      LIMIT 100
    `).all();

    res.json({ success: true, data: vods });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
