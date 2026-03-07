const tmi = require('tmi.js');
const crypto = require('crypto');
const { insertChatMessage, upsertChatter, db } = require('./database');

class ChatBotService {
  constructor() {
    this.client = null;
    this.channels = [];
    this.messageBuffer = [];
    this.chatterBuffer = new Map(); // Pour accumuler les chatters avant insertion
    this.flushInterval = null;
    this.newTraitorsToday = 0;
  }

  // Hash un username pour l'anonymisation (optionnel)
  hashUsername(username) {
    return crypto.createHash('sha256').update(username.toLowerCase()).digest('hex').substring(0, 16);
  }

  initialize(channels) {
    this.channels = channels.map(c => c.toLowerCase());

    // Configuration TMI.js - connexion anonyme (lecture seule)
    this.client = new tmi.Client({
      options: { debug: false },
      connection: {
        secure: true,
        reconnect: true
      },
      channels: this.channels
    });

    this.setupEventHandlers();

    // Flush le buffer toutes les 5 secondes pour eviter trop d'ecritures
    this.flushInterval = setInterval(() => {
      this.flushMessageBuffer();
    }, 5000);

    console.log(`[ChatBot] Initialise pour les channels: ${this.channels.join(', ')}`);
  }

  setupEventHandlers() {
    // Connexion reussie
    this.client.on('connected', (address, port) => {
      console.log(`[ChatBot] Connecte a ${address}:${port}`);
    });

    // Rejoindre un channel
    this.client.on('join', (channel, username, self) => {
      if (self) {
        console.log(`[ChatBot] Rejoint le channel ${channel}`);
      }
    });

    // Reception d'un message
    this.client.on('message', (channel, tags, message, self) => {
      if (self) return; // Ignorer nos propres messages

      const streamer = channel.replace('#', '').toLowerCase();
      const username = tags.username.toLowerCase();
      const timestamp = Math.floor(Date.now() / 1000);

      // Ajouter au buffer
      this.messageBuffer.push({
        streamer,
        username,
        usernameHash: this.hashUsername(username),
        timestamp,
        messageLength: message.length
      });
    });

    // Gestion des erreurs
    this.client.on('disconnected', (reason) => {
      console.log(`[ChatBot] Deconnecte: ${reason}`);
    });
  }

  flushMessageBuffer() {
    if (this.messageBuffer.length === 0) return;

    const messages = [...this.messageBuffer];
    this.messageBuffer = [];

    // Accumuler les stats par chatter
    const chatterStats = new Map();
    for (const msg of messages) {
      const key = msg.username;
      if (!chatterStats.has(key)) {
        chatterStats.set(key, {
          username: msg.username,
          timestamp: msg.timestamp,
          tikyjr: 0,
          etostark: 0
        });
      }
      const stats = chatterStats.get(key);
      stats.timestamp = Math.max(stats.timestamp, msg.timestamp);
      if (msg.streamer === 'tikyjr') {
        stats.tikyjr++;
      } else if (msg.streamer === 'etostark') {
        stats.etostark++;
      }
    }

    // Inserer en batch pour de meilleures performances
    const insertMany = db.transaction((msgs, chatters) => {
      // Inserer les messages
      for (const msg of msgs) {
        insertChatMessage.run(
          msg.streamer,
          msg.username,
          msg.usernameHash,
          msg.timestamp,
          msg.messageLength
        );
      }

      // Mettre a jour les chatters et detecter les traitres
      for (const [username, stats] of chatters) {
        let seenTikyjr;
        if (stats.tikyjr > 0) {
          seenTikyjr = 1;
        } else {
          seenTikyjr = 0;
        }

        let seenEtostark;
        if (stats.etostark > 0) {
          seenEtostark = 1;
        } else {
          seenEtostark = 0;
        }

        // Verifier si c'est un nouveau traitre
        const existing = db.prepare('SELECT is_traitor, seen_at_tikyjr, seen_at_etostark FROM chatters WHERE username = ?').get(username);
        const wasTraitor = existing?.is_traitor === 1;
        const willBeTraitor = (existing?.seen_at_tikyjr === 1 || seenTikyjr) && (existing?.seen_at_etostark === 1 || seenEtostark);

        if (!wasTraitor && willBeTraitor) {
          this.newTraitorsToday++;
          console.log(`[TRAITRE] Nouveau traitre detecte: ${username}`);
        }

        upsertChatter.run(
          username,
          stats.timestamp, // first_seen (sera ignore si existe deja)
          stats.timestamp, // last_seen
          seenTikyjr,
          seenEtostark,
          stats.tikyjr,
          stats.etostark
        );
      }
    });

    try {
      insertMany(messages, chatterStats);
      if (messages.length > 10) {
        console.log(`[ChatBot] ${messages.length} messages enregistres`);
      }
    } catch (error) {
      console.error('[ChatBot] Erreur lors de l\'enregistrement:', error.message);
    }
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('[ChatBot] Connexion etablie');
    } catch (error) {
      console.error('[ChatBot] Erreur de connexion:', error.message);
    }
  }

  async disconnect() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushMessageBuffer(); // Flush final

    if (this.client) {
      await this.client.disconnect();
      console.log('[ChatBot] Deconnecte');
    }
  }

  // Stats en temps reel
  getStats() {
    return {
      channels: this.channels,
      bufferSize: this.messageBuffer.length,
      connected: this.client?.readyState() === 'OPEN'
    };
  }
}

module.exports = new ChatBotService();
