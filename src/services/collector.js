const twitchApi = require('./twitchApi');
const {
  db,
  insertViewerStats,
  insertStreamEvent,
  upsertStreamState,
  getStreamState
} = require('./database');
const analysisService = require('./analysis');

class CollectorService {
  constructor() {
    this.streamers = [];
    this.isRunning = false;
  }

  initialize(streamers) {
    this.streamers = streamers.map(s => s.toLowerCase());
    console.log(`[Collector] Initialise pour les streamers: ${this.streamers.join(', ')}`);
  }

  async collectViewerStats() {
    if (this.streamers.length === 0) {
      console.warn('[Collector] Aucun streamer configure');
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const stats = await twitchApi.getStreamersStats(this.streamers);

      for (const streamer of this.streamers) {
        const stat = stats[streamer];

        // Enregistrer les stats de viewers
        insertViewerStats.run(
          streamer,
          timestamp,
          stat.viewerCount,
          stat.isLive ? 1 : 0,
          stat.gameName,
          stat.title
        );

        // Verifier les changements d'etat du stream
        await this.checkStreamStateChange(streamer, stat, timestamp);
      }

      console.log(`[Collector] Stats collectees - ${this.streamers.map(s => `${s}: ${stats[s].viewerCount} viewers (${stats[s].isLive ? 'LIVE' : 'OFFLINE'})`).join(', ')}`);
    } catch (error) {
      console.error('[Collector] Erreur lors de la collecte:', error.message);
    }
  }

  async checkStreamStateChange(streamer, currentStats, timestamp) {
    const previousState = getStreamState.get(streamer);
    const wasLive = previousState?.is_live === 1;
    const isNowLive = currentStats.isLive;

    // Stream vient de demarrer
    if (!wasLive && isNowLive) {
      console.log(`[Collector] EVENEMENT: ${streamer} vient de lancer son stream!`);

      insertStreamEvent.run(streamer, 'START', timestamp, currentStats.viewerCount);

      // Declencher l'analyse de chute de viewers pour l'autre streamer
      const otherStreamer = this.streamers.find(s => s !== streamer);
      if (otherStreamer) {
        setTimeout(() => {
          analysisService.analyzeViewerDrop(otherStreamer, streamer, 'START', timestamp);
        }, 3 * 60 * 1000); // Attendre 3 minutes pour avoir les donnees "apres"
      }
    }

    // Stream vient de se terminer
    if (wasLive && !isNowLive) {
      console.log(`[Collector] EVENEMENT: ${streamer} vient de couper son stream!`);

      insertStreamEvent.run(streamer, 'END', timestamp, 0);

      // Declencher l'analyse de migration vers l'autre streamer
      const otherStreamer = this.streamers.find(s => s !== streamer);
      if (otherStreamer) {
        setTimeout(() => {
          analysisService.analyzeMigration(streamer, otherStreamer, timestamp);
        }, 10 * 60 * 1000); // Attendre 10 minutes
      }
    }

    // Mettre a jour l'etat
    upsertStreamState.run(
      streamer,
      isNowLive ? 1 : 0,
      timestamp,
      currentStats.streamId
    );
  }

  start(intervalSeconds) {
    if (this.isRunning) {
      console.warn('[Collector] Deja en cours d\'execution');
      return;
    }

    this.isRunning = true;
    console.log(`[Collector] Demarrage avec intervalle de ${intervalSeconds} secondes`);

    // Premiere collecte immediate
    this.collectViewerStats();

    // Puis collectes regulieres
    this.interval = setInterval(() => {
      this.collectViewerStats();
    }, intervalSeconds * 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.isRunning = false;
      console.log('[Collector] Arrete');
    }
  }
}

module.exports = new CollectorService();
