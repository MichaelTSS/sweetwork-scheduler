const moment = require('moment-timezone');
const _ = require('lodash');
const RedisClient = require('sweetwork-redis-client');
const Controller = require('../connectors/controller');
const RedisKeys = require('../redis-keys');
const config = require('../config');
const logger = require('winston').loggers.get('scheduler-logger');

const cli = new RedisClient(
  config.get('REDIS:host'),
  config.get('REDIS:port'),
  config.get('REDIS:db'),
);
const controller = new Controller(
  config.get('SVC_CONTROLLER:host'),
  config.get('SVC_CONTROLLER:port'),
  config.get('SVC_CONTROLLER:passphrase'),
);

module.exports = class Factory {
  constructor(feedHash) {
    this.feedHash = feedHash;
    if (this.feedHash.id === undefined) {
      throw new Error('Erronous hash');
    }
  }

  async getDataFromTopics() {
    /* eslint-disable no-param-reassign, camelcase */
    const topicListKey = RedisKeys.topicListByFeedIdSource(
      this.feedHash.id,
      this.feedHash.source,
    );
    const keys = await cli.zrangebyscore({
      key: topicListKey,
      withscores: false,
      max: moment().unix(), // QUESTION pourquoi ce maximum ? pour les sujets crées à l'avenir ?
    });
    const promises = [];
    keys.forEach(key => {
      promises.push(cli.hgetall({ key }));
    });
    const topicHashes = await Promise.all(promises);
    this.feedHash.topic_hash = _.transform(
      topicHashes,
      (result, hash) => {
        (result[hash.client_id] || (result[hash.client_id] = [])).push(hash.id);
      },
      {},
    );
    this.feedHash.languages = _.uniq(
      _.flattenDeep(
        topicHashes.map(t => t.languages.split(',').filter(f => !!f)),
      ),
    );
    this.feedHash.countries = _.uniq(
      _.flattenDeep(
        topicHashes.map(t => t.languages.split(',').filter(f => !!f)),
      ),
    );
  }

  printState() {
    logger.info(JSON.stringify(this.feedHash));
  }

  async search() {
    const timestamp_from =
      this.feedHash.timestamp_to ||
      moment()
        .subtract(1, 'months')
        .unix();
    const feedToSearch = {
      timestamp_from,
      timestamp_to: moment().unix(),
      id: this.feedHash.id,
      source: this.feedHash.source,
      entity: this.feedHash.entity,
      languages: this.feedHash.languages,
      countries: this.feedHash.countries,
      topic_hash: this.feedHash.topic_hash,
    };
    try {
      await controller.auth('Scheduler');
      await controller.search(feedToSearch);
      return true;
    } catch (e) {
      logger.error(e);
      const key = RedisKeys.feedErrorBands(
        this.feedHash.id,
        this.feedHash.source,
      );
      const mbers = await cli.zrangebyscore({
        key,
        min: feedToSearch.timestamp_from,
        max: feedToSearch.timestamp_to,
        withscores: true,
      });
      if (mbers.length > 0) {
        this.updateHole(...mbers);
      } else {
        this.createHole(feedToSearch.timestamp_from);
      }
      return false;
    }
  }

  async updateHole(holeTimestampFrom, holeTimestampTo) {
    try {
      const key = RedisKeys.feedErrorBands(
        this.feedHash.id,
        this.feedHash.source,
      );
      const errTo = moment()
        .add(1, 'minute')
        .unix();
      //
      await cli.zadd({
        key,
        scomembers: [errTo, String(holeTimestampFrom)],
      });
      logger.warn(
        `Updated hole in metrics. Was from ${moment
          .unix(holeTimestampFrom)
          .fromNow()} to ${moment
          .unix(holeTimestampTo)
          .fromNow()}, now to ${moment.unix(errTo).fromNow()}`,
      );
    } catch (e) {
      logger.error('Could not update hole in metrics');
    }
  }

  async createHole(timestamp_from) {
    try {
      const key = RedisKeys.feedErrorBands(
        this.feedHash.id,
        this.feedHash.source,
      );
      const errTo = moment()
        .add(1, 'minute')
        .unix();
      //
      await cli.zadd({
        key,
        scomembers: [errTo, String(timestamp_from)],
      });
      logger.warn(
        `New hole in metrics from ${moment
          .unix(timestamp_from)
          .fromNow()} to ${moment.unix(errTo).fromNow()}`,
      );
    } catch (e) {
      logger.error('Could not create hole in metrics');
    }
  }

  async markStatus(key, status) {
    if (this.feedHash.status === status) {
      logger.warn(`Already masked as ${status}`);
    } else {
      try {
        await cli.hset({ key, field: 'status', value: status });
      } catch (e) {
        logger.warn(
          `Could not set status from "${this.feedHash.status}" to "${status}"`,
        );
      }
    }
  }

  async markAsBusy(key) {
    await this.markStatus(key, 'busy');
  }
  async markAsIdle(key) {
    // unused for now
    await this.markStatus(key, 'idle');
  }

  async setToCrawlAgain(member, duration) {
    /* eslint-disable no-param-reassign */
    try {
      duration = this.feedHash.last_time_crawl ? duration : 3 * duration;
      const score = moment().unix() + 60 * duration; // in one hour
      const feedsListKey = RedisKeys.feedsList();
      await cli.zadd({ key: feedsListKey, scomembers: [score, member] });
    } catch (e) {
      logger.warn(`Could not set to crawl again`);
    }
  }
};
