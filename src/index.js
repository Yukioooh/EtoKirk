require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const { initDatabase } = require('./services/database');
const twitchApi = require('./services/twitchApi');
const collector = require('./services/collector');
const chatBot = require('./services/chatBot');
const analysisService = require('./services/analysis');
const traitorService = require('./services/traitorService');
const followScraper = require('./services/followScraper');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Servir le frontend en production
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Routes API
app.use('/api/stats', statsRoutes);

// Route de sante
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    chatBot: chatBot.getStats()
  });
});

// Initialisation
async function initialize() {
  console.log('===========================================');
  console.log('  Twitch Correlation Analyzer');
  console.log('  TikyJr <-> Etostark');
  console.log('===========================================\n');

  // Verifier les variables d'environnement
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    console.error('[ERREUR] Variables TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET requises');
    console.error('Copiez .env.example vers .env et remplissez vos credentials Twitch');
    process.exit(1);
  }

  const streamers = [
    process.env.STREAMER_1 || 'tikyjr',
    process.env.STREAMER_2 || 'etostark'
  ];

  console.log(`[Config] Streamers surveilles: ${streamers.join(', ')}`);

  // Initialiser la base de donnees
  initDatabase();

  // Initialiser les services
  collector.initialize(streamers);
  analysisService.initialize(streamers);
  traitorService.initialize(streamers);
  chatBot.initialize(streamers);

  // Authentification Twitch
  const authSuccess = await twitchApi.authenticate();
  if (!authSuccess) {
    console.error('[ERREUR] Impossible de s\'authentifier aupres de Twitch');
    process.exit(1);
  }

  // Demarrer la collecte de viewers
  const pollingInterval = parseInt(process.env.POLLING_INTERVAL) || 60;
  collector.start(pollingInterval);

  // Connecter le bot chat
  await chatBot.connect();

  // Calculer le chevauchement quotidien a minuit
  cron.schedule('0 0 * * *', () => {
    console.log('[Cron] Calcul du chevauchement quotidien...');
    analysisService.calculateDailyOverlap();
  });

  // Generer le rapport des traitres tous les jours a 23h59
  cron.schedule('59 23 * * *', () => {
    console.log('[Cron] Generation du rapport journalier des traitres...');
    traitorService.generateDailyReport();
  });

  // Verifier les follows toutes les 6 heures (pour detecter les traitres potentiels)
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Verification des follows...');
    await traitorService.checkFollowsForRecentChatters(100);
  });

  // Rafraichir le cache des follows des top traitres toutes les 30 minutes
  cron.schedule('*/30 * * * *', () => {
    console.log('[Cron] Rafraichissement cache follows...');
    followScraper.refreshTopTraitorsFollows();
  });

  // Lancer un premier rafraichissement au demarrage (apres 10 secondes)
  setTimeout(function() {
    followScraper.refreshTopTraitorsFollows();
  }, 10000);

  // Demarrer le serveur
  app.listen(PORT, () => {
    console.log(`\n[Server] API disponible sur http://localhost:${PORT}`);
    console.log(`[Server] Dashboard sur http://localhost:${PORT}`);
    console.log('\n[System] Pret! Collecte des donnees en cours...\n');
  });
}

// Gestion propre de l'arret
process.on('SIGINT', async () => {
  console.log('\n[System] Arret en cours...');
  collector.stop();
  await chatBot.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  collector.stop();
  await chatBot.disconnect();
  process.exit(0);
});

// Demarrer
initialize().catch(error => {
  console.error('[ERREUR FATALE]', error);
  process.exit(1);
});
