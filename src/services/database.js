const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/twitch_analytics.db');
const db = new Database(dbPath);

// Activer les foreign keys et le mode WAL pour de meilleures performances
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  // Table des statistiques de viewers
  db.exec(`
    CREATE TABLE IF NOT EXISTS viewer_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      streamer TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      viewer_count INTEGER NOT NULL,
      is_live INTEGER NOT NULL DEFAULT 0,
      game_name TEXT,
      stream_title TEXT
    )
  `);

  // Index pour optimiser les requetes temporelles
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_viewer_stats_streamer_timestamp
    ON viewer_stats(streamer, timestamp)
  `);

  // Table des evenements de stream (debut/fin)
  db.exec(`
    CREATE TABLE IF NOT EXISTS stream_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      streamer TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('START', 'END')),
      timestamp INTEGER NOT NULL,
      viewer_count_at_event INTEGER
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stream_events_timestamp
    ON stream_events(timestamp)
  `);

  // Table des messages de chat
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      streamer TEXT NOT NULL,
      username TEXT NOT NULL,
      username_hash TEXT,
      timestamp INTEGER NOT NULL,
      message_length INTEGER
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_streamer_timestamp
    ON chat_messages(streamer, timestamp)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_username
    ON chat_messages(username)
  `);

  // Table des evenements de chute de viewers
  db.exec(`
    CREATE TABLE IF NOT EXISTS viewer_drop_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      affected_streamer TEXT NOT NULL,
      triggering_streamer TEXT NOT NULL,
      trigger_event TEXT NOT NULL CHECK(trigger_event IN ('START', 'END')),
      timestamp INTEGER NOT NULL,
      avg_viewers_before INTEGER NOT NULL,
      avg_viewers_after INTEGER NOT NULL,
      drop_count INTEGER NOT NULL,
      drop_percent REAL NOT NULL
    )
  `);

  // Table des analyses de chevauchement de chatters
  db.exec(`
    CREATE TABLE IF NOT EXISTS chatter_overlap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      streamer_a TEXT NOT NULL,
      streamer_b TEXT NOT NULL,
      unique_chatters_a INTEGER NOT NULL,
      unique_chatters_b INTEGER NOT NULL,
      overlap_count INTEGER NOT NULL,
      overlap_percent REAL NOT NULL
    )
  `);

  // Table des migrations de viewers
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_streamer TEXT NOT NULL,
      to_streamer TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      chatters_from_ending_stream INTEGER NOT NULL,
      chatters_appeared_after INTEGER NOT NULL,
      migration_score REAL NOT NULL
    )
  `);

  // Table pour tracker l'etat des streams (pour detecter les changements)
  db.exec(`
    CREATE TABLE IF NOT EXISTS stream_state (
      streamer TEXT PRIMARY KEY,
      is_live INTEGER NOT NULL DEFAULT 0,
      last_check INTEGER,
      stream_id TEXT
    )
  `);

  // Table des chatters uniques avec leur statut de traitre
  db.exec(`
    CREATE TABLE IF NOT EXISTS chatters (
      username TEXT PRIMARY KEY,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      seen_at_tikyjr INTEGER NOT NULL DEFAULT 0,
      seen_at_etostark INTEGER NOT NULL DEFAULT 0,
      messages_tikyjr INTEGER NOT NULL DEFAULT 0,
      messages_etostark INTEGER NOT NULL DEFAULT 0,
      follows_tikyjr INTEGER DEFAULT NULL,
      follows_etostark INTEGER DEFAULT NULL,
      follow_check_date INTEGER,
      is_traitor INTEGER NOT NULL DEFAULT 0,
      traitor_level TEXT DEFAULT NULL,
      traitor_score REAL NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chatters_traitor
    ON chatters(is_traitor DESC, traitor_score DESC)
  `);

  // Table historique journalier des traitres
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_traitor_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      total_chatters_tikyjr INTEGER NOT NULL,
      total_chatters_etostark INTEGER NOT NULL,
      traitors_count INTEGER NOT NULL,
      traitors_percent REAL NOT NULL,
      new_traitors_today INTEGER NOT NULL DEFAULT 0
    )
  `);

  console.log('[DB] Base de donnees initialisee avec succes');
}

// Initialiser la base de donnees immediatement
initDatabase();

// Fonctions utilitaires pour les insertions

