/* eslint-disable max-len, no-param-reassign, no-underscore-dangle */

const fs = require('fs');
const moment = require('moment-timezone');
const mysql = require('mysql');
const Ajv = require('ajv');

const config = require('../../config');
const RedisKeys = require('../../redis-keys');
const logger = require('winston').loggers.get('scheduler-logger');
const RedisClient = require('sweetwork-redis-client');
const FeedsManager = require('./feeds-manager');
const utils = require('../../utils');

const ajv = new Ajv({ allErrors: true });
const cli = new RedisClient(
  config.get('SVC_SCHEDULER_REDIS_HOST'),
  config.get('SVC_SCHEDULER_REDIS_PORT'),
  config.get('REDIS_DB'),
);
class TopicsManagerError extends Error {
  constructor(m) {
    super(m);
    this.message = m;
    this.name = 'TopicsManagerError';
  }
}

const connection = mysql.createConnection({
  host: config.get('MYSQL:host'),
  user: config.get('MYSQL:user'),
  password: config.get('MYSQL:password'),
  database: config.get('MYSQL:database'),
  charset: config.get('MYSQL:charset'),
  ssl: {
    ca: fs.readFileSync(config.get('MYSQL:ssl:ca')),
    cert: fs.readFileSync(config.get('MYSQL:ssl:cert')),
    key: fs.readFileSync(config.get('MYSQL:ssl:key')),
  },
});

