const {
  db,
  getTraitors,
  getTraitorStats,
  getChattersToCheckFollow,
  updateChatterFollow,
  insertDailyReport
} = require('./database');
const twitchApi = require('./twitchApi');

class TraitorService {
  constructor() {
    this.streamers = [];
    this.isCheckingFollows = false;
  }

  initialize(streamers) {
    this.streamers = streamers.map(s => s.toLowerCase());
  }

  // Obtenir tous les traitres (confirmes et potentiels)
  getAllTraitors(limit = 100) {
    try {
      const traitors = db.prepare(`
        SELECT * FROM chatters
        WHERE is_traitor = 1 OR traitor_score > 0
        ORDER BY
          CASE WHEN is_traitor = 1 THEN 0 ELSE 1 END,
          traitor_score DESC,
          messages_tikyjr + messages_etostark DESC
        LIMIT ?
      `).all(limit);

      return traitors.map(t => ({
        username: t.username,
        isConfirmedTraitor: t.is_traitor === 1,
        traitorLevel: t.traitor_level || (t.is_traitor === 1 ? 'TRAITRE CONFIRME' : null),
        traitorScore: t.traitor_score,
        messagesTikyjr: t.messages_tikyjr,
        messagesEtostark: t.messages_etostark,
        totalMessages: t.messages_tikyjr + t.messages_etostark,
        followsTikyjr: t.follows_tikyjr,
        followsEtostark: t.follows_etostark,
        firstSeen: t.first_seen * 1000,
        lastSeen: t.last_seen * 1000
      }));
    } catch (error) {
      console.error('[TraitorService] Erreur getAllTraitors:', error.message);
      return [];
    }
  }

  // Statistiques globales sur les traitres
  getStats() {
    try {
      const stats = getTraitorStats.get();
      return {
        totalChatters: stats.total_chatters,
        chattersTikyjr: stats.chatters_tikyjr,
        chattersEtostark: stats.chatters_etostark,
        confirmedTraitors: stats.confirmed_traitors,
        potentialTraitors: stats.potential_traitors,
        traitorPercent: stats.total_chatters > 0
          ? ((stats.confirmed_traitors / stats.total_chatters) * 100).toFixed(2)
          : 0
      };
    } catch (error) {
      console.error('[TraitorService] Erreur getStats:', error.message);
      return null;
    }
  }

  // Verifier les follows pour les chatters recents
  async checkFollowsForRecentChatters(batchSize = 50) {
    if (this.isCheckingFollows) {
      console.log('[TraitorService] Verification des follows deja en cours...');
      return;
    }

    this.isCheckingFollows = true;
    console.log('[TraitorService] Debut de la verification des follows...');

    try {
      // Recuperer les chatters qui n'ont pas ete verifies recemment (> 24h)
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
      const chattersToCheck = getChattersToCheckFollow.all(oneDayAgo, batchSize);

      if (chattersToCheck.length === 0) {
        console.log('[TraitorService] Aucun chatter a verifier');
        return;
      }

      console.log(`[TraitorService] Verification de ${chattersToCheck.length} chatters...`);

      let checkedCount = 0;
      let potentialTraitorsFound = 0;

      for (const { username } of chattersToCheck) {
        try {
          // Verifier si le chatter suit tikyjr et etostark
          const [followsTikyjr, followsEtostark] = await Promise.all([
            twitchApi.checkFollow(username, 'tikyjr'),
            twitchApi.checkFollow(username, 'etostark')
          ]);

          const now = Math.floor(Date.now() / 1000);

          // Determiner les valeurs de follow
          let followsTikyjrValue;
          if (followsTikyjr === true) {
            followsTikyjrValue = 1;
          } else if (followsTikyjr === false) {
            followsTikyjrValue = 0;
          } else {
            followsTikyjrValue = null;
          }

          let followsEtostarkValue;
          if (followsEtostark === true) {
            followsEtostarkValue = 1;
          } else if (followsEtostark === false) {
            followsEtostarkValue = 0;
          } else {
            followsEtostarkValue = null;
          }

          // Mettre a jour dans la base
          updateChatterFollow.run(
            followsTikyjrValue,
            followsEtostarkValue,
            now,
            followsTikyjrValue === 1 ? 1 : 0,
            followsEtostarkValue === 1 ? 1 : 0,
            followsTikyjrValue === 1 ? 1 : 0,
            followsEtostarkValue === 1 ? 1 : 0,
            username
          );

          checkedCount++;

          // Verifier si c'est un traitre potentiel
          const chatter = db.prepare('SELECT * FROM chatters WHERE username = ?').get(username);
          if (chatter && chatter.traitor_level === 'TRAITRE POTENTIEL') {
            potentialTraitorsFound++;
            console.log(`[TraitorService] Traitre potentiel: ${username} (follow l'autre streamer)`);
          }

          // Petit delai pour eviter le rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`[TraitorService] Erreur pour ${username}:`, error.message);
        }
      }

      console.log(`[TraitorService] Verification terminee: ${checkedCount} chatters, ${potentialTraitorsFound} traitres potentiels`);
    } catch (error) {
      console.error('[TraitorService] Erreur checkFollowsForRecentChatters:', error.message);
    } finally {
      this.isCheckingFollows = false;
    }
  }

