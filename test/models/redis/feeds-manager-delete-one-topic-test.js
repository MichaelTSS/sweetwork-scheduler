/* eslint-disable prefer-arrow-callback, no-unused-expressions, no-param-reassign, func-names, prefer-destructuring */
const expect = require('chai').expect;
const _ = require('lodash');

const config = require('../../../app/config');
const RedisKeys = require('../../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');

config.set('REDIS:db', 1); // 1 is the test db index
config.set('MYSQL:database', 'sweetgcloudtest'); // sweetgcloudtest is the test database
const cli = new RedisClient(
  config.get('REDIS:host'),
  config.get('REDIS:port'),
  config.get('REDIS:db'),
);
const TopicsManager = require('../../../app/models/redis/topics-manager');
const ProjectsManager = require('../../../app/models/sql/projects-manager');

describe('FeedsManager', function() {
  let topicId;
  let secondTopicId;
  let projectId;
  const project = {
    name: 'Let the silences change you',
  };
  const topicsToStore = {
    topics: [
      {
        name: 'test--name',
        accounts: [
          {
            id: 12394867,
            source: 'instagram',
          },
          {
            id: 2349687,
            source: 'instagram',
          },
        ],
        sources: ['instagram', 'googleplus'],
        projectId,
        words: ['boa', 'python', 'arbok'],
      },
    ],
  };
  const feedListToBeStoredInRedis = [
    'hmap:feed:feedSource:instagram:feedId:arbok',
    'hmap:feed:feedSource:instagram:feedId:boa',
    'hmap:feed:feedSource:instagram:feedId:python',
    'hmap:feed:feedSource:instagram:feedId:12394867',
    'hmap:feed:feedSource:instagram:feedId:2349687',
    'hmap:feed:feedSource:googleplus:feedId:arbok',
    'hmap:feed:feedSource:googleplus:feedId:boa',
    'hmap:feed:feedSource:googleplus:feedId:python',
  ];
  const expectepromisesofFeed = [
    {
      source: 'instagram',
      id: 'arbok',
      entity: 'result',
      status: 'sleep',
    },
    {
      source: 'instagram',
      id: 'boa',
      entity: 'result',
      status: 'sleep',
    },
    {
      source: 'instagram',
      id: 'python',
      entity: 'result',
      status: 'sleep',
    },
    {
      source: 'instagram',
      id: '12394867',
      entity: 'author',
      status: 'sleep',
    },
    {
      source: 'instagram',
      id: '2349687',
      entity: 'author',
      status: 'sleep',
    },
    {
      source: 'googleplus',
      id: 'arbok',
      entity: 'result',
      status: 'sleep',
    },
    {
      source: 'googleplus',
      id: 'boa',
      entity: 'result',
      status: 'sleep',
    },
    {
      source: 'googleplus',
      id: 'python',
      entity: 'result',
      status: 'sleep',
    },
  ];

  describe('Delete one topic', function() {
    before(async () => {
      const result = await ProjectsManager.create(project);
      projectId = result.id;
      topicsToStore.topics[0].projectId = projectId;
      // moreTopicsToStore.topics[0].projectId = projectId;
    });

    before(async () => {
      // topicId
      const results = await TopicsManager.store(topicsToStore.topics);
      topicId = results[0].id;
      topicsToStore.topics[0].id = topicId;
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsListByTopicId(topicId),
        withscores: false,
      });
      expect(members).to.deep.have.members(feedListToBeStoredInRedis);
    });

    it('should delete the first topic', async () => {
      await TopicsManager.delete(topicId);
      const count = await cli.zcount({
        key: RedisKeys.topicsListByClientId(projectId),
      });
      expect(count).to.equal(0);
    });

    it('should find an empty list of feed keys in global feedsList', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsList(),
        withscores: false,
      });
      expect(members).to.be.empty;
    });

    it('should find the list of feed keys in deletedFeedsList', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.deletedFeedsList(),
        withscores: false,
      });
      expect(members.length).to.equal(8);
      expect(members).to.deep.have.members(feedListToBeStoredInRedis);
    });

    it('should find no list of feed keys in the list by topicId', async () => {
      const count = await cli.zcount({
        key: RedisKeys.feedsListByTopicId(topicId),
      });
      expect(count).to.equal(0);
    });

    it('should find no list of feed keys in the list by secondTopicId', async () => {
      const count = await cli.zcount({
        key: RedisKeys.feedsListByTopicId(secondTopicId),
      });
      expect(count).to.equal(0);
    });

    it('should find no sleeping feed hashes in Redis', async () => {
      const promises = [];
      feedListToBeStoredInRedis.forEach(key => {
        promises.push(cli.hgetall({ key }));
      });
      const results = await Promise.all(promises);
      const sleepingFeedHashes = _.transform(
        expectepromisesofFeed,
        (result, feed) => {
          feed.status = 'sleep';
          result.push(feed);
        },
        [],
      );
      expect(results).to.deep.have.members(sleepingFeedHashes);
    });

    after(async () => {
      // topicId
      await TopicsManager.delete(topicId);
    });

    after(async () => {
      // common feeds
      const promises = [
        cli.del({ key: RedisKeys.feedsList() }),
        cli.del({ key: RedisKeys.deletedFeedsList() }),
        cli.del({ key: RedisKeys.topicsListByClientId(projectId) }),
      ];
      feedListToBeStoredInRedis.forEach(key => {
        promises.push(cli.del({ key }));
      });
      await Promise.all(promises);
    });

    after(async () => {
      await ProjectsManager.delete(projectId);
    });
  });
});
