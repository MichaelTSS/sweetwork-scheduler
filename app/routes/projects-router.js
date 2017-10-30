/* eslint-disable new-cap */
const fs = require('fs');
const router = require('express').Router({ strict: true });
const logger = require('winston').loggers.get('scheduler-logger');
// const TopicManager = require('../models/redis/topics-manager');
const mysql = require('mysql');
const config = require('../config');

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

router.get('/', (req, res) => {
  /* eslint-disable no-unused-vars */
  logger.info(`GET /api/v1/projects`);
  const query = 'SELECT * FROM Projects';
  connection.query(query, (error, results, fields) => {
    if (error) {
      logger.error(error);
      res.status(500).json({ success: false, error });
      return;
    }
    connection.end();
    res.json({ success: true, projects: results });
  });
});

router.post('/', (req, res) => {
  /* eslint-disable camelcase */
  // TopicManager.store(req.body.topics).then(
  //   num_topics => {
  //     res.json({ success: true, num_topics });
  //   },
  //   err => {
  //     res.json({
  //       success: false,
  //       error: {
  //         name: err.name,
  //         message: err.message,
  //       },
  //     });
  //   },
  // );
  res.json({ success: true });
});

module.exports = router;
