/* eslint-disable no-param-reassign */
const Nanotimer = require('nanotimer');
const moment = require('moment-timezone');
const config = require('../config');
const Factory = require('./factory');
// home brewed
const logger = require('winston').loggers.get('scheduler-logger');
const RedisKeys = require('../redis-keys');
const RedisClient = require('sweetwork-redis-client');

const nanotimer = new Nanotimer();
const cli = new RedisClient(
  config.get('REDIS:host'),
  config.get('REDIS:port'),
  config.get('REDIS:db'),
);
const NEXT_CRAWL_DURATION = 15; // comes back in 15 minutes if not returned by Api Service

async function schedulerAsync() {
  const feedsListKey = RedisKeys.feedsList();
  try {
    const members = await cli.zrangebyscore({
      key: feedsListKey,
      withscores: false,
      max: moment().unix(),
      limit: 1,
    });
    if (members.length === 0) {
      logger.info('tick');
      return;
    }
    const [member] = members;
    const feedHash = await cli.hgetall({ key: member });
    const factory = new Factory(feedHash);

    // FIXME temporary cleanup hack
    if (feedHash.id === undefined) {
      await cli.del({ key: member });
      await cli.zrem({ key: feedsListKey, members: [member] });
      logger.error(`Key ${member} had a erronous hash`);
      return;
    }
    // end temporary cleanup hack

    await factory.markAsBusy(member);
    await factory.getDataFromTopics();
    factory.printState();
    const isSuccess = await factory.search();

    // crawl again in 15 minutes so the scheduler picks it up
    // even if the controller has failed to get back to up
    if (!isSuccess) {
      await factory.setToCrawlAgain(member, 1); // try again in one minute
    } else {
      await factory.setToCrawlAgain(member, NEXT_CRAWL_DURATION);
    }
  } catch (e) {
    logger.error(e);
  }
}

nanotimer.setInterval(
  async () => {
    await schedulerAsync();
  },
  null,
  '1s',
);
