const axios = require('axios');
const twitchApi = require('./twitchApi');
const { db, upsertChatter } = require('./database');

// Client ID pour les requetes GQL (celui de Twitch web)
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

class VodChatScraper {
  constructor() {
    this.streamers = (process.env.STREAMERS || 'tikyjr,etostark__').split(',').map(s => s.trim().toLowerCase());
  }

  // Recuperer la liste des VODs d'un streamer via Helix API
  async getVods(streamerLogin, limit = 20) {
    await twitchApi.ensureAuthenticated();

    try {
      const userId = await twitchApi.getUserId(streamerLogin);
      if (!userId) {
        console.error('[VOD Scraper] User ID non trouve pour', streamerLogin);
        return [];
      }

      const response = await axios.get(
        `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=${limit}`,
        { headers: twitchApi.getHeaders() }
      );

      return response.data.data.map(function(vod) {
        return {
          id: vod.id,
          title: vod.title,
          createdAt: vod.created_at,
          duration: vod.duration,
          viewCount: vod.view_count
        };
      });
    } catch (error) {
      console.error('[VOD Scraper] Erreur getVods:', error.message);
      return [];
    }
  }

  // Convertir la duree Twitch (ex: "3h24m10s") en secondes
  parseDuration(duration) {
    var total = 0;
    var hours = duration.match(/(\d+)h/);
    var minutes = duration.match(/(\d+)m/);
    var seconds = duration.match(/(\d+)s/);

    if (hours) total += parseInt(hours[1]) * 3600;
    if (minutes) total += parseInt(minutes[1]) * 60;
    if (seconds) total += parseInt(seconds[1]);

    return total;
  }

  // Recuperer les commentaires d'une VOD via l'API GQL
  async getVodComments(videoId, contentOffsetSeconds = 0) {
    try {
      var query = `
        query VideoCommentsByOffsetOrCursor($videoID: ID!, $contentOffsetSeconds: Int) {
          video(id: $videoID) {
            id
            comments(contentOffsetSeconds: $contentOffsetSeconds) {
              edges {
                cursor
                node {
                  id
                  commenter {
                    id
                    login
                    displayName
                  }
                  contentOffsetSeconds
                  message {
                    fragments {
                      text
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        }
      `;

      var response = await axios.post('https://gql.twitch.tv/gql', {
        query: query,
        variables: {
          videoID: videoId,
          contentOffsetSeconds: contentOffsetSeconds
        }
      }, {
        headers: {
          'Client-ID': GQL_CLIENT_ID,
          'Content-Type': 'application/json'
        }
      });

      var data = response.data;
      if (data && data.data && data.data.video && data.data.video.comments) {
        return data.data.video.comments;
      }

      // Debug: afficher la reponse si pas de comments
      if (data && data.errors) {
        console.error('[VOD Scraper] GQL Errors:', JSON.stringify(data.errors));
      }

      return { edges: [], pageInfo: { hasNextPage: false } };
    } catch (error) {
      console.error('[VOD Scraper] Erreur getVodComments:', error.message);
      if (error.response && error.response.data) {
        console.error('[VOD Scraper] Response:', JSON.stringify(error.response.data));
      }
      return { edges: [], pageInfo: { hasNextPage: false } };
    }
  }

  // Scraper tous les commentaires d'une VOD
  async scrapeVodChat(videoId, videoCreatedAt, streamerLogin, vodDuration) {
    console.log('[VOD Scraper] Scraping VOD', videoId, 'pour', streamerLogin);

    var messages = [];
    var currentOffset = 0;
    var hasNextPage = true;
    var pageCount = 0;
    var maxOffset = this.parseDuration(vodDuration);

    // Timestamp de debut de la VOD
    var vodStartTime = Math.floor(new Date(videoCreatedAt).getTime() / 1000);

    while (hasNextPage && currentOffset < maxOffset) {
      var result = await this.getVodComments(videoId, currentOffset);
      var edges = result.edges || [];

      if (edges.length === 0) {
        hasNextPage = false;
        break;
      }

      var lastOffset = currentOffset;

      for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        var node = edge.node;

        if (node && node.commenter) {
          var username = node.commenter.login || node.commenter.displayName;
          var offsetSeconds = node.contentOffsetSeconds || 0;
          var messageText = '';

          // Reconstituer le message depuis les fragments
          if (node.message && node.message.fragments) {
            for (var j = 0; j < node.message.fragments.length; j++) {
              if (node.message.fragments[j].text) {
                messageText += node.message.fragments[j].text;
              }
            }
          }

          messages.push({
            username: username.toLowerCase(),
            timestamp: vodStartTime + offsetSeconds,
            messageLength: messageText.length
          });

          // Mettre a jour le dernier offset vu
          if (offsetSeconds > lastOffset) {
            lastOffset = offsetSeconds;
          }
        }
      }

      // Pagination: avancer de 30 secondes apres le dernier message
      if (result.pageInfo && result.pageInfo.hasNextPage) {
        currentOffset = lastOffset + 30;
        pageCount++;

        // Log progression
        if (pageCount % 10 === 0) {
          console.log('[VOD Scraper] VOD', videoId, '- Offset', currentOffset + 's -', messages.length, 'messages');
        }

        // Petit delai pour eviter le rate limiting
        await new Promise(function(resolve) { setTimeout(resolve, 100); });
      } else {
        hasNextPage = false;
      }
    }

