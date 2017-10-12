/* eslint-disable max-len, quote-props, no-param-reassign, no-underscore-dangle */
'use strict';
const moment = require('moment-timezone');
const config = require('../../config');

const RedisKeys = require('../../redis-keys');
const logger = require('winston').loggers.get('scheduler-logger');
const RedisClient = require('sweetwork-redis-client');

const cli = new RedisClient(config.get('SVC_SCHEDULER_REDIS_HOST'), config.get('SVC_SCHEDULER_REDIS_PORT'), config.get('REDIS_DB'));

const FEED_ARRAY_FIELDS = ['languages', 'countries'];
const TOPIC_PROFILES_JSON_FIELDS = ['included_profiles', 'restricted_profiles', 'excluded_profiles'];
const FEED_NUMBER_FIELDS = ['timestamp_from', 'timestamp_to', 'last_time_crawl', 'num_results', 'density'];
const SUPPORTED_SEARCH_SOCIAL_NETWORKS = ['twitter', 'instagram', 'googlenews', 'googleplus'];
// const SUPPORTED_SEARCH_SOCIAL_NETWORKS = ['twitter', 'instagram', 'facebook', 'googlenews', 'googleplus', 'youtube'];

/**
 * getSearchItems - get array of tuples to compose feed Keys
 *
 * @param  {object} mandatory of type topic
 * @return {array}
 */
