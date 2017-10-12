/* eslint-disable new-cap, no-param-reassign, arrow-body-style, max-len */
'use strict';
const async = require('async');
const _ = require('lodash');
const moment = require('moment-timezone');
const router = require('express').Router({ strict: true });
const logger = require('winston').loggers.get('scheduler-logger');

const RedisKeys = require('../redis-keys');
const utils = require('sweetwork-utils');
const RedisClient = require('sweetwork-redis-client');
const config = require('../config');
const cli = new RedisClient(config.get('SVC_SCHEDULER_REDIS_HOST'), config.get('SVC_SCHEDULER_REDIS_PORT'), config.get('REDIS_DB'));

const AVAILABLE_SOURCES = ['twitter', 'instagram', 'facebook', 'googlenews', 'rss'];
const AVAILABLE_INTERVALS = ['year', 'month', 'week', 'day', 'hour', 'minute'];
const AVAILABLE_DATE_RANGES = ['30', '7', '1', '-1'];

router.get('/', (req, res, next) => {
  logger.info(`GET /api/v1/metrics ${JSON.stringify(req.query)}`);
  const meta = {
    available_query_parameters: {
      entities: {
        type: 'optional',
        options: ['result', 'author'],
        help: 'multiple values possible, separated by commas'
      },
      sources: {
        type: 'optional',
        options: AVAILABLE_SOURCES,
        help: 'multiple values possible, separated by commas'
      },
      ids: {
        type: 'optional',
        help: 'search keyword(s) and/or account_id(s) separated by commas'
      },
      interval: {
        type: 'optional',
        options: AVAILABLE_INTERVALS,
        help: 'outputs granularity of series'
      },
      dateRange: {
        type: 'optional',
        options: AVAILABLE_DATE_RANGES,
        help: 'refines precision of series'
      },
      showDeleted: {
        type: 'optional',
        options: [0, 1],
        help: 'shows deleted feeds if 1'
      },
      showErrorLines: {
        type: 'optional',
        options: [0, 1],
        help: 'shows error lines for feeds if 1'
      },
      showWarningLines: {
        type: 'optional',
        options: [0, 1],
        help: 'shows warning lines for feeds if 1'
      },
      client_ids: {
        type: 'optional',
        help: 'multiple values possible, separated by commas'
      }
    }
  };
  let dateRangeMin;
  switch (req.query.dateRange) {
  case '30':
  case '7':
  case '1':
    dateRangeMin = moment()
        .subtract(req.query.dateRange, 'days')
        .unix();
    break;
  case '-1':
  default:
    dateRangeMin = '-inf';
    break;
  }
  const interval = req.query.interval ? req.query.interval : 'day';
  const sources = req.query.sources ? req.query.sources.split(',') : [];
  const entities = req.query.entities ? req.query.entities.split(',') : [];
  const ids = req.query.ids ? req.query.ids.split(',') : null;
  const clientIds = req.query.client_ids ? req.query.client_ids.split(',') : null;
  async.waterfall(
    [
      async.asyncify(() => {
        // get all feeds within range
        const key = req.query.showDeleted === '1' ? RedisKeys.deletedFeedsList() : RedisKeys.feedsList();
        return cli.zrangebyscore({ key, withscores: false, limit: Math.pow(10, 4) }).catch(logger.error);
      }),
      (keys, callback) => {
        // get all hashes
        if (keys.length === 0) {
          callback(null, []);
          return;
        }
        const dList = [];
        keys.forEach(key => {
          dList.push(cli.hgetall({ key }).catch(logger.error));
        });
        Promise.all(dList).then(hashes => callback(null, hashes), err => callback(err));
      },
      (hashes, callback) => {
        // apply query filters
        if (sources) hashes = hashes.filter(x => sources.includes(x.source));
        if (entities) hashes = hashes.filter(x => entities.includes(x.entity));
        if (ids) hashes = hashes.filter(x => ids.includes(x.id));
        callback(null, hashes);
      },
      (hashes, callback) => {
        // TODO get topics and clients
        const dList = [];
        if (hashes.length === 0) {
          callback(null, []);
          return;
        }
        hashes.forEach(hash => {
          dList.push(
            cli
              .zrangebyscore({
                key: RedisKeys.topicListByFeedIdSource(hash.id, hash.source),
                withscores: false,
                limit: Math.pow(10, 4)
              })
              .catch(logger.error)
          );
        });
        Promise.all(dList)
          .then(topicsListKeys => {
            // hashes.topicsListKeys
            hashes = _.merge(hashes, topicsListKeys.map(x => ({ keys: x })));
            return Promise.resolve();
          })
          .then(
            () => {
              dList.splice(0, dList.length); // remove all contents
              hashes.forEach(hash => {
                dList.push(
                  new Promise((rslv, rjct) => {
                    if (Array.isArray(hash.keys) && hash.keys.length > 0) {
                      const d = [];
                      hash.keys.forEach(key => {
                        d.push(
                          cli.hget({
                            key,
                            field: 'client_id'
                          })
                        );
                      });
                      Promise.all(d).then(
                        cliIds => {
                          rslv(cliIds);
                        },
                        e => {
                          logger.error('C => get-link-to-client_ids');
                          callback(null, hashes);
                        }
                      );
                    } else {
                      rslv(null);
                    }
                  })
                );
              });
              Promise.all(dList).then(
                cliListIds => {
                  hashes = _.merge(hashes, cliListIds.map(x => ({ client_ids: x || [] })));
                  if (clientIds) {
                    hashes = hashes.filter(hash => {
                      return hash.client_ids.some(cliId => {
                        return clientIds.includes(cliId);
                      });
                    });
                  }
                  callback(null, hashes);
                },
                e => {
                  logger.error('B => get-link-to-client_ids');
                  callback(null, hashes);
                }
              );
            },
            e => {
              logger.error('A => get-link-to-client_ids');
              callback(null, hashes);
            }
          );
      },
      (hashes, callback) => {
        // get ticks and build series object
        const dList = [];
        if (hashes.length === 0) {
          callback(null, []);
          return;
        }
        hashes.forEach(hash => {
          dList.push(
            cli
              .zrangebyscore({
                key: RedisKeys.feedTicks(hash.id, hash.source),
                withscores: false,
                limit: Math.pow(10, 4),
                min: dateRangeMin
              })
              .catch(logger.error)
          );
        });
        Promise.all(dList).then(
          ticks => {
            const series = [];
            ticks.forEach((s, idx) => {
              series.push({
                data: utils.groupTicksByInterval(s, interval),
                id: hashes[idx].id,
                source: hashes[idx].source,
                name: hashes[idx].name ? hashes[idx].name : `${hashes[idx].client_ids.join(',')}-${hashes[idx].source}:${hashes[idx].id}`,
                last_time_crawl: moment().to(moment.unix(hashes[idx].last_time_crawl)),
                entity: hashes[idx].entity,
                status: hashes[idx].status,
                client_ids: hashes[idx].client_ids || []
              });
            });
            callback(null, series);
          },
          err => callback(err)
        );
      },
      (series, callback) => {
        // get "holes" in data and build plotBands object
        const dList = [];
        if (series.length === 0) {
          callback(null, [], []);
          return;
        }
        series.forEach(hash => {
          dList.push(
            cli
              .zrangebyscore({
                key: RedisKeys.feedErrorBands(hash.id, hash.source),
                withscores: true,
                limit: Math.pow(10, 4),
                min: dateRangeMin
              })
              .catch(logger.error)
          );
        });
        Promise.all(dList).then(
          ticks => {
            ticks = _.flatten(ticks);
            const plotBands = [];
            // if (ticks.length >= 2) {
            for (let i = 0; i < ticks.length; i += 2) {
              if (ticks[i] !== undefined && ticks[i + 1] !== undefined) {
                const member = ticks[i];
                const score = ticks[i + 1];
                plotBands.push({
                  status: 'error',
                  from: parseInt(`${member}000`, 10),
                  to: parseInt(`${score}000`, 10)
                });
              }
            }
            // }
            callback(null, series, plotBands);
          },
          err => callback(err)
        );
      },
      (series, plotBands, callback) => {
        // get error ticks and build plotLinkes object
        if (series.length === 0) {
          callback(null, [], [], []);
          return;
        }
        if (req.query.showErrorLines === '0' && req.query.showWarningLines === '0') {
          callback(null, series, plotBands, []);
          return;
        }
        async.waterfall(
          [
            cb => {
              const dList = [];
              series.forEach(serie => {
                dList.push(
                  cli.zrangebyscore({
                    key: RedisKeys.topicListByFeedIdSource(serie.id, serie.source),
                    withscores: false,
                    limit: Math.pow(10, 4)
                  })
                );
              });
              Promise.all(dList).then(keysList => cb(null, _.flatten(keysList)), err => cb(err));
            },
            (keysList, cb) => {
              const dList = [];
              keysList.forEach(key => {
                dList.push(cli.hget({ key, field: 'client_id' }));
              });
              Promise.all(dList).then(clientIdsList => cb(null, _.flatten(clientIdsList)), err => cb(err));
            },
            (clientIdsList, cb) => {
              const dList = [];
              clientIdsList = _.uniq(clientIdsList);
              sources.forEach(source => {
                // error
                if (req.query.showErrorLines !== '0') {
                  clientIdsList.forEach(clientId => {
                    dList.push(
                      cli
                        .zrangebyscore({
                          key: RedisKeys.feedErrorTicks(clientId, source),
                          withscores: false,
                          limit: Math.pow(10, 4),
                          min: dateRangeMin
                        })
                        .catch(logger.error)
                    );
                  });
                  dList.push(
                    cli
                      .zrangebyscore({
                        key: RedisKeys.feedErrorTicks('*', source),
                        withscores: false,
                        limit: Math.pow(10, 4),
                        min: dateRangeMin
                      })
                      .catch(logger.error)
                  );
                }
                // warning
                if (req.query.showWarningLines !== '0') {
                  clientIdsList.forEach(clientId => {
                    dList.push(
                      cli
                        .zrangebyscore({
                          key: RedisKeys.feedWarningTicks(clientId, source),
                          withscores: false,
                          limit: Math.pow(10, 4),
                          min: dateRangeMin
                        })
                        .catch(logger.error)
                    );
                  });
                  dList.push(
                    cli
                      .zrangebyscore({
                        key: RedisKeys.feedWarningTicks('*', source),
                        withscores: false,
                        limit: Math.pow(10, 4),
                        min: dateRangeMin
                      })
                      .catch(logger.error)
                  );
                }
              });
              Promise.all(dList).then(
                results => {
                  const plotLines = [];
                  results = _.flatten(results);
                  if (!results || results.lengh === 0) cb(null, []);
                  else {
                    results.forEach(result => {
                      result = JSON.parse(result);
                      if (ids === null || (Array.isArray(ids) && ids.includes(result.id))) {
                        plotLines.push({
                          id: result.id,
                          status: result.name,
                          value: parseInt(`${result.ts}000`, 10),
                          name: result.message,
                          clientId: result.clientId
                        });
                      }
                    });
                    cb(null, plotLines);
                  }
                },
                err => cb(err)
              );
            }
          ],
          (err, plotLines) => {
            if (err) callback(err);
            else callback(null, series, plotBands, plotLines);
          }
        );
      }
    ],
    (err, series, plotBands, plotLines) => {
      if (err) logger.error(err);
      if (err) res.status(500).json({ success: false });
      else {
        res.status(200).json({
          success: true,
          metrics: { series, plotLines, plotBands, type: 'spline', title: 'Number of results per feed' },
          meta
        });
      }
    }
  );
});

module.exports = router;