    console.log('[VOD Scraper] VOD', videoId, 'terminee:', messages.length, 'messages');
    return messages;
  }

  // Verifier si une VOD a deja ete scrapee
  isVodScraped(videoId) {
    var result = db.prepare(`
      SELECT COUNT(*) as count FROM scraped_vods WHERE video_id = ?
    `).get(videoId);
    return result && result.count > 0;
  }

  // Marquer une VOD comme scrapee
  markVodAsScraped(videoId, streamer, messageCount) {
    db.prepare(`
      INSERT OR REPLACE INTO scraped_vods (video_id, streamer, scraped_at, message_count)
      VALUES (?, ?, ?, ?)
    `).run(videoId, streamer, Math.floor(Date.now() / 1000), messageCount);
  }

  // Inserer les messages dans la base de donnees
  insertMessages(messages, streamer) {
    var insertStmt = db.prepare(`
      INSERT INTO chat_messages (streamer, username, username_hash, timestamp, message_length)
      VALUES (?, ?, NULL, ?, ?)
    `);

    var transaction = db.transaction(function(msgs) {
      for (var i = 0; i < msgs.length; i++) {
        var msg = msgs[i];
        insertStmt.run(streamer, msg.username, msg.timestamp, msg.messageLength);
      }
    });

    transaction(messages);
    console.log('[VOD Scraper] Insere', messages.length, 'messages pour', streamer);
  }

  // Mettre a jour la table chatters avec les nouveaux usernames
  updateChatters(messages, streamer) {
    var isTikyjr = streamer === 'tikyjr' ? 1 : 0;
    var isEtostark = streamer === 'etostark__' ? 1 : 0;

    // Grouper par username pour compter les messages
    var userMessageCounts = {};
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      if (!userMessageCounts[msg.username]) {
        userMessageCounts[msg.username] = {
          count: 0,
          firstSeen: msg.timestamp,
          lastSeen: msg.timestamp
        };
      }
      userMessageCounts[msg.username].count++;
      if (msg.timestamp < userMessageCounts[msg.username].firstSeen) {
        userMessageCounts[msg.username].firstSeen = msg.timestamp;
      }
      if (msg.timestamp > userMessageCounts[msg.username].lastSeen) {
        userMessageCounts[msg.username].lastSeen = msg.timestamp;
      }
    }

    var usernames = Object.keys(userMessageCounts);
    console.log('[VOD Scraper] Mise a jour de', usernames.length, 'chatters');

    for (var j = 0; j < usernames.length; j++) {
      var username = usernames[j];
      var data = userMessageCounts[username];

      upsertChatter.run(
        username,
        data.firstSeen,
        data.lastSeen,
        isTikyjr,
        isEtostark,
        isTikyjr ? data.count : 0,
        isEtostark ? data.count : 0
      );
    }
  }

  // Scraper toutes les VODs d'un streamer
  async scrapeStreamerVods(streamerLogin, maxVods = 10) {
    console.log('[VOD Scraper] Debut scraping pour', streamerLogin);

    var vods = await this.getVods(streamerLogin, maxVods);
    console.log('[VOD Scraper] Trouve', vods.length, 'VODs pour', streamerLogin);

    var totalMessages = 0;
    var scrapedCount = 0;

    for (var i = 0; i < vods.length; i++) {
      var vod = vods[i];

      // Verifier si deja scrapee
      if (this.isVodScraped(vod.id)) {
        console.log('[VOD Scraper] VOD', vod.id, 'deja scrapee, skip');
        continue;
      }

      console.log('[VOD Scraper] Scraping VOD', (i + 1) + '/' + vods.length, ':', vod.title, '(' + vod.duration + ')');

      var messages = await this.scrapeVodChat(vod.id, vod.createdAt, streamerLogin, vod.duration);

      if (messages.length > 0) {
        // Mettre a jour uniquement la table chatters (pas de doublons)
        // On n'insere plus dans chat_messages pour eviter les doublons
        this.updateChatters(messages, streamerLogin);

        totalMessages += messages.length;
      }

      // Marquer comme scrapee
      this.markVodAsScraped(vod.id, streamerLogin, messages.length);
      scrapedCount++;

      // Delai entre les VODs
      await new Promise(function(resolve) { setTimeout(resolve, 1000); });
    }

    console.log('[VOD Scraper] Termine pour', streamerLogin, ':', scrapedCount, 'VODs,', totalMessages, 'messages');
    return { vods: scrapedCount, messages: totalMessages };
  }

  // Scraper les VODs de tous les streamers configures
  async scrapeAllStreamers(maxVodsPerStreamer = 10) {
    console.log('[VOD Scraper] Debut du scraping pour tous les streamers');

    var results = {};

    for (var i = 0; i < this.streamers.length; i++) {
      var streamer = this.streamers[i];
      results[streamer] = await this.scrapeStreamerVods(streamer, maxVodsPerStreamer);
    }

    console.log('[VOD Scraper] Scraping termine');
    return results;
  }
}

// Creer la table pour tracker les VODs scrapees
db.exec(`
  CREATE TABLE IF NOT EXISTS scraped_vods (
    video_id TEXT PRIMARY KEY,
    streamer TEXT NOT NULL,
    scraped_at INTEGER NOT NULL,
    message_count INTEGER NOT NULL
  )
`);

module.exports = new VodChatScraper();
