/* eslint-disable new-cap */
// 3rd party
const router = require('express').Router({ strict: true });
const cors = require('cors');
const logger = require('winston').loggers.get('scheduler-logger');
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone');
const config = require('../config');
// sweetwork
const RedisClient = require('sweetwork-redis-client');
const RedisKeys = require('../redis-keys');
const topicsRouter = require('./topics-router');
const feedsRouter = require('./feeds-router');
// const configRouter = require('./config-router');
const metricsRouter = require('./metrics-router');
const projectsRouter = require('./projects-router');
// const recoverRouter = require('./recover-router');

router.use(cors());

router.get('/favicon.ico', (req, res) => {
  res.status(200).send(null);
});

router.use('/ping', (req, res) => {
  res.json({ success: true, message: 'Scheduler Service pong' });
});

router.get('/', (req, res) => {
  logger.info(`Scheduler Service ${req.method} ${req.path}`);
  res.status(200).json({
    success: true,
    data: [],
    meta: [],
  });
});

router.post('/auth', (req, res) => {
  const passphrase = config.get('SVC_SCHEDULER:jwt_passphrase');
  const secret = config.get('SVC_SCHEDULER:jwt_secret');
  if (!req.body.service) {
    const error = new Error('Scheduler Service Auth: service body is required');
    logger.error(error);
    res.status(400).json({
      message: error.message,
      error,
    });
  } else if (!req.body.passphrase) {
    const error = new Error(
      'Scheduler Service Auth: passphrase body is required',
    );
    logger.error(error);
    res.status(400).json({
      message: error.message,
      error,
    });
  } else if (req.body.passphrase !== passphrase) {
    const error = new Error(
      `Scheduler Service Auth: wrong passphrase ${JSON.stringify(
        req.body,
      )} vs. passphrase`,
    );
    logger.error(error);
    res.status(401).json({
      message: error.message,
      error: {
        name: error.name,
        code: error.code,
        status: error.status,
      },
    });
  } else {
    const token = jwt.sign({ service: req.body.service }, secret);
    res.status(200).json({
      success: true,
      token,
    });
  }
});

router.all('/api/v1/*', (req, res, next) => {
  // logger.info(`Scheduler Service ${req.method} ${req.originalUrl}`);
  // log by service
  const cli = new RedisClient(
    config.get('REDIS:host'),
    config.get('REDIS:port'),
    config.get('REDIS:db'),
  );
  const unixNow = moment().unix();
  const key = RedisKeys.inboundRequestsByServiceName(req.user.service);
  cli.zadd({
    key,
    scomembers: [unixNow, `${req.method} ${req.originalUrl} ${unixNow}`],
  });
  next();
});

router.use('/api/v1/topics', topicsRouter);
router.use('/api/v1/feeds', feedsRouter);
// router.use('/api/v1/config', configRouter);
router.use('/api/v1/metrics', metricsRouter);
// router.use('/api/v1/recover', recoverRouter);
router.use('/api/v1/projects', projectsRouter);

module.exports = router;
