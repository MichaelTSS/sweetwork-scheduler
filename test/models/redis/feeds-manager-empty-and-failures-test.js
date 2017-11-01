/* eslint-disable prefer-arrow-callback, no-unused-expressions, no-param-reassign, func-names, prefer-destructuring */
const expect = require('chai').expect;

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

describe('TopicsManager', function() {
  let topicId;
  let secondTopicId;
  let projectId;
  const project = {
    name: 'test--project',
  };
  const topicsToStore = {
    topics: [
      {
        name: 'test--name',
        accounts: [
          {
            id: '12394867',
            source: 'instagram',
          },
          {
            id: '2349687',
            source: 'instagram',
          },
        ],
        sources: ['instagram', 'googleplus'],
        projectId,
        words: ['boa', 'python', 'arbok'],
      },
    ],
  };
  const moreTopicsToStore = {
    topics: [
      {
        name: 'test--second-name',
        accounts: [],
        sources: ['googleplus'],
        projectId,
        words: ['python', 'cobra'],
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
  const feedTopicsKeysList = [
    'zset:topicsList:feedSource:instagram:feedId:12394867:timestamp',
    'zset:topicsList:feedSource:googleplus:feedId:python:timestamp',
    'zset:topicsList:feedSource:instagram:feedId:2349687:timestamp',
    'zset:topicsList:feedSource:googleplus:feedId:boa:timestamp',
    'zset:topicsList:feedSource:instagram:feedId:boa:timestamp',
    'zset:topicsList:feedSource:googleplus:feedId:arbok:timestamp',
    'zset:topicsList:feedSource:instagram:feedId:arbok:timestamp',
    'zset:topicsList:feedSource:instagram:feedId:python:timestamp',
  ];
  const expectedListsofFeed = [
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
  const topicsListByFeedPair = RedisKeys.topicListByFeedIdSource(
    'python',
    'googleplus',
  );

  describe('Create initial topic', function() {
    before(async () => {
      const response = await ProjectsManager.create(project);
      projectId = response.id;
      topicsToStore.topics[0].projectId = projectId;
      moreTopicsToStore.topics[0].projectId = projectId;
    });

    it('should create one topic', async () => {
      const results = await TopicsManager.store(topicsToStore.topics);
      topicId = results[0].id;
      const count = await cli.zcount({
        key: RedisKeys.topicsListByClientId(projectId),
      });
      expect(count).to.equal(1);
    });

    it('should find a list of feed keys in global feeds list', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsList(),
        withscores: false,
      });
      expect(members).to.deep.have.members(feedListToBeStoredInRedis);
    });

    it('should find a list of feed keys in the list by topicId (1)', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsListByTopicId(topicId),
        withscores: false,
      });
      expect(members).to.deep.have.members(feedListToBeStoredInRedis);
    });

    it('should find a list of feed keys in the list by topicId (2)', async () => {
      const promises = [];
      feedListToBeStoredInRedis.forEach(key => {
        promises.push(cli.hgetall({ key }));
      });
      const results = await Promise.all(promises);
      expect(results).to.deep.have.members(expectedListsofFeed);
    });

    it('should find list of related topics for a given feed_id/source pair', async () => {
      const members = await cli.zrangebyscore({
        key: topicsListByFeedPair,
        withscores: false,
      });
      expect(members.length).to.equal(1);
      expect(members).to.deep.have.members([RedisKeys.topic(topicId)]);
    });

    it('should create another topic with some shared feed pairs', async () => {
      const results = await TopicsManager.store(moreTopicsToStore.topics);
      secondTopicId = results[0].id;
      const count = await cli.zcount({
        key: RedisKeys.topicsListByClientId(projectId),
      });
      expect(count).to.equal(2);
    });

    it('should have an updated count of feed keys in global feedsList Zset', async () => {
      const members = await cli.zrangebyscore({
        key: topicsListByFeedPair,
        withscores: false,
      });
      expect(members.length).to.equal(2);
      expect(members).to.deep.have.members([
        RedisKeys.topic(topicId),
        RedisKeys.topic(secondTopicId),
      ]);
    });

    after(async () => {
      // topics
      await TopicsManager.delete(topicId);
      await TopicsManager.delete(secondTopicId);
    });

    after(async () => {
      // projects
      await ProjectsManager.delete(projectId);
    });

    after(async () => {
      // topicId
      const key = RedisKeys.feedsListByTopicId(topicId);
      const members = await cli.zrangebyscore({ key, withscores: false });
      const promises = [];
      members.forEach(feedKey => {
        promises.push(cli.del({ key: feedKey }));
      });
      promises.push(cli.del({ key: RedisKeys.topic(topicId) }));
      promises.push(cli.del({ key }));
      await Promise.all(promises);
    });

    after(async () => {
      // secondTopicId
      const key = RedisKeys.feedsListByTopicId(secondTopicId);
      const members = await cli.zrangebyscore({ key, withscores: false });
      const promises = [];
      members.forEach(feedKey => {
        promises.push(cli.del({ key: feedKey }));
      });
      promises.push(cli.del({ key: RedisKeys.topic(secondTopicId) }));
      promises.push(cli.del({ key }));
      await Promise.all(promises);
    });

    after(async () => {
      // common feeds
      const promises = [
        cli.del({ key: RedisKeys.feedsList() }),
        cli.del({ key: RedisKeys.topicsListByClientId(projectId) }),
        cli.del({
          key: 'zset:topicsList:feedSource:googleplus:feedId:cobra:timestamp',
        }),
      ];
      const members = await cli.zrangebyscore({
        key: RedisKeys.deletedFeedsList(),
      });
      members.forEach(key => {
        promises.push(cli.del({ key }));
      });
      feedTopicsKeysList.forEach(key => {
        promises.push(cli.del({ key }));
      });
      promises.push(cli.del({ key: RedisKeys.deletedFeedsList() }));
      await Promise.all(promises);
    });
  });
});