class TopicsManager {
  constructor(topic) {
    if (!topic) {
      throw new Error('Missing topic argument');
    }
    this.topic = topic;
  }
  static validate(topic) {
    const isValid = ajv.validate(utils.topicSchema, topic);
    if (!isValid) {
      throw new Error(ajv.errorsText());
    }
  }
  /**
     * _computreReadTimeGrade - method that casts array fields to string fields.
     * Necessary tweet since Redis' key-value store nature does not allow
     * non-string values (like arrays) to be stored.
     *
     * @param  {integer} lastTimeCrawl mandatory unix timestamp of the last time this topic's were crawled
     * @return {string} grade from 'A' thru 'F'
     */
  static _computreReadTimeGrade() {
    throw new Error('Not Implemented');
    // const duration = moment
    //   .duration(moment() - moment.unix(lastTimeCrawl))
    //   .asSeconds();
    // if (duration > 3600) return 'F';
    // else if (duration > 1800) {
    //   // over 1 hour
    //   return 'E';
    // } else if (duration > 600) {
    //   // < 1 hour
    //   return 'D';
    // } else if (duration > 300) {
    //   // < 30 min
    //   return 'C';
    // } else if (duration > 180) {
    //   // < 10 min
    //   return 'B'; // < 5 min
    // }
    // return 'A'; // < 2 min
  }
  //
  static jsonToRedis(topic) {
    topic = JSON.parse(JSON.stringify(topic));
    const response = {
      id: String(topic.id),
      name: topic.name,
      sources: topic.sources.join(','),
      projectId: String(topic.projectId),
    };
    if (response.id === 'undefined') delete response.id;
    return response;
  }
  //
  static jsonToSQL(topic) {
    topic = JSON.parse(JSON.stringify(topic));
    const response = {
      id: topic.id,
      name: topic.name,
      words: topic.words.join(','),
      accounts: topic.accounts.map(a => `${a.source}:${a.id}`).join(','),
      sources: topic.sources.join(','),
      createdAt: topic.createdAt || moment().unix(),
      updatedAt: topic.updatedAt || moment().unix(),
      projectId: topic.projectId,
    };
    if (!response.id) delete response.id;
    return response;
  }
  //
  static sqlToJSON(topic) {
    topic = JSON.parse(JSON.stringify(topic));
    let accounts = [];
    if (topic.accounts.length > 0) {
      accounts = topic.accounts
        .split(',')
        .map(a => ({ id: a.split(':')[1], source: a.split(':')[0] }));
    }
    const response = {
      id: topic.id,
      name: topic.name,
      words: topic.words.split(','),
      accounts,
      sources: topic.sources.split(','),
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      projectId: topic.projectId,
    };
    if (!response.id) delete response.id;
    return response;
  }
  /**
     * get - retrieves a list of topics matching the arguments. This method
     * implements the concept of precedence: a provided topicId will be used
     * over a projectId, itself over a feedId.
     * None of the arguments are mandatory, but at least one must be proveded
     *
     * @param  {number} projectId optional
     * @param  {number} topicId optional
     * @param  {number} feedId optional
     * @return {function} promise - resolves with an array of topics or rejects with an error
     */
  static async get(projectId, topicIds = [], withoutFeeds = false) {
    // logger.info(`Gettings topics for topicIds ${JSON.stringify(topicIds)}`);
    async function getTopicsKeys(cId, tIds) {
      // 1.1 get the topics from the topics ids
      if (tIds.length > 0) {
        const topicKeys = [];
        tIds.forEach(topicId => {
          topicKeys.push(RedisKeys.topic(topicId));
        });
        return Promise.resolve(topicKeys);
      } else if (cId) {
        // 1.2 get the topics from the client id
        const topicKeys = await cli.zrangebyscore({
          key: RedisKeys.topicsListByClientId(cId),
          withscores: false,
          limit: 10 ** 3,
        });
        return Promise.resolve(topicKeys);
      }
      // 1.3 fail because there is no data
      const error = new TopicsManagerError(
        'Missing parameters: projectId or topicIds',
      );
      return Promise.reject(error);
    }
    //
    try {
      const topicKeys = await getTopicsKeys(projectId, topicIds);
      if (topicKeys.length === 0) {
        return Promise.resolve([]);
      }
      const promises = [];
      topicKeys.forEach(topicKey => {
        promises.push(
          new Promise(async (resolve, reject) => {
            try {
              // 1. get the hash with data for that topic
              const topicHash = await cli.hgetall({ key: topicKey });
              // 1.1 ignore if that hash is null
              if (topicHash === null) {
                resolve(null);
                return;
              }
              const topic = await TopicsManager.getFromMysql(topicHash.id);
              // 2. make that hash "human friendly"
              // topicHash = TopicsManager._postStoreProcess(topicHash);
              // 3. get the feeds (or ignore the feeds)
              if (!withoutFeeds) {
                const feedManager = new FeedsManager(topic);
                topic.feeds = await feedManager.read();
              }
              resolve(topic);
              // 4. done
            } catch (e) {
              logger.error(`TopicsManager.get hgetall topicKey (B) ${e}`);
              reject(e);
            }
          }),
        );
      });
      //
      let topics = await Promise.all(promises);
      topics = topics.filter(x => x !== null);
      return Promise.resolve(topics);
    } catch (e) {
      logger.error(e);
      return Promise.reject(e);
    }
  }
  static async getFromMysql(topicId) {
    return new Promise(async (resolve, reject) => {
      connection.query(
        'SELECT * FROM Topics WHERE ?',
        { id: topicId },
        async (error, results) => {
          if (error) {
            reject(error);
            return;
          }
          const result = TopicsManager.sqlToJSON(results[0]);
          resolve(result);
        },
      );
    });
  }
  static async storeInMysql(row) {
    return new Promise(async (resolve, reject) => {
      connection.query(
        'INSERT INTO Topics SET ?',
        row,
        async (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          TopicsManager.getFromMysql(response.insertId).then(resolve, reject);
        },
      );
    });
  }
  static async storeInRedis(topic) {
    return new Promise(async (resolve, reject) => {
      try {
        // store the topic-client association
        await cli.zadd({
          key: RedisKeys.topicsListByClientId(topic.projectId),
          scomembers: [moment().unix(), RedisKeys.topic(topic.id)],
        });
        // store actual topic in Redis
        const hash = TopicsManager.jsonToRedis(topic);
        await cli.hmset({
          key: RedisKeys.topic(hash.id),
          hash,
        });
        // update feeds
        const feedsManager = new FeedsManager(topic);
        await feedsManager.update();
        resolve(topic);
      } catch (e) {
        reject(e);
      }
    });
  }
  static async updateInMysql(row) {
    /* eslint-disable prefer-destructuring */
    const id = row.id;
    delete row.id;
    return new Promise((resolve, reject) => {
      row.updatedAt = moment().unix();
      connection.query(
        'UPDATE Topics SET ? WHERE ?',
        [row, { id }],
        async error => {
          if (error) {
            reject(error);
            return;
          }
          TopicsManager.getFromMysql(id).then(resolve, reject);
        },
      );
    });
  }
  /**
     * store - will store the array of topics passed as an argument
     *
     * @param  {array} topics mandatory, array of topic objects to be stored
     * @return {function} promise
     */
  static async store(topics) {
    if (!topics) {
      const error = new TopicsManagerError('Missing topics argument');
      return Promise.reject(error);
    }
    const promises = [];
    //
    topics.forEach(async topic => {
      promises.push(
        new Promise(async (resolve, reject) => {
          try {
            // store actual topic in SQL
            const row = TopicsManager.jsonToSQL(topic);
            const result = await TopicsManager.storeInMysql(row);
            await TopicsManager.storeInRedis(result);
            resolve(result);
          } catch (e) {
            reject(e);
          }
        }),
      );
    });
    //
    try {
      const results = await Promise.all(promises);
      return Promise.resolve(results);
    } catch (e) {
      logger.error(`TopicsManager.store promises reject ${e}`);
      return Promise.reject(e);
    }
  }
  /**
     * update - will update the topic passed as an argument
     *
     * @param  {array} topics mandatory, array of topic objects to be stored
     * @return {function} promise
     */
  static async update(topic) {
    /* eslint-disable prefer-destructuring */
    try {
      const id = topic.id;
      delete topic.id;
      if (!topic) {
        const error = new TopicsManagerError('Missing topic argument');
        return Promise.reject(error);
      }
      if (!id) {
        const error = new TopicsManagerError('Missing id argument');
        return Promise.reject(error);
      }
      // store actual topic in SQL
      const row = TopicsManager.jsonToSQL(Object.assign(topic, { id }));
      const result = await TopicsManager.updateInMysql(
        Object.assign(row, { id }),
      );
      // store the topic-client association
      await cli.zadd({
        key: RedisKeys.topicsListByClientId(result.projectId),
        scomembers: [moment().unix(), RedisKeys.topic(result.id)],
      });
      // store actual topic in Redis
      const hash = TopicsManager.jsonToRedis(result);
      await cli.hmset({
        key: RedisKeys.topic(hash.id),
        hash,
      });
      // update feeds
      const feedsManager = new FeedsManager(result);
      await feedsManager.update();
      return Promise.resolve(result);
    } catch (e) {
      return Promise.reject(e);
    }
  }
  /**
     * delete - will delete the topic matching the provided topicId
     *
     * @param  {number} topicId mandatory
     * @return {function} promise
     */
  static async delete(topicId) {
    try {
      if (!topicId) {
        const error = new TopicsManagerError('Missing topicId argument');
        return Promise.reject(error);
      }
      const topicKey = RedisKeys.topic(topicId);
      // delete the topic-client association
      const projectId = await cli.hget({ key: topicKey, field: 'projectId' });
      if (projectId !== null) {
        await cli.zrem({
          key: RedisKeys.topicsListByClientId(projectId),
          members: [topicKey],
        });
      }
      // workaround to instanciate FeedsManager with a topic
      const feedsManager = new FeedsManager();
      await feedsManager.reset(topicId);
      // delete current topic's feeds
      await feedsManager.delete();
      // delete actual topic in Redis
      await cli.del({ key: topicKey });
      // delete actual topic in SQL
      return new Promise((resolve, reject) => {
        connection.query(
          'DELETE FROM Topics WHERE ?',
          { id: topicId },
          async error => {
            // connection.end();
            if (error) {
              reject(error);
              return;
            }
            resolve();
          },
        );
      });
    } catch (e) {
      logger.error(`TopicsManager.delete promises reject ${e}`);
      return Promise.reject(e);
    }
  }
}

module.exports = TopicsManager;
