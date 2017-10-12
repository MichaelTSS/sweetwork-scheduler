/* eslint-disable no-param-reassign */
'use strict';
// 3rd party
const moment = require('moment-timezone');
const config = require('../config');
const _ = require('lodash');
// home brewed
const logger = require('winston').loggers.get('scheduler-logger');
const RedisKeys = require('../redis-keys');
const JinRedisClient = require('@jin-pack/jin-redis-client');
const cli = new JinRedisClient(config.get('SVC_SCHEDULER_REDIS_HOST'), config.get('SVC_SCHEDULER_REDIS_PORT'), config.get('REDIS_DB'));
const SvcApiRpc = require('@jin-pack/svc-api-rpc').SvcApiRpc;
const svcApiRpc = new SvcApiRpc(config.get('SVC_API:host'), config.get('SVC_API:port'), config.get('SVC_API:jwt_passphrase'));
svcApiRpc.auth('TopicsService').catch(logger.error); // RPC call to crawler
const TICK_INTERVAL_MS = 1000 * 5; // every 5 seconds
const NEXT_CRAWL_DURATION = 15; // comes back in 15 minutes if not returned by Api Service

const scheduler = () => {
    const feedsListKey = RedisKeys.feedsList();
    cli.zrangebyscore({ key: feedsListKey, withscores: false, max: moment().unix(), limit: 10 }).then(members => {
        members.forEach(member => {
            cli.hgetall({ key: member }).then(feedHash => {
                logger.debug(member, feedHash);
                if (feedHash.id === undefined) {
                    cli.del({ key: member });
                    cli.zrem({ key: feedsListKey, members: [member] });
                    logger.info(`Key ${member} had a erronous hash`);
                    return;
                }
                const feedToSearch = {
                    timestamp_from: feedHash.timestamp_to || moment().subtract(1, 'months').unix(),
                    timestamp_to: moment().unix(),
                    id: feedHash.id,
                    source: feedHash.source,
                    entity: feedHash.entity
                };
                const topicListKey = RedisKeys.topicListByFeedIdSource(feedHash.id, feedHash.source);
                const nextCrawlDuration = (feedHash.last_time_crawl) ? NEXT_CRAWL_DURATION : 3 * NEXT_CRAWL_DURATION;
                const score = moment().unix() + 60 * nextCrawlDuration;
                //
                if (feedHash.status === 'busy') {
                    logger.warn('This feed has not been updated since it was first ordered to crawl');
                } else {
                    // update that feedHash to be "busy"
                    cli.hset({ key: member, field: 'status', value: 'busy' }).catch(logger.error);
                }
                //
                cli.zrangebyscore({ key: topicListKey, withscores: false, max: moment().unix() }).then(keys => {
                    const topicsListPromises = [];
                    keys.forEach(key => {
                        topicsListPromises.push(cli.hgetall({ key }));
                    });
                    Promise.all(topicsListPromises).then(topicHashes => {
                        feedToSearch.topic_hash = _.transform(topicHashes, (result, hash) => {
                            (result[hash.client_id] || (result[hash.client_id] = [])).push(hash.id);
                        }, {});
                        feedToSearch.languages = _.uniq(_.flattenDeep(topicHashes.map(t => t.languages.split(',').filter(f => !!f))));
                        feedToSearch.countries = _.uniq(_.flattenDeep(topicHashes.map(t => t.countries.split(',').filter(f => !!f))));
                        setTimeout(() => {
                            logger.info(`Trigger search for ${feedToSearch.source}:${feedToSearch.id} up until ` +
                                `${moment().to(moment.unix(feedToSearch.timestamp_from))}`);
                            svcApiRpc.search(feedToSearch)
                                .catch(err => {
                                    logger.error(err);
                                    const key = RedisKeys.feedErrorBands(feedHash.id, feedHash.source);

                                    cli.zrangebyscore({
                                        key,
                                        min: feedToSearch.timestamp_from,
                                        max: feedToSearch.timestamp_to,
                                        withscores: true
                                    })
                                    .then(mbers => {
                                        const errTo = moment().add(1, 'minute').unix();
                                        if (mbers.length > 0) {
                                            logger.info(`Updating a hole. Was from ${moment.unix(mbers[0]).fromNow()}` +
                                            ` to ${moment.unix(mbers[1]).fromNow()}, now to ${moment.unix(errTo).fromNow()}`);
                                            cli.zadd({ key, scomembers: [errTo, mbers[0]] })
                                                .catch(e => logger.error(`update hole ${e}`));
                                        } else {
                                            logger.info(`New hole is from ${moment.unix(feedToSearch.timestamp_from).fromNow()}` +
                                            ` to ${errTo}, ${moment.unix(errTo).fromNow()}`);
                                            cli.zadd({ key, scomembers: [errTo, String(feedToSearch.timestamp_from)] })
                                                .catch(e => logger.error(`create hole ${e}`));
                                        }
                                    });
                                });
                        }, Math.random() * 1000 * 1); // between 0 and 1 second
                    });
                }, e => logger.error(e));

                // update feedsList with that key to be updated back in 15 min
                logger.debug(`Next crawl set ${moment.unix(score).fromNow()}`);
                cli.zadd({ key: feedsListKey, scomembers: [score, member] }).catch(logger.error);
            }, e => logger.error(e));
        }, e => logger.error(e));
    });
};

setInterval(scheduler, TICK_INTERVAL_MS);
