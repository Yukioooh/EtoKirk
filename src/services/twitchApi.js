const axios = require('axios');

class TwitchApiService {
  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID;
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.baseUrl = 'https://api.twitch.tv/helix';
  }

  // Obtenir un token d'acces via Client Credentials Flow
  async authenticate() {
    try {
      const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials'
        }
      });

      this.accessToken = response.data.access_token;
      // Le token expire dans expires_in secondes, on le refresh 5 minutes avant
      this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

      console.log('[Twitch API] Authentification reussie');
      return true;
    } catch (error) {
      // Afficher le message d'erreur approprie
      let errorMessage;
      if (error.response && error.response.data) {
        errorMessage = error.response.data;
      } else {
        errorMessage = error.message;
      }
      console.error('[Twitch API] Erreur d\'authentification:', errorMessage);
      return false;
    }
  }

  // Verifier et renouveler le token si necessaire
  async ensureAuthenticated() {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  // Headers pour les requetes API
  getHeaders() {
    return {
      'Client-ID': this.clientId,
      'Authorization': `Bearer ${this.accessToken}`
    };
  }

  // Recuperer les informations des utilisateurs par login
  async getUsers(logins) {
    await this.ensureAuthenticated();

    try {
      const params = logins.map(function(login) {
        return 'login=' + login;
      }).join('&');

      const response = await axios.get(this.baseUrl + '/users?' + params, {
        headers: this.getHeaders()
      });

      return response.data.data;
    } catch (error) {
      let errorMessage;
      if (error.response && error.response.data) {
        errorMessage = error.response.data;
      } else {
        errorMessage = error.message;
      }
      console.error('[Twitch API] Erreur getUsers:', errorMessage);
      return [];
    }
  }

  // Recuperer les streams en cours pour des utilisateurs
  async getStreams(userLogins) {
    await this.ensureAuthenticated();

    try {
      const params = userLogins.map(function(login) {
        return 'user_login=' + login;
      }).join('&');

      const response = await axios.get(this.baseUrl + '/streams?' + params, {
        headers: this.getHeaders()
      });

      return response.data.data;
    } catch (error) {
      let errorMessage;
      if (error.response && error.response.data) {
        errorMessage = error.response.data;
      } else {
        errorMessage = error.message;
      }
      console.error('[Twitch API] Erreur getStreams:', errorMessage);
      return [];
    }
  }

  // Recuperer les statistiques de viewers pour les streamers surveilles
  async getStreamersStats(streamers) {
    const streams = await this.getStreams(streamers);
    const stats = {};

    // Initialiser tous les streamers comme offline
    for (const streamer of streamers) {
      stats[streamer.toLowerCase()] = {
        isLive: false,
        viewerCount: 0,
        gameName: null,
        title: null,
        streamId: null,
        startedAt: null
      };
    }

    // Mettre a jour avec les donnees des streams actifs
    for (const stream of streams) {
      const login = stream.user_login.toLowerCase();
      stats[login] = {
        isLive: true,
        viewerCount: stream.viewer_count,
        gameName: stream.game_name,
        title: stream.title,
        streamId: stream.id,
        startedAt: stream.started_at
      };
    }

    return stats;
  }

  // Cache des IDs utilisateurs
  userIdCache = new Map();

  // Obtenir l'ID d'un utilisateur par son login
  async getUserId(login) {
    if (this.userIdCache.has(login)) {
      return this.userIdCache.get(login);
    }

    const users = await this.getUsers([login]);
    if (users.length > 0) {
      this.userIdCache.set(login, users[0].id);
      return users[0].id;
    }
    return null;
  }

  // Verifier si un utilisateur suit un broadcaster
  // Note: Necessite que le chatter ait un compte Twitch public
  async checkFollow(chatterLogin, broadcasterLogin) {
    await this.ensureAuthenticated();

    try {
      const [chatterId, broadcasterId] = await Promise.all([
        this.getUserId(chatterLogin),
        this.getUserId(broadcasterLogin)
      ]);

      if (!chatterId || !broadcasterId) {
        return null; // Utilisateur non trouve
      }

      // Utiliser l'endpoint de verification de follow
      const response = await axios.get(
        `${this.baseUrl}/channels/followers?broadcaster_id=${broadcasterId}&user_id=${chatterId}`,
        { headers: this.getHeaders() }
      );

      // Si data contient un element, l'utilisateur suit le broadcaster
      const followData = response.data.data;
      if (followData && followData.length > 0) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      // 401/403 = pas les permissions necessaires pour cette requete
      const statusCode = error.response ? error.response.status : null;
      if (statusCode === 401 || statusCode === 403) {
        return null; // Impossible de verifier
      }

      // Afficher l'erreur
      let errorMessage;
      if (error.response && error.response.data) {
        errorMessage = error.response.data;
      } else {
        errorMessage = error.message;
      }
      console.error('[Twitch API] Erreur checkFollow:', errorMessage);
      return null;
    }
  }

  // Obtenir les infos de follow avec la date
  async getFollowInfo(chatterLogin, broadcasterLogin) {
    await this.ensureAuthenticated();

    try {
      const [chatterId, broadcasterId] = await Promise.all([
        this.getUserId(chatterLogin),
        this.getUserId(broadcasterLogin)
      ]);

      if (!chatterId || !broadcasterId) {
        return null;
      }

      const response = await axios.get(
        `${this.baseUrl}/channels/followers?broadcaster_id=${broadcasterId}&user_id=${chatterId}`,
        { headers: this.getHeaders() }
      );

      const followData = response.data.data;
      if (followData && followData.length > 0) {
        return {
          follows: true,
          followedAt: followData[0].followed_at
        };
      } else {
        return {
          follows: false,
          followedAt: null
        };
      }
    } catch (error) {
      const statusCode = error.response ? error.response.status : null;
      if (statusCode === 401 || statusCode === 403) {
        return null;
      }
      console.error('[Twitch API] Erreur getFollowInfo:', error.message);
      return null;
    }
  }

  // Verifier les follows en batch (avec rate limiting)
  async checkFollowsBatch(chatterLogins, broadcasterLogin, delayMs = 100) {
    const results = new Map();

    for (const login of chatterLogins) {
      const follows = await this.checkFollow(login, broadcasterLogin);
      results.set(login, follows);

      // Petit delai pour respecter les rate limits
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}

module.exports = new TwitchApiService();
