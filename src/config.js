module.exports = {
  // Streamers a surveiller
  streamers: [
    (process.env.STREAMER_1 || 'tikyjr').toLowerCase(),
    (process.env.STREAMER_2 || 'etostark').toLowerCase()
  ],

  // Intervalle de polling en secondes
  pollingInterval: parseInt(process.env.POLLING_INTERVAL) || 60,

  // Port du serveur
  port: parseInt(process.env.PORT) || 3001,

  // Configuration de l'analyse
  analysis: {
    // Temps avant/apres un evenement pour calculer la chute de viewers (en secondes)
    dropAnalysisWindow: 3 * 60, // 3 minutes

    // Temps apres la fin d'un stream pour analyser les migrations (en secondes)
    migrationAnalysisDelay: 10 * 60, // 10 minutes

    // Periode pour recuperer les chatters du stream termine
    migrationSourcePeriod: 60 * 60 // 1 heure
  },

  // Limites de taux Twitch (requetes par minute)
  twitch: {
    rateLimit: 800, // Twitch autorise ~800 requetes par minute avec un token App
    minPollingInterval: 30 // Minimum 30 secondes entre les polls
  }
};
