/* eslint-disable new-cap */
const router = require('express').Router({ strict: true });
const logger = require('winston').loggers.get('scheduler-logger');
const TopicManager = require('../models/redis/topics-manager');

// TODO format checking
router.get('/(:topic_id)?', async (req, res) => {
  logger.info(`GET /api/v1/topics ${JSON.stringify(req.params)}`);
  let topicIds = [];
  if (req.params && req.params.topic_id) topicIds = [req.params.topic_id];
  else if (req.query.topic_ids) topicIds = req.query.topic_ids.split(',');
  const clientId = req.query.client_id;
  const availableQueryParameters = {
    client_id: {
      type: 'optional',
    },
    topic_ids: {
      type: 'optional',
    },
  };
  //
  try {
    const topics = await TopicManager.get(clientId, topicIds);
    res.json({
      success: true,
      topics,
      meta: {
        available_query_parameters: availableQueryParameters,
        num_topics: topics.length,
      },
    });
  } catch (err) {
    res.json({
      success: false,
      meta: {
        available_query_parameters: availableQueryParameters,
      },
      error: {
        name: err.name,
        message: err.message,
      },
    });
  }
});

// format checking
router.post('/', async (req, res) => {
  try {
    if (!Array.isArray(req.body.topics) || req.body.topics.length === 0) {
      throw new Error('Missing topics in body');
    }
    req.body.topics.forEach(topic => {
      TopicManager.validate(topic);
    });
    const results = await TopicManager.store(req.body.topics);
    res.json({ success: true, topics: results });
  } catch (e) {
    res.json({
      success: false,
      error: {
        name: e.name,
        message: e.message,
      },
    });
  }
});

// TODO format checking
router.delete('/:topic_id', async (req, res) => {
  try {
    if (!req.params.topic_id || req.params.topic_id === 'undefined') {
      throw new Error('Missing topic_id in query');
    }
    await TopicManager.delete(req.params.topic_id);
    res.json({ success: true });
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
