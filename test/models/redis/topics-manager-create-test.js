/* eslint-disable prefer-arrow-callback, no-unused-expressions, quotes, func-names, prefer-destructuring */
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
  describe('Empty and failures', function() {
    const projectId = 'acb66be6bab6f6b';
    const topicId = '8abc02f45a0c87e76';

    it('should find no topics for a non-existing projectId', async () => {
      const topics = await TopicsManager.get(projectId);
      expect(topics).to.be.empty;
      const count = await cli.zcount({
        key: RedisKeys.topicsListByClientId(projectId),
      });
      expect(count).to.equal(0);
    });

    it('should find no topics for a non-existing topic_ids', async () => {
      const topics = await TopicsManager.get(null, [topicId]);
      expect(topics).to.be.empty;
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId) });
      expect(topicHash).to.equal(null);
    });

    it('should fail to create a topic', async () => {
      try {
        await TopicsManager.store();
      } catch (err) {
        expect(err.message).to.equal('Missing topics argument');
      }
    });

    it('should not fail to delete a non existing topic', async () => {
      await TopicsManager.delete(topicId);
    });

    after(async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.deletedFeedsList(),
        withscores: false,
      });
      const promises = [];
      members.forEach(key => {
        promises.push(cli.del({ key }));
      });
      await Promise.all(promises);
      await cli.del({ key: RedisKeys.deletedFeedsList() });
    });

    after(async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsList(),
        withscores: false,
      });
      const promises = [];
      members.forEach(key => {
        promises.push(cli.del({ key }));
      });
      await Promise.all(promises);
      await cli.del({ key: RedisKeys.feedsList() });
    });
  });

  describe('Create a topic', function() {
    let projectId;
    let topicId;
    const project = {
      name: 'test--project',
    };
    const topicsToStore = {
      topics: [
        {
          name: 'test--name',
          accounts: [
            {
              id: 'my-awesome-user',
              source: 'instagram',
            },
            {
              id: 'my-greatest-avatar',
              source: 'twitter',
            },
          ],
          sources: ['twitter', 'instagram'],
          projectId,
          words: ['test'],
        },
      ],
    };
    const topicsToBeStored = {
      name: 'test--name',
      sources: ['twitter', 'instagram'],
      projectId,
      accounts: [
        {
          id: 'my-awesome-user',
          source: 'instagram',
        },
        {
          id: 'my-greatest-avatar',
          source: 'twitter',
        },
      ],
      words: ['test'],
      feeds: [
        {
          source: 'instagram',
          id: 'my-awesome-user',
          entity: 'author',
          status: 'sleep',
        },
        {
          source: 'instagram',
          id: 'test',
          entity: 'result',
          status: 'sleep',
        },
        {
          source: 'twitter',
          id: 'my-greatest-avatar',
          entity: 'author',
          status: 'sleep',
        },
        {
          source: 'twitter',
          id: 'test',
          entity: 'result',
          status: 'sleep',
        },
      ],
    };

    const topicToBeStoredInRedis = {
      name: 'test--name',
      sources: 'twitter,instagram',
      id: String(topicId),
      projectId: String(projectId),
    };

    const feedListToBeStoredInRedis = [
      'hmap:feed:feedSource:instagram:feedId:my-awesome-user',
      'hmap:feed:feedSource:instagram:feedId:test',
      'hmap:feed:feedSource:twitter:feedId:my-greatest-avatar',
      'hmap:feed:feedSource:twitter:feedId:test',
    ];

    before(async () => {
      const result = await ProjectsManager.create(project);
      projectId = result.id;
      topicsToStore.topics[0].projectId = projectId;
      topicsToBeStored.projectId = projectId;
      topicToBeStoredInRedis.projectId = String(projectId);
    });

    it('should create one topic', async () => {
      const results = await TopicsManager.store(topicsToStore.topics);
      topicId = results[0].id;
      topicsToBeStored.id = topicId;
      topicToBeStoredInRedis.id = String(topicId);
      const count = await cli.zcount({
        key: RedisKeys.topicsListByClientId(projectId),
      });
      expect(count).to.equal(1);
    });

    it('should have created one topic', async () => {
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId) });
      expect(topicHash).not.to.equal(null);
    });

    it('should read one topic', async () => {
      const topics = await TopicsManager.get(null, [topicId]);
      expect(topics.length).to.equal(1);
      expect(topics[0].id).to.equal(topicsToBeStored.id);
      expect(topics[0].name).to.equal(topicsToBeStored.name);
      expect(topics[0].feeds).to.deep.have.members(topicsToBeStored.feeds);
    });

    it('should read one topics projectId', async () => {
      const cId = await cli.hget({
        key: RedisKeys.topic(topicId),
        field: 'projectId',
      });
      expect(cId).to.equal(String(projectId));
    });

    it('should find a hash in redis', async () => {
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId) });
      expect(topicHash).to.be.deep.equal(topicToBeStoredInRedis);
    });

    it('should find one topic key in the list by projectId', async () => {
      // check topic key in clientsList
      const members = await cli.zrangebyscore({
        key: RedisKeys.topicsListByClientId(projectId),
        withscores: false,
      });
      expect(members.length).to.equal(1);
      expect(members[0]).to.equal(`hmap:topic:topicId:${topicId}`);
    });

    it('should find a list of feed keys in the list by topicId (1)', async () => {
      // check feed key in topicList
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsListByTopicId(topicId),
        withscores: false,
      });
      expect(members).to.deep.have.members(feedListToBeStoredInRedis);
    });

    it('should find a list of feed keys in the list by topicId (2)', async () => {
      // check feed key in topicList
      const promises = [];
      const expectepromisesofFeed = [
        {
          source: 'instagram',
          id: 'my-awesome-user',
          entity: 'author',
          status: 'sleep',
        },
        {
          source: 'instagram',
          id: 'test',
          entity: 'result',
          status: 'sleep',
        },
        {
          source: 'twitter',
          id: 'my-greatest-avatar',
          entity: 'author',
          status: 'sleep',
        },
        {
          source: 'twitter',
          id: 'test',
          entity: 'result',
          status: 'sleep',
        },
      ];
      feedListToBeStoredInRedis.forEach(key => {
        promises.push(cli.hgetall({ key }));
      });
      const results = await Promise.all(promises);
      expect(results).to.deep.equal(expectepromisesofFeed);
    });

    // Delete a topic

    it('should delete one topic', async () => {
      await TopicsManager.delete(topicId);
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId) });
      expect(topicHash).to.equal(null);
    });

    it('should find no list of feed keys in the list by topicId', async () => {
      const count = await cli.zcount({
        key: RedisKeys.feedsListByTopicId(topicId),
      });
      expect(count).to.equal(0);
    });

    it('should find all feeds with a status set to sleep', async () => {
      const promises = [];
      feedListToBeStoredInRedis.forEach(key => {
        promises.push(cli.hget({ key, field: 'status' }));
      });
      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).to.equal('sleep');
      });
    });

    it('should delete those feed keys', async () => {
      const promises = [];
      feedListToBeStoredInRedis.forEach(key => {
        promises.push(cli.del({ key }));
      });
      await Promise.all(promises);
    });

    it('should find no list of topic keys in the list by feedId', async () => {
      const promises = [];
      feedListToBeStoredInRedis.forEach(key => {
        promises.push(cli.hgetall({ key }));
      });
      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).to.equal(null);
      });
    });

    it('should find no topic keys in the list by projectId', async () => {
      // check topic key in clientsList
      const count = await cli.zcount({
        key: RedisKeys.topicsListByClientId(projectId),
      });
      expect(count).to.equal(0);
    });

    after(async () => {
      await TopicsManager.delete(topicId);
    });

    after(async () => {
      await ProjectsManager.delete(projectId);
    });

    after(async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.deletedFeedsList(),
        withscores: false,
      });
      const promises = [];
      members.forEach(key => {
        promises.push(cli.del({ key }));
      });
      promises.push(cli.del({ key: RedisKeys.deletedFeedsList() }));
      promises.push(cli.del({ key: RedisKeys.feedsListByTopicId(topicId) }));
      await Promise.all(promises);
    });
  });
});
