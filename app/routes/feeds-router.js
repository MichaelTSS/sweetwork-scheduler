/* eslint-disable no-param-reassign, new-cap, max-len */

const moment = require('moment-timezone');
const _ = require('lodash');

const router = require('express').Router({ strict: true });
const logger = require('winston').loggers.get('scheduler-logger');

const RedisKeys = require('../redis-keys');
const RedisClient = require('sweetwork-redis-client');
const config = require('../config');

const cli = new RedisClient(
  config.get('REDIS:host'),
  config.get('REDIS:port'),
  config.get('REDIS:db'),
);
const utils = require('../utils');

const SOURCE_SETTINGS = {
  facebook: {
    author: {
      page_size: 25,
      is_pagination: true,
    },
    result: {
      page_size: 25,
      is_pagination: false,
    },
    default_interval_ticks: 60 * 60, // 1 h
    min_interval_ticks: 60 * 1, // 1 min
    max_interval_ticks: 60 * 60, // 1 h
  },
  twitter: {
    author: {
      page_size: 100,
      is_pagination: true,
    },
    result: {
      page_size: 100,
      is_pagination: true,
    },
    default_interval_ticks: 60 * 60, // 1 h
    min_interval_ticks: 60 * 1, // 1 min
    max_interval_ticks: 60 * 60, // 1 h
  },
  instagram: {
    author: {
      page_size: 20,
      is_pagination: true,
    },
    result: {
      page_size: 20,
      is_pagination: true,
    },
    default_interval_ticks: 60 * 60, // 1 h
    min_interval_ticks: 60 * 1, // 1 min
    max_interval_ticks: 60 * 60, // 1 h
  },
  rss: {
    result: null,
    author: {
      page_size: null,
      is_pagination: false,
    },
    default_interval_ticks: 60 * 30, // 30 min
    min_interval_ticks: 60 * 1, // 1 min
    max_interval_ticks: 60 * 30, // 30 min
  },
  googlenews: {
    author: null,
    result: {
      page_size: 100, // to 100
      is_pagination: false,
    },
    default_interval_ticks: 60 * 10, // 10 min
    min_interval_ticks: 60 * 1, // 1 min
    max_interval_ticks: 60 * 10, // 10 min
  },
};

