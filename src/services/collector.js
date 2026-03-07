const twitchApi = require('./twitchApi');
const {
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
    this.streamers = streamers.map(function(s) {
      return s.toLowerCase();
    });
    console.log('[Collector] Initialise pour les streamers: ' + this.streamers.join(', '));
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

        // Convertir le booleen en entier pour la base de donnees
        let isLiveValue;
        if (stat.isLive) {
          isLiveValue = 1;
        } else {
          isLiveValue = 0;
        }

        // Enregistrer les stats de viewers
        insertViewerStats.run(
          streamer,
          timestamp,
          stat.viewerCount,
          isLiveValue,
          stat.gameName,
          stat.title
        );

        // Verifier les changements d'etat du stream
        await this.checkStreamStateChange(streamer, stat, timestamp);
      }

      // Construire le message de log
      const logParts = [];
      for (const streamer of this.streamers) {
        const stat = stats[streamer];
        let statusText;
        if (stat.isLive) {
          statusText = 'LIVE';
        } else {
          statusText = 'OFFLINE';
        }
        logParts.push(streamer + ': ' + stat.viewerCount + ' viewers (' + statusText + ')');
      }
      console.log('[Collector] Stats collectees - ' + logParts.join(', '));
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
      let otherStreamer = null;
      for (const s of this.streamers) {
        if (s !== streamer) {
          otherStreamer = s;
          break;
        }
      }
      if (otherStreamer) {
        setTimeout(function() {
          analysisService.analyzeViewerDrop(otherStreamer, streamer, 'START', timestamp);
        }, 3 * 60 * 1000); // Attendre 3 minutes pour avoir les donnees "apres"
      }
    }

    // Stream vient de se terminer
    if (wasLive && !isNowLive) {
      console.log(`[Collector] EVENEMENT: ${streamer} vient de couper son stream!`);

      insertStreamEvent.run(streamer, 'END', timestamp, 0);

      // Declencher l'analyse de migration vers l'autre streamer
      let otherStreamerForMigration = null;
      for (const s of this.streamers) {
        if (s !== streamer) {
          otherStreamerForMigration = s;
          break;
        }
      }
      if (otherStreamerForMigration) {
        setTimeout(function() {
          analysisService.analyzeMigration(streamer, otherStreamerForMigration, timestamp);
        }, 10 * 60 * 1000); // Attendre 10 minutes
      }
    }

    // Convertir le booleen en entier
    let isNowLiveValue;
    if (isNowLive) {
      isNowLiveValue = 1;
    } else {
      isNowLiveValue = 0;
    }

    // Mettre a jour l'etat
    upsertStreamState.run(
      streamer,
      isNowLiveValue,
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
    console.log('[Collector] Demarrage avec intervalle de ' + intervalSeconds + ' secondes');

    // Premiere collecte immediate
    this.collectViewerStats();

    // Puis collectes regulieres
    const self = this;
    this.interval = setInterval(function() {
      self.collectViewerStats();
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