  // Generer le rapport journalier
  generateDailyReport() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const stats = this.getStats();

      if (!stats) return null;

      // Compter les nouveaux traitres d'aujourd'hui
      const todayStart = Math.floor(new Date(today).getTime() / 1000);
      const newTraitors = db.prepare(`
        SELECT COUNT(*) as count FROM chatters
        WHERE is_traitor = 1 AND first_seen >= ?
      `).get(todayStart).count;

      insertDailyReport.run(
        today,
        stats.chattersTikyjr,
        stats.chattersEtostark,
        stats.confirmedTraitors,
        parseFloat(stats.traitorPercent),
        newTraitors
      );

      console.log(`[TraitorService] Rapport journalier genere pour ${today}`);
      console.log(`  - Chatters TikyJr: ${stats.chattersTikyjr}`);
      console.log(`  - Chatters Etostark: ${stats.chattersEtostark}`);
      console.log(`  - Traitres confirmes: ${stats.confirmedTraitors} (${stats.traitorPercent}%)`);
      console.log(`  - Nouveaux traitres aujourd'hui: ${newTraitors}`);

      return {
        date: today,
        ...stats,
        newTraitorsToday: newTraitors
      };
    } catch (error) {
      console.error('[TraitorService] Erreur generateDailyReport:', error.message);
      return null;
    }
  }

  // Obtenir l'historique des rapports
  getReportHistory(days = 30) {
    try {
      return db.prepare(`
        SELECT * FROM daily_traitor_report
        ORDER BY date DESC
        LIMIT ?
      `).all(days);
    } catch (error) {
      console.error('[TraitorService] Erreur getReportHistory:', error.message);
      return [];
    }
  }

  // Top traitres par nombre de messages
  getTopTraitors(limit = 20) {
    try {
      return db.prepare(`
        SELECT
          username,
          messages_tikyjr,
          messages_etostark,
          messages_tikyjr + messages_etostark as total_messages,
          traitor_score,
          traitor_level,
          follows_tikyjr,
          follows_etostark,
          first_seen,
          last_seen
        FROM chatters
        WHERE is_traitor = 1
        ORDER BY total_messages DESC
        LIMIT ?
      `).all(limit).map(t => ({
        ...t,
        firstSeen: t.first_seen * 1000,
        lastSeen: t.last_seen * 1000
      }));
    } catch (error) {
      console.error('[TraitorService] Erreur getTopTraitors:', error.message);
      return [];
    }
  }

  // Rechercher un chatter specifique
  searchChatter(username) {
    try {
      // Utiliser des parametres separes pour plus de securite
      const searchPattern = `%${username.toLowerCase()}%`;
      const chatter = db.prepare(`
        SELECT * FROM chatters WHERE LOWER(username) LIKE ?
      `).all(searchPattern);

      return chatter.map(c => ({
        username: c.username,
        isTraitor: c.is_traitor === 1,
        traitorLevel: c.traitor_level,
        traitorScore: c.traitor_score,
        messagesTikyjr: c.messages_tikyjr,
        messagesEtostark: c.messages_etostark,
        followsTikyjr: c.follows_tikyjr,
        followsEtostark: c.follows_etostark,
        firstSeen: c.first_seen * 1000,
        lastSeen: c.last_seen * 1000
      }));
    } catch (error) {
      console.error('[TraitorService] Erreur searchChatter:', error.message);
      return [];
    }
  }
}

module.exports = new TraitorService();
