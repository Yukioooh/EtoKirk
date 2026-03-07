const puppeteer = require('puppeteer');

// Cache pour eviter de scraper trop souvent
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function scrapeFollows(username) {
  // Verifier le cache
  const cacheKey = username.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const url = 'https://tools.2807.eu/follows?user=' + encodeURIComponent(username);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Attendre que la grid soit chargee
    await page.waitForSelector('.Home-module__hddkcW__grid', { timeout: 10000 });

    // Attendre un peu plus pour que les donnees se chargent
    await new Promise(function(resolve) { setTimeout(resolve, 2000); });

    // Extraire les follows
    const follows = await page.evaluate(function() {
      var result = [];
      var cards = document.querySelectorAll('.Home-module__hddkcW__card');

      cards.forEach(function(card) {
        var href = card.getAttribute('href');
        var channelName = '';
        var followDate = '';

        // Extraire le nom de la chaine depuis l'URL
        if (href) {
          var match = href.match(/twitch\.tv\/([^\/]+)/);
          if (match) {
            channelName = match[1].toLowerCase();
          }
        }

        // Extraire la date de follow
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

    // Mettre en cache
    cache.set(cacheKey, {
      timestamp: Date.now(),
      data: follows
    });

    return follows;
  } catch (error) {
    console.error('[FollowScraper] Erreur:', error.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Chercher si un user follow un channel specifique
async function checkFollowsChannel(username, channelName) {
  var follows = await scrapeFollows(username);
  var channelLower = channelName.toLowerCase();

  for (var i = 0; i < follows.length; i++) {
    if (follows[i].channel === channelLower) {
      return {
        follows: true,
        followedAt: follows[i].followedAt
      };
    }
  }

  return {
    follows: false,
    followedAt: null
  };
}

module.exports = {
  scrapeFollows: scrapeFollows,
  checkFollowsChannel: checkFollowsChannel
};
