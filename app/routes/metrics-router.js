/* eslint-disable new-cap, no-param-reassign, arrow-body-style, max-len */
const _ = require('lodash');
const moment = require('moment-timezone');
const router = require('express').Router({ strict: true });
const logger = require('winston').loggers.get('scheduler-logger');
const utils = require('sweetwork-utils');
const RedisClient = require('sweetwork-redis-client');

const RedisKeys = require('../redis-keys');
const config = require('../config');

const cli = new RedisClient(
  config.get('REDIS:host'),
  config.get('REDIS:port'),
  config.get('REDIS:db'),
);

const AVAILABLE_SOURCES = [
  'twitter',
  'instagram',
  'facebook',
  'googlenews',
  'rss',
];
const AVAILABLE_INTERVALS = ['year', 'month', 'week', 'day', 'hour', 'minute'];
const AVAILABLE_DATE_RANGES = ['30', '7', '1', '-1'];

router.get(
  '/',
  async (req, res, next) => {
    logger.info(`GET /api/v1/metrics ${JSON.stringify(req.query)}`);
    const meta = {
      available_query_parameters: {
        entities: {
          type: 'optional',
          options: ['result', 'author'],
          help: 'multiple values possible, separated by commas',
        },
        sources: {
          type: 'optional',
          options: AVAILABLE_SOURCES,
          help: 'multiple values possible, separated by commas',
        },
        ids: {
          type: 'optional',
          help: 'search keyword(s) and/or account_id(s) separated by commas',
        },
        interval: {
          type: 'optional',
          options: AVAILABLE_INTERVALS,
          help: 'outputs granularity of series',
        },
        dateRange: {
          type: 'optional',
          options: AVAILABLE_DATE_RANGES,
          help: 'refines precision of series',
        },
        showDeleted: {
          type: 'optional',
          options: [0, 1],
          help: 'shows deleted feeds if 1',
        },
        showErrorLines: {
          type: 'optional',
          options: [0, 1],
          help: 'shows error lines for feeds if 1',
        },
        showWarningLines: {
          type: 'optional',
          options: [0, 1],
          help: 'shows warning lines for feeds if 1',
        },
        client_ids: {
          type: 'optional',
          help: 'multiple values possible, separated by commas',
        },
      },
    };
    try {
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
      const showErrorLines = req.query.showErrorLines === '1' || 0;
      const showWarningLines = req.query.showWarningLines === '1' || 0;
      const clientIds = req.query.client_ids
        ? req.query.client_ids.split(',')
        : null;
      //
      // get all feeds within range
      let promises = [];
      const feedsList =
        req.query.showDeleted === '1'
          ? RedisKeys.deletedFeedsList()
          : RedisKeys.feedsList();
      const keys = await cli.zrangebyscore({
        key: feedsList,
        withscores: false,
        limit: 10 ** 4,
      });
      promises = keys.map(key => cli.hgetall({ key }));
      let hashes = await Promise.all(promises);
      hashes = hashes.filter(x => x !== null);
      // apply query filters
      if (sources) hashes = hashes.filter(x => sources.includes(x.source));
      if (entities) hashes = hashes.filter(x => entities.includes(x.entity));
      if (ids) hashes = hashes.filter(x => ids.includes(x.id));
      //
      // get topics
      promises = hashes.map(hash =>
        cli.zrangebyscore({
          key: RedisKeys.topicListByFeedIdSource(hash.id, hash.source),
          withscores: false,
          limit: 10 ** 4,
        }),
      );
      const topicsListKeys = await Promise.all(promises);
      hashes = _.merge(hashes, topicsListKeys.map(x => ({ keys: x || [] })));
      //
      // gettings client_ids
      promises = hashes.map(
        hash =>
          new Promise(async (resolve, reject) => {
            try {
              const p = [];
              hash.keys.forEach(key => {
                p.push(cli.hget({ key, field: 'projectId' }));
              });
              const projectIds = await Promise.all(p);
              hash.client_ids = projectIds;
              delete hash.keys;
              resolve(hash);
            } catch (e) {
              reject(e);
            }
          }),
      );
      hashes = await Promise.all(promises);
      // apply query filters
      if (clientIds) {
        hashes = hashes.filter(hash => {
          return hash.client_ids.some(cliId => clientIds.includes(cliId));
        });
      }
      //
      // getting ticks
      promises = hashes.map(hash =>
        cli.zrangebyscore({
          key: RedisKeys.feedTicks(hash.id, hash.source),
          withscores: false,
          limit: 10 ** 4,
          min: dateRangeMin,
        }),
      );
      const ticks = await Promise.all(promises);
      //
      // getting series
      const series = [];
      ticks.forEach((s, idx) => {
        const name = hashes[idx].name
          ? hashes[idx].name
          : `${hashes[idx].client_ids.join(',')}-${hashes[idx].source}:${hashes[
              idx
            ].id}`;
        series.push({
          data: utils.groupTicksByInterval(s, interval),
          id: hashes[idx].id,
          source: hashes[idx].source,
          name,
          last_time_crawl: moment().to(
            moment.unix(hashes[idx].last_time_crawl),
          ),
          entity: hashes[idx].entity,
          status: hashes[idx].status,
          client_ids: hashes[idx].client_ids || [],
        });
      });
      //
      // getting plotBands
      promises = hashes.map(hash =>
        cli.zrangebyscore({
          key: RedisKeys.feedErrorBands(hash.id, hash.source),
          withscores: true,
          limit: 10 ** 4,
          min: dateRangeMin,
        }),
      );
      const errorTicks = await Promise.all(promises).then(x => _.flatten(x));
      const plotBands = [];
      for (let i = 0; i < errorTicks.length; i += 2) {
        if (errorTicks[i] !== undefined && errorTicks[i + 1] !== undefined) {
          const member = errorTicks[i];
          const score = errorTicks[i + 1];
          plotBands.push({
            status: 'error',
            from: parseInt(`${member}000`, 10),
            to: parseInt(`${score}000`, 10),
          });
        }
      }
      // get error ticks and build plotLinkes object
      if (!showErrorLines && !showWarningLines) {
        res.status(200).json({
          success: true,
          metrics: {
            hashes,
            series,
            plotBands,
            type: 'spline',
            title: 'Number of results per feed',
          },
          meta,
        });
        return;
      }
      req.body.ids = ids;
      req.body.sources = sources;
      req.body.dateRangeMin = dateRangeMin;
      req.body.showErrorLines = showErrorLines;
      req.body.showWarningLines = showWarningLines;
      //
      req.body.series = series;
      req.body.plotBands = plotBands;
      req.body.meta = meta;
      next();
    } catch (e) {
      logger.error(e);
      res.status(500).json({
        success: false,
        error: {
          name: e.name,
          message: e.message,
        },
      });
    }
  },
  async (req, res) => {
    try {
      const plotLines = [];
      let promises = [];
      //
      promises = req.body.series.map(serie =>
        cli.zrangebyscore({
          key: RedisKeys.topicListByFeedIdSource(serie.id, serie.source),
          withscores: false,
          limit: 10 ** 4,
        }),
      );
      const keysList = await Promise.all(promises).then(x => _.flatten(x));
      //
      promises = keysList.map(key => cli.hget({ key, field: 'projectId' }));
      const projectIds = await Promise.all(promises).then(x => _.flatten(x));
      //
      const ticksKeys = [];
      req.body.sources.forEach(source => {
        // error
        if (req.body.showErrorLines) {
          projectIds.forEach(projectId => {
            ticksKeys.push(RedisKeys.feedErrorTicks(projectId, source));
          });
          ticksKeys.push(RedisKeys.feedErrorTicks('*', source));
        }
        // warning
        if (req.body.showWarningLines) {
          projectIds.forEach(projectId => {
            ticksKeys.push(RedisKeys.feedWarningTicks(projectId, source));
          });
          ticksKeys.push(RedisKeys.feedWarningTicks('*', source));
        }
      });
      promises = ticksKeys.map(key =>
        cli.zrangebyscore({
          key,
          withscores: false,
          limit: 10 ** 4,
          min: req.body.dateRangeMin,
        }),
      );
      const results = await Promise.all(promises).then(x => _.flatten(x));
      console.log(results); // TODO test when empty
      results.forEach(result => {
        result = JSON.parse(result);
        if (req.body.ids === null || req.body.ids.includes(result.id)) {
          plotLines.push({
            id: result.id,
            status: result.name,
            value: parseInt(`${result.ts}000`, 10),
            name: result.message,
            clientId: result.projectId,
          });
        }
      });
      res.status(200).json({
        success: true,
        metrics: {
          series: req.body.series,
          plotBands: req.body.plotBands,
          plotLines,
          type: 'spline',
          title: 'Number of results per feed',
        },
        meta: req.body.meta,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({
        success: false,
        error: {
          name: e.name,
          message: e.message,
        },
      });
    }
  },
);

module.exports = router;
