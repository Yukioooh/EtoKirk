const puppeteer = require('puppeteer');
const { db } = require('./database');

// Cache memoire pour eviter les requetes DB repetees
const memoryCache = new Map();
const MEMORY_CACHE_DURATION = 60 * 1000; // 1 minute

// Duree du cache DB (1 heure)
const DB_CACHE_DURATION = 60 * 60; // 1 heure en secondes

// Queue pour limiter les scrapes simultanes
var scrapeQueue = [];
var isProcessingQueue = false;
var lastScrapeTime = 0;
const MIN_SCRAPE_INTERVAL = 3000; // 3 secondes entre chaque scrape

// Creer la table de cache si elle n'existe pas
db.exec(`
  CREATE TABLE IF NOT EXISTS follow_cache (
    username TEXT NOT NULL,
    channel TEXT NOT NULL,
    follows INTEGER NOT NULL,
    followed_at TEXT,
    cached_at INTEGER NOT NULL,
    PRIMARY KEY (username, channel)
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_follow_cache_cached_at
  ON follow_cache(cached_at)
`);

// Recuperer les follows depuis le cache DB
function getCachedFollows(username, channel) {
  var cacheKey = username.toLowerCase() + ':' + channel.toLowerCase();

  // Verifier le cache memoire d'abord
  var memCached = memoryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < MEMORY_CACHE_DURATION) {
    return memCached.data;
  }

  // Sinon verifier le cache DB
  var now = Math.floor(Date.now() / 1000);
  var minCacheTime = now - DB_CACHE_DURATION;

  var cached = db.prepare(`
    SELECT * FROM follow_cache
    WHERE username = ? AND channel = ? AND cached_at > ?
  `).get(username.toLowerCase(), channel.toLowerCase(), minCacheTime);

  if (cached) {
    var result = {
      follows: cached.follows === 1,
      followedAt: cached.followed_at
    };
    // Mettre en cache memoire
    memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  return null;
}

// Sauvegarder dans le cache DB
function saveToCache(username, channel, follows, followedAt) {
  var now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT OR REPLACE INTO follow_cache (username, channel, follows, followed_at, cached_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(username.toLowerCase(), channel.toLowerCase(), follows ? 1 : 0, followedAt, now);

  // Mettre a jour le cache memoire aussi
  var cacheKey = username.toLowerCase() + ':' + channel.toLowerCase();
  memoryCache.set(cacheKey, {
    timestamp: Date.now(),
    data: { follows: follows, followedAt: followedAt }
  });
}

// Scraper les follows d'un utilisateur (fonction interne)
async function scrapeFollowsInternal(username) {
  var browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    var page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    var url = 'https://tools.2807.eu/follows?user=' + encodeURIComponent(username);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Attendre que la grid soit chargee
    await page.waitForSelector('.Home-module__hddkcW__grid', { timeout: 10000 });
    await new Promise(function(resolve) { setTimeout(resolve, 2000); });

    // Extraire les follows
    var follows = await page.evaluate(function() {
      var result = [];
      var cards = document.querySelectorAll('.Home-module__hddkcW__card');

      cards.forEach(function(card) {
        var href = card.getAttribute('href');
        var channelName = '';
        var followDate = '';

        if (href) {
          var match = href.match(/twitch\.tv\/([^\/]+)/);
          if (match) {
            channelName = match[1].toLowerCase();
          }
        }

        var dateElement = card.querySelector('p');
        if (dateElement) {
          followDate = dateElement.textContent.trim();
        }

        if (channelName) {
          result.push({
            channel: channelName,
            followedAt: followDate
          });
        }
      });

      return result;
    });

    return follows;
  } catch (error) {
    console.error('[FollowScraper] Erreur scrape:', error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Traiter la queue de scraping
async function processQueue() {
  if (isProcessingQueue || scrapeQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (scrapeQueue.length > 0) {
    // Respecter l'intervalle minimum entre les scrapes
    var timeSinceLastScrape = Date.now() - lastScrapeTime;
    if (timeSinceLastScrape < MIN_SCRAPE_INTERVAL) {
      await new Promise(function(resolve) {
        setTimeout(resolve, MIN_SCRAPE_INTERVAL - timeSinceLastScrape);
      });
    }

    var task = scrapeQueue.shift();
    lastScrapeTime = Date.now();

    try {
      var follows = await scrapeFollowsInternal(task.username);

      if (follows !== null) {
        // Sauvegarder les resultats pour tikyjr et etostark
        var tikyjrFollow = follows.find(function(f) { return f.channel === 'tikyjr'; });
        var etostarkFollow = follows.find(function(f) { return f.channel === 'etostark__'; });

        saveToCache(task.username, 'tikyjr', !!tikyjrFollow, tikyjrFollow ? tikyjrFollow.followedAt : null);
        saveToCache(task.username, 'etostark__', !!etostarkFollow, etostarkFollow ? etostarkFollow.followedAt : null);

        console.log('[FollowScraper] Cache mis a jour pour', task.username);
      }

      if (task.resolve) {
        task.resolve(follows);
      }
    } catch (error) {
      console.error('[FollowScraper] Erreur queue:', error.message);
      if (task.reject) {
        task.reject(error);
      }
    }
  }

  isProcessingQueue = false;
}

// Ajouter un utilisateur a la queue de scraping (en arriere-plan)
function queueScrape(username) {
  // Verifier si deja dans la queue
  var alreadyQueued = scrapeQueue.some(function(task) {
    return task.username.toLowerCase() === username.toLowerCase();
  });

  if (!alreadyQueued) {
    scrapeQueue.push({ username: username.toLowerCase() });
    processQueue();
  }
}

// Verifier si un user follow un channel (retourne cache ou null)
function checkFollowsChannelCached(username, channelName) {
  return getCachedFollows(username, channelName);
}

// Verifier si un user follow un channel (avec scrape si necessaire)
async function checkFollowsChannel(username, channelName) {
  // D'abord verifier le cache
  var cached = getCachedFollows(username, channelName);
  if (cached !== null) {
    return cached;
  }

  // Si pas en cache, ajouter a la queue et retourner null
  // L'appelant recevra les donnees au prochain appel
  queueScrape(username);

  return {
    follows: null,
    followedAt: null
  };
}

// Rafraichir les follows des top traitres (a appeler periodiquement)
function refreshTopTraitorsFollows() {
  var traitors = db.prepare(`
    SELECT username FROM chatters
    WHERE is_traitor = 1
    ORDER BY (messages_tikyjr + messages_etostark) DESC
    LIMIT 20
  `).all();

  console.log('[FollowScraper] Rafraichissement des follows pour', traitors.length, 'traitres');

  for (var i = 0; i < traitors.length; i++) {
    queueScrape(traitors[i].username);
  }
}

module.exports = {
  checkFollowsChannel: checkFollowsChannel,
  checkFollowsChannelCached: checkFollowsChannelCached,
  queueScrape: queueScrape,
  refreshTopTraitorsFollows: refreshTopTraitorsFollows,
  getCachedFollows: getCachedFollows
};
