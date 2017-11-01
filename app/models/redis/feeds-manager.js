/* eslint-disable max-len, quote-props, no-param-reassign, no-underscore-dangle */

const moment = require('moment-timezone');
const config = require('../../config');

const RedisKeys = require('../../redis-keys');
const logger = require('winston').loggers.get('scheduler-logger');
const RedisClient = require('sweetwork-redis-client');

const cli = new RedisClient(
  config.get('SVC_SCHEDULER_REDIS_HOST'),
  config.get('SVC_SCHEDULER_REDIS_PORT'),
  config.get('REDIS_DB'),
);

class FeedsManager {
  constructor(topic) {
    this.topic = topic;
  }
  //
  static getSearchItems(topic) {
    const searchItems = [];
    topic.accounts.forEach(a => {
      searchItems.push({ id: a.id, source: a.source, entity: 'author' });
    });
    topic.sources.forEach(source => {
      topic.words.forEach(id => {
        searchItems.push({ id, source, entity: 'result' });
      });
    });
    return searchItems;
  }
  checkValidation() {
    if (this.topic === null) {
      logger.warn('topic in null in FeedsManager class instance');
    } else if (!this.topic.id) {
      logger.warn('topicId in undefined in FeedsManager class instance');
    }
  }
  //
  async reset(topicId, topic) {
    try {
      if (!topic) {
        topic = await cli.hgetall({ key: RedisKeys.topic(topicId) });
      }
      this.topic = topic;
      this.checkValidation();
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }
  /**
   * read - this methods reads all feeds linked to the topicId at this.topic.id
   *
   * @return {promise}
   */
  async read() {
    try {
      this.checkValidation();
      const feedsByTopicKey = RedisKeys.feedsListByTopicId(this.topic.id);
      const feedsKeysList = await cli.zrangebyscore({
        key: feedsByTopicKey,
        withscores: false,
      });
      const promises = [];
      feedsKeysList.forEach(key => {
        // iterate though feeds of current topic
        promises.push(cli.hgetall({ key }));
      });
      const feedHashes = await Promise.all(promises);
      return Promise.resolve(feedHashes);
    } catch (e) {
      logger.error(e);
      return Promise.reject(e);
    }
  }
  /**
     * update - this methods updates all necessary feeds linked to topic object at this.topic
     *
     * @return {promise}
     */
  async update() {
    try {
      this.checkValidation();
      await this.delete();
      await this.store();
      return Promise.resolve();
    } catch (e) {
      logger.error(`FeedsManager.update() reject ${e}`);
      return Promise.reject(e);
    }
  }
  /**
     * store - this methods create all necessary feeds linked to topic object at this.topic
     *
     * @return {promise}
     */
  async store() {
    try {
      this.checkValidation();
      const unixNow = moment().unix();
      const searchItems = FeedsManager.getSearchItems(this.topic);
      //
      const promises = [];
      searchItems.forEach(feedHash => {
        promises.push(
          new Promise(async (resolve, reject) => {
            try {
              const feedKey = RedisKeys.feed(feedHash.id, feedHash.source);
              await cli.hmset({
                key: feedKey,
                hash: Object.assign(feedHash, { status: 'sleep' }),
              });
              // add feed key to topics list
              const topicKey = RedisKeys.topic(this.topic.id);
              const topicsListByFeedKey = RedisKeys.topicListByFeedIdSource(
                feedHash.id,
                feedHash.source,
              );
              await cli.zadd({
                key: topicsListByFeedKey,
                scomembers: [unixNow, topicKey],
              });
              // add topic key to feed list
              const feedsListByTopicKey = RedisKeys.feedsListByTopicId(
                this.topic.id,
              );
              await cli.zadd({
                key: feedsListByTopicKey,
                scomembers: [unixNow, feedKey],
              });
              // add to feedsList
              const feedsList = RedisKeys.feedsList();
              const score = await cli.zscore({
                key: feedsList,
                member: feedKey,
              });
              if (score === null) {
                await cli.zadd({
                  key: feedsList,
                  scomembers: [unixNow, feedKey],
                });
              }
              // remove from to deletedFeedsList
              const deletedFeedsList = RedisKeys.deletedFeedsList();
              await cli.zrem({ key: deletedFeedsList, members: [feedKey] });
              resolve();
            } catch (e) {
              logger.error(e);
              reject();
            }
          }),
        );
      });
      return Promise.all(promises);
    } catch (e) {
      return Promise.reject(e);
    }
  }
  /**
     * delete - this methods deletes all feeds linked to the topicId at this.topic.id
     *
     * @return {promise}
     */
  async delete() {
    try {
      // logger.info('Deleting feeds');
      if (this.topic === null) return Promise.resolve();
      this.checkValidation();

      const topicKey = RedisKeys.topic(this.topic.id);
      const feedsListByTopic = RedisKeys.feedsListByTopicId(this.topic.id);
      const feedsList = RedisKeys.feedsList();
      const deletedFeedsList = RedisKeys.deletedFeedsList();
      const unixNow = moment().unix();
      //
      const feedKeysList = await cli.zrangebyscore({
        key: feedsListByTopic,
        withscores: false,
      });
      if (!feedKeysList) return Promise.resolve();
      const promises = [];
      feedKeysList.forEach(async feedKey => {
        promises.push(
          new Promise(async resolve => {
            const feedHash = await cli.hgetall({ key: feedKey });
            const topicsListByFeedKey = RedisKeys.topicListByFeedIdSource(
              feedHash.id,
              feedHash.source,
            );
            // remove topic -> feeds relationship
            await cli.del({ key: feedsListByTopic });
            // count the number of OTHER topics associated with this feed
            const count = await cli.zcount({ key: topicsListByFeedKey });
            if (count === 1) {
              // all right ! only one topic
              // remove feed -> topic relationship
              await cli.del({ key: topicsListByFeedKey });
              // set the feed to sleep mode
              await cli.hset({
                key: feedKey,
                field: 'status',
                value: 'sleep',
              });
              // removing from feedsList
              await cli.zrem({ key: feedsList, members: [feedKey] });
              // adding to deletedFeedsList
              await cli.zadd({
                key: deletedFeedsList,
                scomembers: [unixNow, feedKey],
              });
            } else {
              // careful! this feed is associated with other topics
              // remove topic-feed relationship
              await cli.zrem({
                key: topicsListByFeedKey,
                members: [topicKey],
              });
            }
            resolve();
          }),
        );
      });
      return Promise.all(promises);
    } catch (e) {
      return Promise.reject();
    }
  }
}

module.exports = FeedsManager;
