/* eslint-disable max-len, no-param-reassign, no-underscore-dangle */

const fs = require('fs');
const mysql = require('mysql');
const router = require('express').Router({ strict: true });

const config = require('../config');
const logger = require('winston').loggers.get('scheduler-logger');
const TopicsManager = require('../models/redis/topics-manager');

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

const getTopicsFromSQL = async () =>
  new Promise((resolve, reject) => {
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
