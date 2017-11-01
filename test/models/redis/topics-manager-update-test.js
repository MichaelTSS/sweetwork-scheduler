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
  describe('Update a topic', function() {
    let topicId1;
    let topicId2;
    let topicId3;
    let topicId4;
    let projectId1;
    let projectId2;
    let projectId3;
    const project1 = {
      name: 'I walked you to the sun',
    };
    const project2 = {
      name: 'Back and forth from the moon',
    };
    const project3 = {
      name: 'Let the silences change you',
    };
    const topics1ToStore = {
      topics: [
        {
          name: 'Teletubbies',
          sources: ['googleplus'],
          projectId: projectId1,
          words: ['Tinky-Winky', 'Dipsy'],
          accounts: [],
        },
      ],
    };
    const topics2ToStore = {
      topics: [
        {
          name: 'Power Rangers',
          sources: ['googleplus'],
          projectId: projectId2,
          words: [
            'Red Ranger',
            'Yellow Ranger',
            'Black Ranger',
            'Pink Ranger',
            'Blue Ranger',
            'Green Ranger',
          ],
          accounts: [],
        },
      ],
    };
    const topics3ToStore = {
      topics: [
        {
          name: 'Copycat',
          sources: ['googleplus'],
          projectId: projectId3,
          words: ['Tinky-Winky', 'Grumpy Cat'],
          accounts: [],
        },
      ],
    };
    const topics4ToStore = {
      topics: [
        {
          name: 'X-Men',
          sources: ['googleplus'],
          projectId: projectId1,
          words: ['Docter X', 'Cyclope'],
          accounts: [],
        },
      ],
    };
    const topic2expectedFeedsList = [
      'hmap:feed:feedSource:googleplus:feedId:Black Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Blue Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Green Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Pink Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Red Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Yellow Ranger',
    ];
    const topics2ToUpdate = {
      topics: [
        {
          name: 'Power Rangers',
          sources: ['googleplus'],
          projectId: projectId2,
          words: [
            'Red Ranger',
            'Yellow Ranger',
            'Black Ranger',
            'Pink Ranger',
            'Blue Ranger',
            'Tinky-Winky',
          ],
          accounts: [],
        },
      ],
    };
    const topic1ToBeStoredInRedis = {
      name: 'Teletubbies',
      sources: 'googleplus',
      projectId: String(projectId1),
    };

    before(async () => {
      let result = await ProjectsManager.create(project1);
      projectId1 = result.id;
      topics1ToStore.topics[0].projectId = projectId1;
      topics4ToStore.topics[0].projectId = projectId1;
      topic1ToBeStoredInRedis.projectId = String(projectId1);
      result = await ProjectsManager.create(project2);
      projectId2 = result.id;
      topics2ToStore.topics[0].projectId = projectId2;
      topics2ToUpdate.topics[0].projectId = projectId2;
      result = await ProjectsManager.create(project3);
      projectId3 = result.id;
      topics3ToStore.topics[0].projectId = projectId3;
    });

    it('should create first topic', async () => {
      const results = await TopicsManager.store(topics1ToStore.topics);
      topicId1 = results[0].id;
      topic1ToBeStoredInRedis.id = String(topicId1);
      const members = await cli.zrangebyscore({
        key: RedisKeys.topicsListByClientId(projectId1),
        withscores: false,
      });
      expect(members.length).to.equal(1);
      expect(members).to.deep.equal([RedisKeys.topic(topicId1)]);
    });

    it('should have the stored topic', async () => {
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId1) });
      expect(topicHash).to.deep.equal(topic1ToBeStoredInRedis);
    });

    it('should create second topic', async () => {
      const results = await TopicsManager.store(topics2ToStore.topics);
      topicId2 = results[0].id;
      const members = await cli.zrangebyscore({
        key: RedisKeys.topicsListByClientId(projectId2),
        withscores: false,
      });
      expect(members.length).to.equal(1);
      expect(members).to.deep.equal([RedisKeys.topic(topicId2)]);
    });

    it('should check if the second topic is correctely linked to his feeds', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsListByTopicId(topicId2),
        withscores: false,
      });
      expect(members).to.deep.have.members(topic2expectedFeedsList);
    });

    it('should fail to update the second topic', async () => {
      try {
        await TopicsManager.update(topics2ToUpdate.topics[0]);
      } catch (e) {
        expect(e.name).to.equal('TopicsManagerError');
        expect(e.message).to.equal('Missing id argument');
      }
    });

    // add a keyword to second topic and check if that feed exists for second topic
    it('should add a cross-keyword to second topic', async () => {
      topics2ToStore.topics[0].id = topicId2;
      topics2ToUpdate.topics[0].id = topicId2;
      await TopicsManager.update(topics2ToUpdate.topics[0]);
      const members = await cli.zrangebyscore({
        key: RedisKeys.topicsListByClientId(projectId2),
        withscores: false,
      });
      expect(members.length).to.equal(1);
      expect(members).to.deep.equal([RedisKeys.topic(topicId2)]);
    });

    it('should check if the feed is connected to two topics', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.topicListByFeedIdSource('Tinky-Winky', 'googleplus'),
        withscores: false,
      });
      expect(members.length).to.equal(2);
      expect(members).to.deep.equal([
        RedisKeys.topic(topicId1),
        RedisKeys.topic(topicId2),
      ]);
    });

    it('should check if the first topic is linked to this feed', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsListByTopicId(topicId1),
        withscores: false,
      });
      expect(members).to.include(RedisKeys.feed('Tinky-Winky', 'googleplus'));
    });

    it('should check if the second topic is linked to this feed', async () => {
      const members = await cli.zrangebyscore({
        key: RedisKeys.feedsListByTopicId(topicId2),
        withscores: false,
      });
      expect(members).to.include(RedisKeys.feed('Tinky-Winky', 'googleplus'));
    });

    it('should add another topic to client 1', async () => {
      const results = await TopicsManager.store(topics4ToStore.topics);
      topicId4 = results[0].id;
      topics4ToStore.topics[0].id = topicId4;
      //
      const members = await cli.zrangebyscore({
        key: RedisKeys.topicsListByClientId(projectId1),
        withscores: false,
      });
      expect(members.length).to.equal(2);
      expect(members).to.include(RedisKeys.topic(topicId4));
    });

    it('should add fourth topic to client 3', async () => {
      const results = await TopicsManager.store(topics3ToStore.topics);
      topicId3 = results[0].id;
      topics3ToStore.topics[0].id = topicId3;
      //
      const members = await cli.zrangebyscore({
        key: RedisKeys.topicsListByClientId(projectId3),
        withscores: false,
      });
      expect(members.length).to.equal(1);
      expect(members).to.include(RedisKeys.topic(topicId3));
    });

    // Delete a topic

    it('should delete first topic', async () => {
      await TopicsManager.delete(topicId1);
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId1) });
      expect(topicHash).to.equal(null);
    });

    it('should delete second topic', async () => {
      await TopicsManager.delete(topicId2);
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId2) });
      expect(topicHash).to.equal(null);
    });

    it('should delete third topic', async () => {
      await TopicsManager.delete(topicId3);
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId3) });
      expect(topicHash).to.equal(null);
    });

    it('should delete fourth topic', async () => {
      await TopicsManager.delete(topicId4);
      const topicHash = await cli.hgetall({ key: RedisKeys.topic(topicId4) });
      expect(topicHash).to.equal(null);
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
      await ProjectsManager.delete(projectId1);
      await ProjectsManager.delete(projectId2);
      await ProjectsManager.delete(projectId3);
    });
  });
});