function getSearchItems(topic) {
    // TODO generate smart feed generation per source here
    // Ex: For Twitter, include boolean operators using the JSON.stringify way
    const searchItems = [];
    // authors
    TOPIC_PROFILES_JSON_FIELDS.forEach(field => {
        if (Array.isArray(topic[field])) {
            topic[field].forEach(profile => {
                if (Array.isArray(profile.accounts)) {
                    profile.accounts.forEach(account => {
                        const id = account.original_platform_user_id || account.id;
                        searchItems.push([id, account.network]);
                    });
                }
                if (Array.isArray(profile.rss)) {
                    profile.rss.forEach(rss => {
                        searchItems.push([rss.url, 'rss']);
                    });
                }
            });
        }
    });
    // custom
    if (Array.isArray(topic.custom)) {
        topic.custom.forEach(hash => {
            if (hash.manual) {
                if (hash.type === 'facebook_feed') {
                    searchItems.push([hash.content.split('facebook.com/')[1], 'facebook']);
                } else if (hash.type === 'rss') {
                    searchItems.push([hash.content, 'rss']);
                } else {
                    logger.info(`Custom: ${JSON.stringify(hash)}`);
                }
            }
        });
    }
    // keywords
    // logger.info(`${JSON.stringify(topic.sources)}`);
    if (!topic.restricted_profiles || !Array.isArray(topic.restricted_profiles) || topic.restricted_profiles.length === 0) {
        if (Array.isArray(topic.sources)) {
            topic.sources.forEach(source => {
                if (SUPPORTED_SEARCH_SOCIAL_NETWORKS.includes(source)) {
                    if (Array.isArray(topic.or)) {
                        // simple keywords search
                        topic.or.forEach(or => {
                            or.content.replace(/#/g, '');
                            searchItems.push([or.content, source]);
                        });
                    }
                    if (Array.isArray(topic.and)) {
                        // simple keywords search
                        topic.and.forEach(and => {
                            and.content.replace(/#/g, '');
                            searchItems.push([and.content, source]);
                        });
                    }
                    if (Array.isArray(topic.keywords_json)) {
                        // advanced keywords search
                        topic.keywords_json.forEach(hash => {
                            if (hash.type === 'filter' && hash.filter !== 'exclude') {
                                if (Array.isArray(hash.block)) {
                                    hash.block.forEach(bloc => {
                                        if (bloc.content) {
                                            bloc.content = bloc.content.replace(/#/g, '');
                                            searchItems.push([bloc.content, source]);
                                        }
                                    });
                                }
                            }
                        });
                    }
                } else {
                    logger.error(`${source} not supported`);
                }
            });
        }
    }
    return searchItems;
}

class FeedsManager {
    constructor(topic) {
        // this class gets, sets and deletes feeds for a given topic
        if (topic) this.topic = topic;
    }
    /**
     * _postStoreProcess - method that casts strings fields to arrays or number fields.
     *
     * @param  {object} mandatory, topic object
     * @param  {boolean} optional, defaults to false, will enrich topics with additional meta data
     * @return {object} topic object
     */
    _postStoreProcess(feedHash) {
        FEED_ARRAY_FIELDS.forEach(field => {
            if (feedHash && feedHash[field] && feedHash[field].split) feedHash[field] = feedHash[field].split(',');
            else if (feedHash[field] === '') feedHash[field] = [];
        });
        FEED_NUMBER_FIELDS.forEach(field => {
            if (feedHash && feedHash[field] && isFinite(parseInt(feedHash[field], 10))) feedHash[field] = parseInt(feedHash[field], 10);
        });
        if (feedHash.last_time_crawl) {
            feedHash.last_time_crawl_human = moment.unix(feedHash.last_time_crawl).fromNow();
        }
        return feedHash;
    }
    /**
     * get - retrieves a list of feed matching the arguments. This method
     * implements the concept of precedence: a provided feedId will be used
     * over a topicId
     *
     * @param  {number} topicId
     * @param  {number} feedId
     * @param  {boolean} withMeta will enrich feeds with additional meta data
     * @return {promise} resolves with an array of feeds or rejects with an error
     */
    reset(topicId, topic) {
        return new Promise((resolve, reject) => {
            if (topic) {
                this.topic = topic;
                resolve();
            } else {
                cli.hgetall({ key: RedisKeys.topic(topicId) }).then(
                    topicHash => {
                        this.topic = topicHash;
                        resolve();
                    },
                    err => reject(err)
                );
            }
        });
    }
    /**
     * read - this methods reads all feeds linked to the topicId at this.topic.id
     *
     * @return {promise}
     */
    read() {
        const that = this;
        const dList = [];
        return new Promise((resolve, reject) => {
            const feedsKeyList = RedisKeys.feedsListByTopicId(this.topic.id);
            cli.zrangebyscore({ key: feedsKeyList, withscores: false }).then(
                feedKeysList => {
                    if (Array.isArray(feedKeysList)) {
                        if (feedKeysList.length === 0) {
                            dList.push(Promise.resolve());
                        } else {
                            feedKeysList.forEach(feedKey => {
                                // iterate though feeds of current topic
                                dList.push(cli.hgetall({ key: feedKey }));
                            });
                        }
                    } else {
                        dList.push(Promise.resolve());
                    }
                    Promise.all(dList).then(
                        feeds => {
                            const processedFeeds = [];
                            feeds.forEach(feed => {
                                if (feed) processedFeeds.push(that._postStoreProcess(feed));
                            });
                            resolve(processedFeeds);
                        },
                        e => reject(e)
                    );
                },
                e => reject(e)
            );
        });
    }
    /**
     * update - this methods updates all necessary feeds linked to topic object at this.topic
     *
     * @return {promise}
     */
    update() {
        const that = this;
        return that.delete().then(
            // return Promise.resolve().then(
            () => that.store.call(that),
            e => {
                logger.error(`FeedsManager.update that.delete reject ${e}`);
                return Promise.reject(e);
            }
        );
    }
    /**
     * store - this methods create all necessary feeds linked to topic object at this.topic
     *
     * @return {promise}
     */
    store() {
        const that = this;
        const dList = [];
        const unixNow = moment().unix();
        // for each feed key get list of topic keys
        const searchItems = getSearchItems(that.topic);
        // logger.info(`Storing ${searchItems.length} associated feed(s) ${JSON.stringify(searchItems)}`);
        // logger.info(`Creating feeds for topic id ${JSON.stringify(that.topic.id)}`);
        searchItems.forEach(searchItem => {
            // store feed hash
            let entity = 'result';
            if (isFinite(parseInt(searchItem[0], 10))) entity = 'author';
            else if (searchItem[1] === 'rss') entity = 'author';
            const feedHash = {
                source: searchItem[1],
                id: searchItem[0],
                entity,
                languages: that.topic.languages,
                countries: that.topic.countries
            };
            const feedKey = RedisKeys.feed(searchItem[0], searchItem[1]);
            // logger.info(`Creating feed ${JSON.stringify(feedHash)}`);
            dList.push(cli.hmset({ key: feedKey, hash: feedHash }));

            // add feed key to topics list
            const topicKey = RedisKeys.topic(that.topic.id);
            const topicsListByFeedKey = RedisKeys.topicListByFeedIdSource(searchItem[0], searchItem[1]);
            dList.push(cli.zadd({ key: topicsListByFeedKey, scomembers: [unixNow, topicKey] }));
            // logger.info(`added feedKey ${topicKey} at ${topicsListByFeedKey}`);

            // add topic key to feed list
            const feedsListByTopicKey = RedisKeys.feedsListByTopicId(that.topic.id);
            dList.push(cli.zadd({ key: feedsListByTopicKey, scomembers: [unixNow, feedKey] }));
            // logger.info(`added feedKey ${feedKey} at ${feedsListByTopicKey}`);

            // add feed key to feeds list unless it's there
            const feedsList = RedisKeys.feedsList();
            dList.push(
                new Promise((resolve, reject) => {
                    cli.zscore({ key: feedsList, member: feedKey }).then(
                        score => {
                            if (score === null) {
                                // logger.info(`adding feedKey ${feedKey} at ${feedsList}`);
                                cli.zadd({ key: feedsList, scomembers: [unixNow, feedKey] }).then(
                                    () => resolve(),
                                    e => {
                                        logger.error(`FeedsManager.store zadd ${e}`);
                                        reject();
                                    }
                                );
                            } else {
                                // logger.info(`score ${score} feedKey ${feedKey} already present at ${feedsList}`);
                                resolve();
                            }
                        },
                        e => {
                            logger.error(`FeedsManager.update zscore ${e}`);
                            reject();
                        }
                    );
                })
            );

            // remove feed key from the deleted feeds list
            const deletedFeedsList = RedisKeys.deletedFeedsList();
            dList.push(cli.zrem({ key: deletedFeedsList, members: [feedKey] }));
        });
        return Promise.all(dList);
    }
    /**
     * delete - this methods deletes all feeds linked to the topicId at this.topic.id
     *
     * @return {promise}
     */
    delete() {
        // logger.info('Deleting feeds');
        const dList = [];
        const dDeepList = [];
        const topicKey = RedisKeys.topic(this.topic.id);
        const feedsKeyList = RedisKeys.feedsListByTopicId(this.topic.id);
        const feedsList = RedisKeys.feedsList();
        const deletedFeedsList = RedisKeys.deletedFeedsList();
        const unixNow = moment().unix();
        return new Promise((resolve, reject) => {
            cli.zrangebyscore({ key: feedsKeyList, withscores: false }).then(
                feedKeysList => {
                    if (Array.isArray(feedKeysList)) {
                        if (feedKeysList.length === 0) {
                            // logger.info(`Current topic ${this.topic.id} has no associated feed to delete`);
                            resolve(); // all right ! there is no feeds to remove
                        } else {
                            // logger.info(`Current topic ${this.topic.id} has ${feedKeysList.length} associated feed(s) to delete`);
                            feedKeysList.forEach(feedKey => {
                                // iterate though feeds of current topic
                                cli.hgetall({ key: feedKey }).then(
                                    feedHash => {
                                        const topicsListByFeedKey = RedisKeys.topicListByFeedIdSource(feedHash.id, feedHash.source);
                                        cli.zcount({ key: topicsListByFeedKey }).then(
                                            count => {
                                                // count the number of OTHER topics associated with this feed
                                                if (count === 1) {
                                                    // all right ! only one topic
                                                    dDeepList.push(cli.del({ key: topicsListByFeedKey }));
                                                    dDeepList.push(cli.hset({ key: feedKey, field: 'status', value: 'sleep' }));
                                                    dDeepList.push(cli.zrem({ key: feedsList, members: [feedKey] }));
                                                    dDeepList.push(cli.zadd({ key: deletedFeedsList, scomembers: [unixNow, feedKey] }));
                                                    // logger.info(`Removing this feed: ${feedKey} for good`);
                                                } else {
                                                    // careful! this feed is associated with other topics
                                                    dDeepList.push(cli.zrem({ key: topicsListByFeedKey, members: [topicKey] }));
                                                    // logger.info(`Removing topics but keeping this feed: ${feedKey}`);
                                                }
                                                dList.push(Promise.resolve());
                                            },
                                            e => {
                                                logger.error(`FeedsManager.delete zcount ${e}`);
                                                dList.push(Promise.reject(e));
                                            }
                                        );
                                    },
                                    e => {
                                        logger.error(`FeedsManager.delete hgetall ${e}`);
                                        reject(e);
                                        return;
                                    }
                                );
                            });
                            Promise.all([...dList, ...dDeepList]).then(
                                () => {
                                    // finally, remove the list of feed associated with current topic
                                    cli.del({ key: feedsKeyList }).then(() => resolve());
                                },
                                e => {
                                    logger.error(`FeedsManager.delete dList && dDeepList reject ${e}`);
                                    reject(e);
                                }
                            );
                        }
                    }
                },
                e => {
                    logger.error(`FeedsManager.delete zrangebyscore ${e}`);
                    reject(e);
                }
            );
        });
    }
}

module.exports = FeedsManager;
