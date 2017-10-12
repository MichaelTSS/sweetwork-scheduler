/* eslint-disable new-cap */
const router = require('express').Router({ strict: true });
const logger = require('winston').loggers.get('scheduler-logger');
const TopicManager = require('../models/redis/topics-manager');

router.get('/(:topic_id)?', (req, res, next) => {
  logger.info(`GET /api/v1/topics ${JSON.stringify(req.params)}`);
  let topicIds = [];
  if (req.params && req.params.topic_id) topicIds = [req.params.topic_id];
  else if (req.query.topic_ids) topicIds = req.query.topic_ids.split(',');
  const clientId = req.query.client_id;
  const availableQueryParameters = {
    client_id: {
      type: 'optional'
    },
    topic_ids: {
      type: 'optional'
    }
  };
  //
  TopicManager.get(clientId, topicIds).then(
    topics => {
      res.json({
        success: true,
        topics,
        meta: {
          available_query_parameters: availableQueryParameters,
          num_topics: topics.length
        }
      });
    },
    err => {
      res.json({
        success: false,
        meta: {
          available_query_parameters: availableQueryParameters
        },
        error: {
          name: err.name,
          message: err.message
        }
      });
    }
  );
});

router.post('/', (req, res, next) => {
  TopicManager.store(req.body.topics).then(
    num_topics => {
      res.json({ success: true, num_topics });
    },
    err => {
      res.json({
        success: false,
        error: {
          name: err.name,
          message: err.message
        }
      });
    }
  );
});

router.delete('/:topic_id', (req, res, next) => {
  TopicManager.delete(req.params.topic_id).then(
    () => {
      res.json({ success: true });
    },
    err => {
      res.json({
        success: false,
        error: {
          name: err.name,
          message: err.message
        }
      });
    }
  );
});

module.exports = router;
