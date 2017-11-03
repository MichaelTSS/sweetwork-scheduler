/* eslint-disable new-cap, prefer-destructuring */
const router = require('express').Router({ strict: true });
const logger = require('winston').loggers.get('scheduler-logger');
// const TopicManager = require('../models/redis/topics-manager');
// const mysql = require('mysql');
const startConnection = require('../utils').startConnection;

router.get('/', async (req, res) => {
  /* eslint-disable no-unused-vars */
  logger.info(`GET /api/v1/projects`);
  const query = 'SELECT * FROM Projects';
  const connection = await startConnection();
  connection.query(query, (error, results, fields) => {
    if (error) {
      logger.error(error);
      res.status(500).json({ success: false, error });
      return;
    }
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
