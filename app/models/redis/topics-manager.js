/* eslint-disable max-len, no-param-reassign, no-underscore-dangle */
'use strict';
const moment = require('moment-timezone');
const _ = require('lodash');

const config = require('../../config');
const RedisKeys = require('../../redis-keys');
const logger = require('winston').loggers.get('scheduler-logger');
const RedisClient = require('sweetwork-redis-client');
const FeedsManager = require('./feeds-manager');
const cli = new RedisClient(config.get('SVC_SCHEDULER_REDIS_HOST'), config.get('SVC_SCHEDULER_REDIS_PORT'), config.get('REDIS_DB'));

const TOPIC_DEL_FIELDS = ['last_time_crawl', 'keywords_json'];
const TOPIC_PROFILES_JSON_FIELDS = ['included_profiles', 'restricted_profiles', 'excluded_profiles'];
const TOPIC_JSON_FIELDS = ['custom', 'or', 'and', 'exclude'];
const TOPIC_ARRAY_FIELDS = ['sources', 'languages', 'countries'];
const TOPIC_NUMBER_FIELDS = ['client_id'];

class TopicsManagerError extends Error {
  constructor(m) {
    super(m);
    this.message = m;
    this.name = 'TopicsManagerError';
  }
}

class TopicsManager {
  // constructor() {}
  /**
     * _computreReadTimeGrade - method that casts array fields to string fields.
     * Necessary tweet since Redis' key-value store nature does not allow
     * non-string values (like arrays) to be stored.
     *
     * @param  {integer} lastTimeCrawl mandatory unix timestamp of the last time this topic's were crawled
     * @return {string} grade from 'A' thru 'F'
     */
  static _computreReadTimeGrade(lastTimeCrawl) {
    const duration = moment.duration(moment() - moment.unix(lastTimeCrawl)).asSeconds();
    if (duration > 3600) return 'F';
    else if (duration > 1800) {
      // over 1 hour
      return 'E';
    } else if (duration > 600) {
      // < 1 hour
      return 'D';
    } else if (duration > 300) {
      // < 30 min
      return 'C';
    } else if (duration > 180) {
      // < 10 min
      return 'B'; // < 5 min
    }
    return 'A'; // < 2 min
  }
  /**
     * _preStoreProcess - method that casts array fields to string fields.
     * Necessary tweet since Redis' key-value store nature does not allow
     * non-string values (like arrays) to be stored.
     *
     * @param  {object} topicHash mandatory
     * @return {object} topicHash
     */
  static _preStoreProcess(topicHash) {
    if (topicHash && Array.isArray(topicHash.keywords_json)) {
      const keywordsCs = [];
      topicHash.keywords_json.filter(x => Array.isArray(x.block)).forEach(t => {
        t.block.filter(x => x.cs === 'true').forEach(b => {
          keywordsCs.push(['"', b.content, '"'].join(''));
        });
      });
      topicHash.keywords_cs = `(${keywordsCs.join(' OR ')})`;
    }
    TOPIC_ARRAY_FIELDS.forEach(field => {
      if (topicHash && Array.isArray(topicHash[field])) topicHash[field] = topicHash[field].join(',');
    });
    TOPIC_DEL_FIELDS.forEach(field => {
      if (topicHash) delete topicHash[field];
    });
    TOPIC_JSON_FIELDS.forEach(field => {
      if (topicHash) topicHash[field] = topicHash[field] ? JSON.stringify(topicHash[field]) : JSON.stringify([]);
    });
    TOPIC_PROFILES_JSON_FIELDS.forEach(field => {
      if (topicHash && Array.isArray(topicHash[field])) {
        try {
          const profiles = [];
          topicHash[field].forEach(profile => {
            const p = {
              id: profile.id,
              full_name: profile.full_name,
              rss: [],
              accounts: []
            };
            if (Array.isArray(profile.rss)) {
              profile.rss.forEach(rss => {
                p.rss.push({
                  id: rss.url,
                  network: 'rss'
                });
              });
            }
            if (Array.isArray(profile.accounts)) {
              profile.accounts.forEach(account => {
                p.accounts.push({
                  id: account.original_platform_user_id,
                  network: account.network
                });
              });
            }
            profiles.push(p);
          });
          topicHash[field] = JSON.stringify(profiles);
        } catch (e) {
          logger.warn(`Could not JSON.stringify ${field}: ${e}`);
        }
      }
    });
    return topicHash;
  }
  /**
     * _postStoreProcess - method that casts strings fields to arrays or number fields.
     *
     * @param  {object} topicHash mandatory
     * @return {object} topicHash
     */
  static _postStoreProcess(topicHash) {
    TOPIC_ARRAY_FIELDS.forEach(field => {
      if (topicHash && topicHash[field] && topicHash[field].split) topicHash[field] = topicHash[field].split(',');
      else if (topicHash[field] === '') topicHash[field] = [];
    });
    TOPIC_NUMBER_FIELDS.forEach(field => {
      if (topicHash && topicHash[field] && isFinite(parseInt(topicHash[field], 10))) {
        topicHash[field] = parseInt(topicHash[field], 10);
      }
    });
    TOPIC_JSON_FIELDS.forEach(field => {
      try {
        if (topicHash) topicHash[field] = JSON.parse(topicHash[field]);
      } catch (e) {
        logger.warn(`Could not JSON.parse ${field}: ${JSON.stringify(e)}`);
      }
    });
    TOPIC_PROFILES_JSON_FIELDS.forEach(field => {
      if (topicHash && topicHash[field] && typeof topicHash[field] === 'string') {
        try {
          topicHash[field] = JSON.parse(topicHash[field]);
        } catch (e) {
          logger.warn(`Could not JSON.parse ${field}: ${JSON.stringify(e)}`);
        }
      }
    });
    if (topicHash.feeds && topicHash.feeds.length > 0) {
      // last_time_crawl
      const lastTimeCrawl = Math.round(_.meanBy(topicHash.feeds, x => x.last_time_crawl)); // cf. https://lodash.com/docs/4.16.4#meanBy
      if (isFinite(lastTimeCrawl)) topicHash.last_time_crawl = lastTimeCrawl;
      else topicHash.last_time_crawl = null;
      // density
      const density = Math.round(_.meanBy(topicHash.feeds, x => x.density));
      if (isFinite(density)) topicHash.density = density;
      else topicHash.density = null;
      // last time crawl human
      if (topicHash.last_time_crawl) topicHash.last_time_crawl_human = moment.unix(topicHash.last_time_crawl).fromNow();
      else topicHash.last_time_crawl_human = null;
    }
    return topicHash;
  }
  /**
     * get - retrieves a list of topics matching the arguments. This method
     * implements the concept of precedence: a provided topicId will be used
     * over a clientId, itself over a feedId.
     * None of the arguments are mandatory, but at least one must be proveded
     *
     * @param  {number} clientId optional
     * @param  {number} topicId optional
     * @param  {number} feedId optional
     * @return {function} promise - resolves with an array of topics or rejects with an error
     */
  static get(clientId, topicIds = [], withoutFeeds = false) {
    // logger.info(`Gettings topics for topicIds ${JSON.stringify(topicIds)}`);
    const dList = [];
    function getTopicsKeys() {
      return new Promise((resolve, reject) => {
        if (topicIds.length > 0) {
          const topicKeys = [];
          topicIds.forEach(topicId => {
            topicKeys.push(RedisKeys.topic(topicId));
          });
          resolve(topicKeys);
        } else if (clientId) {
          cli
            .zrangebyscore({
              key: RedisKeys.topicsListByClientId(clientId),
              withscores: false,
              limit: Math.pow(10, 3)
            })
            .then(topicKeys => resolve(topicKeys));
        } else reject(new TopicsManagerError('Missing parameters: clientId or topicIds'));
      });
    }
    return new Promise((resolve, reject) => {
      getTopicsKeys().then(
        topicKeys => {
          // logger.info(`Gettings topics for topicKeys ${topicKeys}`);
          if (topicKeys.length === 0) resolve([]);
          const topics = [];
          topicKeys.forEach(topicKey => {
            dList.push(
              new Promise((rslv, rjct) => {
                cli.hgetall({ key: topicKey }).then(
                  topicHash => {
                    if (topicHash === null) {
                      rslv();
                      return;
                    }
                    topicHash = TopicsManager._postStoreProcess(topicHash);
                    if (withoutFeeds) {
                      topics.push(topicHash);
                      rslv();
                    } else {
                      const feedManager = new FeedsManager(topicHash);
                      feedManager.read().then(
                        feeds => {
                          topicHash.feeds = feeds;
                          topics.push(topicHash);
                          rslv();
                        },
                        e => {
                          logger.error(`TopicsManager.get feedManager.read reject ${e}`);
                          rjct(e);
                        }
                      );
                    }
                  },
                  e => {
                    logger.error(`TopicsManager.get hgetall topicKey (B) ${e}`);
                    rjct(e);
                  }
                );
              })
            );
          });
          Promise.all(dList).then(
            () => {
              resolve(topics);
            },
            e => {
              logger.error(`TopicsManager.get dList reject ${e}`);
              reject(e);
            }
          );
        },
        e => {
          logger.error(`TopicsManager.get getTopicsKeys reject ${e}`);
          reject(e);
        }
      );
    });
  }
  /**
     * store - will store the array of topics passed as an argument
     *
     * @param  {array} topics mandatory, array of topic objects to be stored
     * @return {function} promise
     */
  static store(topics) {
    const dList = [];
    return new Promise((resolve, reject) => {
      if (!topics || !Array.isArray(topics) || (Array.isArray(topics) && topics.length === 0)) {
        const err = new TopicsManagerError('Missing topics in request body');
        reject(err);
      } else {
        topics.forEach(topic => {
          // store the topic-client association
          dList.push(
            cli.zadd({
              key: RedisKeys.topicsListByClientId(topic.client_id),
              scomembers: [moment().unix(), RedisKeys.topic(topic.id)]
            })
          );
          // update feeds
          const feedsManager = new FeedsManager(topic);
          dList.push(
            new Promise((rslv, rjct) => {
              feedsManager.update().then(
                () => {
                  // store actual topic
                  const topicToStore = this._preStoreProcess(topic);
                  // logger.info(`Creating topic ${JSON.stringify(topicToStore)}`);
                  cli
                    .hmset({
                      key: RedisKeys.topic(topicToStore.id),
                      hash: topicToStore
                    })
                    .then(
                      () => {
                        rslv();
                      },
                      e => {
                        logger.error(`TopicsManager.store hmset ${e}`);
                        rjct(e);
                      }
                    );
                },
                e => {
                  logger.error(`TopicsManager.store feedsManager.update reject ${e}`);
                  rjct(e);
                }
              );
            })
          );
        });
        Promise.all(dList).then(
          () => {
            resolve(topics.length);
          },
          e => {
            logger.error(`TopicsManager.store dList reject ${e}`);
            reject(e);
          }
        );
      }
    });
  }
  /**
     * delete - will delete the topic matching the provided topicId
     *
     * @param  {number} topicId mandatory
     * @return {function} promise
     */
  static delete(topicId) {
    const dList = [];
    return new Promise((resolve, reject) => {
      if (!topicId || topicId === 'undefined') {
        const err = new TopicsManagerError('Missing topicId route argument');
        reject(err);
      } else {
        const topicKey = RedisKeys.topic(topicId);
        cli.hget({ key: topicKey, field: 'client_id' }).then(
          clientId => {
            if (clientId === null) {
              dList.push(Promise.resolve());
            } else {
              dList.push(
                cli.zrem({
                  key: RedisKeys.topicsListByClientId(clientId),
                  members: [topicKey]
                })
              ); // deletes the topic-client association
            }
          },
          e => {
            logger.error(`TopicsManager.delete hget ${e}`);
            reject(e);
          }
        );
        // delete current topic's feeds
        const feedsManager = new FeedsManager();
        feedsManager.reset(topicId).then(
          topicHash => {
            if (feedsManager.topic === null) {
              dList.push(Promise.resolve());
            } else {
              dList.push(feedsManager.delete());
            }
          },
          e => {
            logger.error(`TopicsManager.delete feedsManager.reset reject ${e}`);
            reject(e);
          }
        );
        Promise.all(dList).then(
          () => {
            // delete actual topic
            cli.del({ key: topicKey }).then(() => resolve());
          },
          e => {
            logger.error(`TopicsManager.delete dList reject ${e}`);
            reject(e);
          }
        );
      }
    });
  }
}

module.exports = TopicsManager;
