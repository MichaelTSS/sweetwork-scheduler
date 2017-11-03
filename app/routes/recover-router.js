/* eslint-disable max-len, no-param-reassign, no-underscore-dangle, prefer-destructuring */
const router = require('express').Router({ strict: true });
const logger = require('winston').loggers.get('scheduler-logger');
const TopicsManager = require('../models/redis/topics-manager');
const startConnection = require('../utils').startConnection;

const getTopicsFromSQL = () =>
  new Promise(async (resolve, reject) => {
    const connection = await startConnection();
    connection.query('SELECT * FROM Topics', async (error, results) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(results);
    });
  });

router.get('/', async (req, res) => {
  try {
    logger.info(`GET /api/v1/recover ${JSON.stringify(req.params)}`);
    const rows = await getTopicsFromSQL();
    const topics = rows.map(TopicsManager.sqlToJSON);
    const promises = topics.map(x => TopicsManager.storeInRedis(x));
    const results = await Promise.all(promises);
    res.json({
      success: true,
      num_topics: results.length,
      topics: results,
    });
  } catch (err) {
    res.json({
      success: false,
      error: {
        name: err.name,
        message: err.message,
      },
    });
  }
});

module.exports = router;