router.post(
  '/',
  (req, res, next) => {
    logger.info(`Was requested to update ${req.body.source}:${req.body.id}`);
    try {
      if (!req.body.id && !req.body.source) {
        throw new Error('Missing id and/or source in req.body');
      }
      const key = RedisKeys.feed(req.body.id, req.body.source);
      cli.hget({ key, field: 'id' }).then(
        id => {
          if (id === null) {
            const error = new Error('Missing id in feed hash');
            res
              .status(500)
              .json({ success: false, error, where: 'check-if-feed-exists' });
          } else {
            next();
          }
        },
        e => {
          res
            .status(500)
            .json({ success: false, error: e, where: 'check-if-feed-exists' });
        },
      );
    } catch (e) {
      logger.error(e);
      res
        .status(500)
        .json({ success: false, error: e, where: 'check-if-feed-exists' });
    }
  },
  (req, res, next) => {
    try {
      if (req.body.error) {
        // the error
        // adding a timestamp because the stringify JSON will be a member in a redis sorted set
        // meaning you cannot have multiple identical numbers
        req.body.error.ts = moment().unix();
        req.body.error.id = req.body.id;
        if (req.body.error.name === 'Warning') {
          logger.error(
            `Api Service recorded a warning ${JSON.stringify(req.body.error)}`,
          );
          cli
            .zadd({
              key: RedisKeys.feedWarningTicks(
                req.body.error.clientId,
                req.body.source,
              ),
              scomembers: [
                String(moment().unix()),
                JSON.stringify(req.body.error),
              ],
            })
            .catch(e => logger.error(`Warning ticks ${e}`));
        } else if (req.body.error.name === 'Error') {
          logger.error(
            `Api Service recorded an error ${JSON.stringify(req.body.error)}`,
          );
          cli
            .zadd({
              key: RedisKeys.feedErrorTicks(
                req.body.error.clientId,
                req.body.source,
              ),
              scomembers: [
                String(moment().unix()),
                JSON.stringify(req.body.error),
              ],
            })
            .catch(e => logger.error(`Error ticks ${e}`));
        } else {
          logger.error(`Oops ${JSON.stringify(req.body.error)}`);
        }
      }
      next();
    } catch (e) {
      logger.error(e);
      res
        .status(500)
        .json({ success: false, error: e, where: 'create-error-plot-lines' });
    }
  },
  (req, res, next) => {
    try {
      const key = RedisKeys.feedErrorBands(req.body.id, req.body.source);
      cli.zcount({ key }).then(count => {
        if (count === 0) {
          cli
            .zadd({ key, scomembers: [req.body.timestamp_from, '0'] })
            .catch(e => logger.error(`First error band ${e}`));
        }
      });
      if (req.body.error) {
        // the error
        let score;
        if (req.body.ticks.length > 0) {
          score = Math.round(
            parseInt(req.body.ticks[req.body.ticks.length - 1], 10) / 1000,
          );
          logger.info(
            'Making/updating a hole because got some data but errored',
          );
        } else {
          logger.info('Making/updating a hole because got no data and errored');
          score = req.body.timestamp_to;
        }
        // If there is a previous hole, no need to create a new one neighbour
        // of it. Instead, extend the previous one by changing the score only
        try {
          cli
            .zrangebyscore({
              key,
              min: req.body.timestamp_from,
              max: req.body.timestamp_to,
              withscores: true,
            })
            .then(members => {
              if (members.length > 0) {
                logger.info(
                  `Updating a hole. Was from ${moment
                    .unix(members[0])
                    .fromNow()}` +
                    ` to ${moment
                      .unix(members[1])
                      .fromNow()}, now to ${moment.unix(score).fromNow()}`,
                );
                cli
                  .zadd({ key, scomembers: [score, members[0]] })
                  .catch(e => logger.error(`update hole ${e}`));
              } else {
                logger.info(
                  `New hole is from ${moment
                    .unix(req.body.timestamp_from)
                    .fromNow()} to ${moment.unix(score).fromNow()}`,
                );
                cli
                  .zadd({
                    key,
                    scomembers: [score, String(req.body.timestamp_from)],
                  })
                  .catch(e => logger.error(`create hole ${e}`));
              }
            });
        } catch (e) {
          logger.error(e);
          res.status(500).json({
            success: false,
            error: e,
            where: 'update-error-plot-bands',
          });
        }
      } else {
        cli
          .zrangebyscore({
            key,
            min: req.body.timestamp_from,
            max: req.body.timestamp_to,
          })
          .then(members => {
            if (members.length > 0) {
              logger.info('Fully recovered!');
              cli.zrem({ key, members }).catch(logger.error);
            } else {
              // logger.info('All went well');
            }
          }, logger.error);
      }
      next();
    } catch (e) {
      logger.error(e);
      res
        .status(500)
        .json({ success: false, error: e, where: 'create-error-plot-bands' });
    }
  },
  (req, res, next) => {
    try {
      if (req.body.ticks && req.body.ticks.length > 0) {
        // ticks are a list of millisecond timestamps
        const scomembers = _.flatMap(req.body.ticks, n => [
          Math.round(parseInt(n, 10) / 1000),
          String(n),
        ]);
        //
        cli
          .zadd({
            key: RedisKeys.feedTicks(req.body.id, req.body.source),
            scomembers,
          })
          .then(
            count => {
              logger.info(`Added ${count} ticks`);
            },
            e => logger.error(`Ticks ${e}`),
          );
        // to make the efficiency chart
        const scomembersEfficiency = _.flatMap(req.body.ticks, n => [
          moment().diff(n, 'milliseconds'),
          String(Math.round(parseInt(n, 10) / 1000)),
        ]);
        cli
          .zadd({
            key: RedisKeys.feedEfficiencyTicks(req.body.id, req.body.source),
            scomembers: scomembersEfficiency,
          })
          .then(
            count => {
              logger.info(`Added ${count} efficiency ticks`);
            },
            e => logger.error(`Ticks ${e}`),
          );
      }
      next();
    } catch (e) {
      logger.error(e);
      res.status(500).json({ success: false, error: e, where: 'create-ticks' });
    }
  },
  (req, res, next) => {
    try {
      const feedKey = RedisKeys.feed(req.body.id, req.body.source);
      req.body.density = utils.computeDensity(
        req.body.num_results,
        req.body.timestamp_from,
        req.body.timestamp_to,
      );
      const unixNow = moment().unix();
      if (req.body.error) {
        if (req.body.ticks.length > 0) {
          // Fix density if ticks but errored (compute density on ticks timestamps)
          cli
            .hmset({
              key: feedKey,
              hash: {
                id: req.body.id,
                source: req.body.source,
                entity: req.body.entity,
                timestamp_to: req.body.timestamp_to,
                density: req.body.density,
                status: 'errored',
                last_time_crawl: unixNow,
              },
            })
            .catch(logger.error);
        } else {
          // Do not set density if no ticks and errored (crawl again based on the stored density) and don't update density
          cli
            .hmset({
              key: feedKey,
              hash: {
                id: req.body.id,
                source: req.body.source,
                entity: req.body.entity,
                status: 'errored',
                last_time_crawl: unixNow,
              },
            })
            .catch(logger.error);
        }
      } else {
        cli
          .hmset({
            key: feedKey,
            hash: {
              id: req.body.id,
              source: req.body.source,
              entity: req.body.entity,
              timestamp_to: req.body.timestamp_to,
              density: req.body.density,
              status: 'idle',
              last_time_crawl: unixNow,
            },
          })
          .catch(logger.error);
      }
      next();
    } catch (e) {
      logger.error(e);
      res
        .status(500)
        .json({ success: false, error: e, where: 'update-feed-hash' });
    }
  },
  (req, res) => {
    try {
      let nextTickCrawl = moment()
        .add(90, 'minutes')
        .unix(); // if there is something wrong, next time is set in 90 minutes
      const unixNow = moment().unix();
      const feedKey = RedisKeys.feed(req.body.id, req.body.source);
      if (
        (req.body.density === 'N/A' || !req.body.density) &&
        req.body.error &&
        req.body.source === 'twitter' &&
        req.body.source === 'instagram'
      ) {
        // Severe error let's crawl again ASAP
        nextTickCrawl = moment()
          .add(1, 'minutes')
          .unix();
      } else if (
        !req.body.density &&
        req.body.error &&
        req.body.error.message === 'Not supported'
      ) {
        nextTickCrawl = moment()
          .add(1, 'hours')
          .unix();
      } else {
        const sourceSettings =
          SOURCE_SETTINGS[req.body.source][req.body.entity];
        if (sourceSettings.page_size !== null) {
          let intervalNeededToFillPagination =
            sourceSettings.page_size * 60 * 60 / req.body.density;
          if (sourceSettings.is_pagination === false) {
            // since we cannot paginate, we want to fetch a bit earlier
            intervalNeededToFillPagination = Math.round(
              intervalNeededToFillPagination * 0.9,
            );
          }
          const tmp = Math.min(
            SOURCE_SETTINGS[req.body.source].max_interval_ticks,
            intervalNeededToFillPagination,
          );
          nextTickCrawl = Math.round(
            unixNow +
              Math.max(
                SOURCE_SETTINGS[req.body.source].min_interval_ticks,
                tmp,
              ),
          );
        } else {
          nextTickCrawl =
            unixNow + SOURCE_SETTINGS[req.body.source].default_interval_ticks;
        }
        // Store the next tick for this feed to be fetched
        logger.info(
          `Fetched ${req.body.num_results} posts for feed (${req.body
            .source}:${req.body.id})` +
            ` of density = ${req.body.density} per hour.`,
        );
      }
      logger.info(`Next crawl set ${moment.unix(nextTickCrawl).fromNow()}`);
      cli
        .zadd({
          key: RedisKeys.feedsList(),
          scomembers: [nextTickCrawl, feedKey],
        })
        .catch(e => logger.error(`Next crawl ${JSON.stringify(e)}`));
      res.status(200).json({ success: true });
    } catch (e) {
      logger.error(e);
      res
        .status(500)
        .json({ success: false, error: e, where: 'create-next-ticks' });
    }
  },
);

module.exports = router;
