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
        sources: ['instagram', 'googleplus'],
        projectId,
        words: ['boa', 'python', 'arbok'],
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
      },
    ],
  };
  const moreTopicsToStore = {
    topics: [
      {
        name: 'test--second-name',
        sources: ['googleplus'],
        projectId,
        accounts: [],
        words: ['python', 'cobra'],
      },
    ],
  };

  const topicListKeys = [
    'zset:topicsList:feedSource:googleplus:feedId:python:timestamp',
    'zset:topicsList:feedSource:googleplus:feedId:cobra:timestamp',
  ];
  const firstTopicFeedKeys = [
    'hmap:feed:feedSource:googleplus:feedId:arbok',
    'hmap:feed:feedSource:googleplus:feedId:boa',
    'hmap:feed:feedSource:googleplus:feedId:python',
    'hmap:feed:feedSource:instagram:feedId:arbok',
    'hmap:feed:feedSource:instagram:feedId:boa',
    'hmap:feed:feedSource:instagram:feedId:python',
    'hmap:feed:feedSource:instagram:feedId:12394867',
    'hmap:feed:feedSource:instagram:feedId:2349687',
  ];
  const secondTopicFeedKeys = [
    'hmap:feed:feedSource:googleplus:feedId:cobra',
    'hmap:feed:feedSource:googleplus:feedId:python',
  ];

  describe('Delete first topic when the second shares feeds', function() {
    before(async () => {
      const result = await ProjectsManager.create(project);
      projectId = result.id;
      topicsToStore.topics[0].projectId = projectId;
      moreTopicsToStore.topics[0].projectId = projectId;
    });

    it('should create a first topic', async () => {
      // topicId
      const results = await TopicsManager.store(topicsToStore.topics);
      topicId = results[0].id;
      topicsToStore.topics[0].id = topicId;
      //
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsListByTopicId(topicId),
        withscores: false,
      });
      expect(members).to.deep.have.members(firstTopicFeedKeys);
    });

    it('should create a second topic', async () => {
      // secondTopicId
      const results = await TopicsManager.store(moreTopicsToStore.topics);
      secondTopicId = results[0].id;
      moreTopicsToStore.topics[0].id = topicId;
      //
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsListByTopicId(secondTopicId),
        withscores: false,
      });
      expect(members).to.deep.have.members(secondTopicFeedKeys);
    });

    it('should find two topics for the first feed (A1)', async () => {
      const count = await cli.zcount({
        key: topicListKeys[0],
        withscores: false,
      });
      expect(count).to.equal(2);
    });

    it('should find one topic for the second feed (B1)', async () => {
      const count = await cli.zcount({
        key: topicListKeys[1],
        withscores: false,
      });
      expect(count).to.equal(1);
    });

    it('should delete the first topic', async () => {
      await TopicsManager.delete(topicId);
      const count = await cli.zcount({
        key: RedisKeys.topicsListByClientId(projectId),
      });
      expect(count).to.equal(1);
    });

    it('should find a list of 2 feed keys in global feedsList', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsList(),
        withscores: false,
      });
      expect(members.length).to.equal(2);
      expect(members).to.deep.have.members(secondTopicFeedKeys);
    });

    it('should find a list of 7 feed keys in deletedFeedsList', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.deletedFeedsList(),
        withscores: false,
      });
      // remove one feed because its shared with the other feed
      const deletedFeeds = firstTopicFeedKeys.filter(
        x => x !== RedisKeys.feed('python', 'googleplus'),
      );
      expect(members).to.deep.have.members(deletedFeeds);
    });

    it('should find two topics for the first feed (A2)', async () => {
      const count = await cli.zcount({
        key: topicListKeys[0],
        withscores: false,
      });
      expect(count).to.equal(1);
    });

    it('should find one topic for the second feed (B2)', async () => {
      const count = await cli.zcount({
        key: topicListKeys[1],
        withscores: false,
      });
      expect(count).to.equal(1);
    });

    after(async () => {
      await TopicsManager.delete(topicId);
      await TopicsManager.delete(secondTopicId);
    });

    after(async () => {
      // common feeds
      const promises = [];
      firstTopicFeedKeys.forEach(key => {
        promises.push(cli.del({ key }));
      });
      topicListKeys.forEach(key => {
        promises.push(cli.del({ key }));
      });
      const members = await cli.zrangebyscore({
        key: RedisKeys.deletedFeedsList(),
        withscores: false,
      });
      members.forEach(feedKey => {
        promises.push(cli.del({ key: feedKey }));
      });
      promises.push(cli.del({ key: RedisKeys.feedsList() }));
      promises.push(cli.del({ key: RedisKeys.deletedFeedsList() }));
      promises.push(
        cli.del({ key: RedisKeys.topicsListByClientId(projectId) }),
      );
      await Promise.all(promises);
    });

    after(async () => {
      await ProjectsManager.delete(projectId);
    });
  });
});