const insertViewerStats = db.prepare(`
  INSERT INTO viewer_stats (streamer, timestamp, viewer_count, is_live, game_name, stream_title)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertStreamEvent = db.prepare(`
  INSERT INTO stream_events (streamer, event_type, timestamp, viewer_count_at_event)
  VALUES (?, ?, ?, ?)
`);

const insertChatMessage = db.prepare(`
  INSERT INTO chat_messages (streamer, username, username_hash, timestamp, message_length)
  VALUES (?, ?, ?, ?, ?)
`);

const insertViewerDropEvent = db.prepare(`
  INSERT INTO viewer_drop_events
  (affected_streamer, triggering_streamer, trigger_event, timestamp, avg_viewers_before, avg_viewers_after, drop_count, drop_percent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertChatterOverlap = db.prepare(`
  INSERT INTO chatter_overlap
  (period_start, period_end, streamer_a, streamer_b, unique_chatters_a, unique_chatters_b, overlap_count, overlap_percent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMigrationEvent = db.prepare(`
  INSERT INTO migration_events
  (from_streamer, to_streamer, timestamp, chatters_from_ending_stream, chatters_appeared_after, migration_score)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const upsertStreamState = db.prepare(`
  INSERT INTO stream_state (streamer, is_live, last_check, stream_id)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(streamer) DO UPDATE SET
    is_live = excluded.is_live,
    last_check = excluded.last_check,
    stream_id = excluded.stream_id
`);

const getStreamState = db.prepare(`
  SELECT * FROM stream_state WHERE streamer = ?
`);

// Gestion des chatters et traitres
const upsertChatter = db.prepare(`
  INSERT INTO chatters (username, first_seen, last_seen, seen_at_tikyjr, seen_at_etostark, messages_tikyjr, messages_etostark)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(username) DO UPDATE SET
    last_seen = excluded.last_seen,
    seen_at_tikyjr = CASE WHEN excluded.seen_at_tikyjr = 1 THEN 1 ELSE chatters.seen_at_tikyjr END,
    seen_at_etostark = CASE WHEN excluded.seen_at_etostark = 1 THEN 1 ELSE chatters.seen_at_etostark END,
    messages_tikyjr = chatters.messages_tikyjr + excluded.messages_tikyjr,
    messages_etostark = chatters.messages_etostark + excluded.messages_etostark,
    is_traitor = CASE
      WHEN (CASE WHEN excluded.seen_at_tikyjr = 1 THEN 1 ELSE chatters.seen_at_tikyjr END) = 1
       AND (CASE WHEN excluded.seen_at_etostark = 1 THEN 1 ELSE chatters.seen_at_etostark END) = 1
      THEN 1 ELSE chatters.is_traitor END
`);

const getChatter = db.prepare(`
  SELECT * FROM chatters WHERE username = ?
`);

const updateChatterFollow = db.prepare(`
  UPDATE chatters
  SET follows_tikyjr = ?, follows_etostark = ?, follow_check_date = ?,
      traitor_score = CASE
        WHEN is_traitor = 1 THEN 100.0
        WHEN ? = 1 AND seen_at_etostark = 1 AND seen_at_tikyjr = 0 THEN 50.0
        WHEN ? = 1 AND seen_at_tikyjr = 1 AND seen_at_etostark = 0 THEN 50.0
        ELSE traitor_score
      END,
      traitor_level = CASE
        WHEN is_traitor = 1 THEN 'TRAITRE CONFIRME'
        WHEN ? = 1 AND seen_at_etostark = 1 AND seen_at_tikyjr = 0 THEN 'TRAITRE POTENTIEL'
        WHEN ? = 1 AND seen_at_tikyjr = 1 AND seen_at_etostark = 0 THEN 'TRAITRE POTENTIEL'
        ELSE traitor_level
      END
  WHERE username = ?
`);

const getTraitors = db.prepare(`
  SELECT * FROM chatters
  WHERE is_traitor = 1 OR traitor_score > 0
  ORDER BY traitor_score DESC, messages_tikyjr + messages_etostark DESC
`);

const getTraitorStats = db.prepare(`
  SELECT
    COUNT(*) as total_chatters,
    SUM(CASE WHEN seen_at_tikyjr = 1 THEN 1 ELSE 0 END) as chatters_tikyjr,
    SUM(CASE WHEN seen_at_etostark = 1 THEN 1 ELSE 0 END) as chatters_etostark,
    SUM(CASE WHEN is_traitor = 1 THEN 1 ELSE 0 END) as confirmed_traitors,
    SUM(CASE WHEN traitor_level = 'TRAITRE POTENTIEL' THEN 1 ELSE 0 END) as potential_traitors
  FROM chatters
`);

const getChattersToCheckFollow = db.prepare(`
  SELECT username FROM chatters
  WHERE follow_check_date IS NULL OR follow_check_date < ?
  ORDER BY last_seen DESC
  LIMIT ?
`);

const insertDailyReport = db.prepare(`
  INSERT INTO daily_traitor_report
  (date, total_chatters_tikyjr, total_chatters_etostark, traitors_count, traitors_percent, new_traitors_today)
  VALUES (?, ?, ?, ?, ?, ?)
`);

module.exports = {
  db,
  initDatabase,
  insertViewerStats,
  insertStreamEvent,
  insertChatMessage,
  insertViewerDropEvent,
  insertChatterOverlap,
  insertMigrationEvent,
  upsertStreamState,
  getStreamState,
  upsertChatter,
  getChatter,
  updateChatterFollow,
  getTraitors,
  getTraitorStats,
  getChattersToCheckFollow,
  insertDailyReport
};
