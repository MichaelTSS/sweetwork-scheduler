/* eslint-disable prefer-arrow-callback, no-unused-expressions, quotes */
const expect = require('chai').expect;

const config = require('../../../app/config');
const RedisKeys = require('../../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');
config.set('REDIS:db', 1); // 1 is the test db index
const cli = new RedisClient(config.get('REDIS:host'), config.get('REDIS:port'), config.get('REDIS:db'));
const TopicsManager = require('../../../app/models/redis/topics-manager');

describe('TopicsManager', function () {
  describe('Empty and failures', function () {
    const clientId = 'acb66be6bab6f6b';
    const topicId = '8abc02f45a0c87e76';
    it('should find no topics for a non-existing client_id', function (done) {
      TopicsManager.get(clientId).then(topics => {
        expect(topics).to.be.empty;
        cli.zcount({ key: RedisKeys.topicsListByClientId(clientId) }).then(count => {
          expect(count).to.equal(0);
          done();
        });
      });
    });

    it('should find no topics for a non-existing topic_ids', function (done) {
      TopicsManager.get(null, [topicId]).then(topics => {
        expect(topics).to.be.empty;
        cli.hgetall({ key: RedisKeys.topic(topicId) }).then(topicHash => {
          expect(topicHash).to.equal(null);
          done();
        });
      });
    });

    it('should fail to create a topic', function (done) {
      TopicsManager.store().catch(err => {
        expect(err.message).to.equal('Missing topics in request body');
        done();
      });
    });

    it('should not fail to delete a non existing topic', function (done) {
      TopicsManager.delete(topicId).then(() => done());
    });

    after(function (done) {
      cli.zrangebyscore({ key: RedisKeys.deletedFeedsList(), withscores: false }).then(members => {
        const dList = [];
        members.forEach(key => {
          dList.push(cli.del({ key }));
        });
        Promise.all(dList).then(() => {
          cli.del({ key: RedisKeys.deletedFeedsList() });
          done();
        });
      });
    });

    after(function (done) {
      cli.zrangebyscore({ key: RedisKeys.feedsList(), withscores: false }).then(members => {
        const dList = [];
        members.forEach(key => {
          dList.push(cli.del({ key }));
        });
        Promise.all(dList).then(() => {
          cli.del({ key: RedisKeys.feedsList() });
          done();
        });
      });
    });
  });

  describe('Create a topic', function () {
    const topicId = '1a23e4c567b8f9ac';
    const clientId = 12301234;
    const topicsToStore = {
      topics: [
        {
          id: topicId,
          name: 'test--name',
          included_profiles: [
            {
              accounts: [
                {
                  id: 'my-awesome-user',
                  network: 'instagram'
                }
              ]
            },
            {
              accounts: [
                {
                  id: 'my-greatest-avatar',
                  network: 'twitter'
                }
              ]
            }
          ],
          sources: ['twitter', 'instagram'],
          client_id: clientId,
          languages: [],
          countries: [],
          or: [{ content: 'test' }],
          and: []
        }
      ]
    };
    const topicsToBeStored = {
      id: topicId,
      name: 'test--name',
      sources: ['twitter', 'instagram'],
      client_id: clientId,
      languages: [],
      countries: [],
      and: [],
      or: [{ content: 'test' }],
      exclude: [],
      custom: [],
      included_profiles: [
        {
          rss: [],
          accounts: [
            {
              network: 'instagram'
            }
          ]
        },
        {
          rss: [],
          accounts: [
            {
              network: 'twitter'
            }
          ]
        }
      ],
      feeds: [
        {
          source: 'instagram',
          id: 'my-awesome-user',
          entity: 'result',
          languages: [],
          countries: []
        },
        {
          source: 'instagram',
          id: 'test',
          entity: 'result',
          languages: [],
          countries: []
        },
        {
          source: 'twitter',
          id: 'my-greatest-avatar',
          entity: 'result',
          languages: [],
          countries: []
        },
        {
          source: 'twitter',
          id: 'test',
          entity: 'result',
          languages: [],
          countries: []
        }
      ]
    };

    const topicToBeStoredInRedis = {
      id: topicId,
      name: 'test--name',
      sources: 'twitter,instagram',
      client_id: String(clientId),
      languages: '',
      countries: '',
      or: '[{"content":"test"}]',
      and: '[]',
      exclude: '[]',
      custom: '[]',
      included_profiles: '[{"rss":[],"accounts":[{"network":"instagram"}]},{"rss":[],"accounts":[{"network":"twitter"}]}]'
    };

    const feedListToBeStoredInRedis = [
      'hmap:feed:feedSource:instagram:feedId:my-awesome-user',
      'hmap:feed:feedSource:instagram:feedId:test',
      'hmap:feed:feedSource:twitter:feedId:my-greatest-avatar',
      'hmap:feed:feedSource:twitter:feedId:test'
    ];

    it('should create one topic', function (done) {
      TopicsManager.store(topicsToStore.topics).then(() => {
        cli.zcount({ key: RedisKeys.topicsListByClientId(clientId) }).then(count => {
          expect(count).to.equal(1);
          done();
        });
      });
    });

    it('should have created one topic', function (done) {
      cli.hgetall({ key: RedisKeys.topic(topicId) }).then(topicHash => {
        expect(topicHash).not.to.equal(null);
        done();
      });
    });

    it('should read one topic', function (done) {
      TopicsManager.get(null, [topicId]).then(topics => {
        expect(topics.length).to.equal(1);
        expect(topics).to.deep.have.members([topicsToBeStored]);
        done();
      });
    });

    it('should read one topics client_id', function (done) {
      cli.hget({ key: RedisKeys.topic(topicId), field: 'client_id' }).then(cId => {
        expect(cId).to.equal(String(clientId));
        done();
      });
    });

    it('should find a hash in redis', function (done) {
      cli.hgetall({ key: RedisKeys.topic(topicId) }).then(topicHash => {
        expect(topicHash).to.be.deep.equal(topicToBeStoredInRedis);
        done();
      });
    });

    it('should find one topic key in the list by clientId', function (done) {
      // check topic key in clientsList
      cli.zrangebyscore({ key: RedisKeys.topicsListByClientId(clientId), withscores: false }).then(members => {
        expect(members.length).to.equal(1);
        expect(members[0]).to.equal(`hmap:topic:topicId:${topicId}`);
        done();
      });
    });

    it('should find a list of feed keys in the list by topicId (1)', function (done) {
      // check feed key in topicList
      cli.zrangebyscore({ key: RedisKeys.feedsListByTopicId(topicId), withscores: false }).then(members => {
        expect(members.length).to.equal(feedListToBeStoredInRedis.length);
        feedListToBeStoredInRedis.forEach(feedKey => {
          expect(members).to.include(feedKey);
        });
        done();
      });
    });

    it('should find a list of feed keys in the list by topicId (2)', function (done) {
      // check feed key in topicList
      const dList = [];
      const expectedListofFeed = [
        {
          source: 'instagram',
          id: 'my-awesome-user',
          entity: 'result',
          languages: '',
          countries: ''
        },
        {
          source: 'instagram',
          id: 'test',
          entity: 'result',
          languages: '',
          countries: ''
        },
        {
          source: 'twitter',
          id: 'my-greatest-avatar',
          entity: 'result',
          languages: '',
          countries: ''
        },
        {
          source: 'twitter',
          id: 'test',
          entity: 'result',
          languages: '',
          countries: ''
        }
      ];
      feedListToBeStoredInRedis.forEach(key => {
        dList.push(cli.hgetall({ key }));
      });
      Promise.all(dList).then(results => {
        expect(results).to.deep.equal(expectedListofFeed);
        done();
      });
    });

    // Delete a topic

    it('should delete one topic', function (done) {
      TopicsManager.delete(topicId).then(() => {
        cli.hgetall({ key: RedisKeys.topic(topicId) }).then(topicHash => {
          expect(topicHash).to.equal(null);
          done();
        });
      });
    });

    it('should find no list of feed keys in the list by topicId', function (done) {
      cli.zcount({ key: RedisKeys.feedsListByTopicId(topicId) }).then(count => {
        expect(count).to.equal(0);
        done();
      });
    });

    it('should find all feeds with a status set to sleep', function (done) {
      const dList = [];
      feedListToBeStoredInRedis.forEach(key => {
        dList.push(cli.hget({ key, field: 'status' }));
      });
      Promise.all(dList).then(results => {
        results.forEach(function (result) {
          expect(result).to.equal('sleep');
        });
        done();
      });
    });

    it('should delete those feed keys', function (done) {
      const dList = [];
      feedListToBeStoredInRedis.forEach(key => {
        dList.push(cli.del({ key }));
      });
      Promise.all(dList).then(results => done());
    });

    it('should find no list of topic keys in the list by feedId', function (done) {
      const dList = [];
      feedListToBeStoredInRedis.forEach(key => {
        dList.push(cli.hgetall({ key }));
      });
      Promise.all(dList).then(results => {
        results.forEach(function (result) {
          expect(result).to.equal(null);
        });
        done();
      });
    });

    it('should find no topic keys in the list by clientId', function (done) {
      // check topic key in clientsList
      cli.zcount({ key: RedisKeys.topicsListByClientId(clientId) }).then(count => {
        expect(count).to.equal(0);
        done();
      });
    });

    after(function (done) {
      cli.zrangebyscore({ key: RedisKeys.deletedFeedsList(), withscores: false }).then(members => {
        const dList = [];
        members.forEach(key => {
          dList.push(cli.del({ key }));
        });
        Promise.all(dList).then(() => {
          cli.del({ key: RedisKeys.deletedFeedsList() });
          done();
        });
      });
    });
  });

  describe('Update a topic', function () {
    const topicId1 = '6a6a6a';
    const topicId11 = '6b6b4b';
    const topicId2 = '7c7c7c';
    const topicId3 = '8d8d8d';
    const clientId1 = '1e8e';
    const clientId2 = '2f4f';
    const clientId3 = '9a9a';
    const topics1ToStore = {
      topics: [
        {
          id: topicId1,
          name: 'Teletubbies',
          sources: ['googleplus'],
          client_id: clientId1,
          languages: [],
          countries: [],
          keywords: '("Tinky-Winky" AND "Dipsy")',
          or: [{ content: 'Tinky-Winky' }, { content: 'Dipsy' }]
        }
      ]
    };
    const topics11ToStore = {
      topics: [
        {
          id: topicId11,
          name: 'X-Men',
          sources: ['googleplus'],
          client_id: clientId1,
          languages: [],
          countries: [],
          keywords: '("Docter X" OR "Cyclope Cat")',
          or: [{ content: 'Docter X' }, { content: 'Cyclope' }]
        }
      ]
    };
    const topics3ToStore = {
      topics: [
        {
          id: topicId3,
          name: 'Copycat',
          sources: ['googleplus'],
          client_id: clientId3,
          languages: [],
          countries: [],
          keywords: '("Tinky-Winky" AND "Grumpy Cat")',
          and: [{ content: 'Tinky-Winky' }, { content: 'Grumpy Cat' }]
        }
      ]
    };
    const topics2ToStore = {
      topics: [
        {
          id: topicId2,
          name: 'Power Rangers',
          sources: ['googleplus'],
          client_id: clientId2,
          languages: [],
          countries: [],
          keywords: '(("Red Ranger" OR "Yellow Ranger" OR "Black Ranger") AND "Pink Ranger" ' + 'OR "Blue Ranger" OR "Green Ranger")',
          or: [
            { content: 'Red Ranger' },
            { content: 'Yellow Ranger' },
            { content: 'Black Ranger' },
            { content: 'Pink Ranger' },
            { content: 'Blue Ranger' },
            { content: 'Green Ranger' }
          ]
        }
      ]
    };
    const topic2expectedFeedsList = [
      'hmap:feed:feedSource:googleplus:feedId:Black Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Blue Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Green Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Pink Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Red Ranger',
      'hmap:feed:feedSource:googleplus:feedId:Yellow Ranger'
    ];
    const topics2ToUpdate = {
      topics: [
        {
          id: topicId2,
          name: 'Power Rangers',
          sources: ['googleplus'],
          client_id: clientId2,
          languages: [],
          countries: [],
          keywords:
            '(("Red Ranger" OR "Yellow Ranger" OR "Black Ranger") AND "Pink Ranger" ' +
            'OR "Blue Ranger" OR "Green Ranger" OR "Tinky-Winky")',
          or: [
            { content: 'Red Ranger' },
            { content: 'Yellow Ranger' },
            { content: 'Black Ranger' },
            { content: 'Pink Ranger' },
            { content: 'Blue Ranger' },
            { content: 'Tinky-Winky' }
          ]
        }
      ]
    };
    const topic1ToBeStoredInRedis = {
      id: topicId1,
      name: 'Teletubbies',
      sources: 'googleplus',
      client_id: String(clientId1),
      languages: '',
      countries: '',
      keywords: '("Tinky-Winky" AND "Dipsy")',
      or: '[{"content":"Tinky-Winky"},{"content":"Dipsy"}]',
      and: '[]',
      exclude: '[]',
      custom: '[]'
    };

    it('should create first topic', function (done) {
      TopicsManager.store(topics1ToStore.topics).then(() => {
        cli.zrangebyscore({ key: RedisKeys.topicsListByClientId(clientId1), withscores: false }).then(members => {
          expect(members.length).to.equal(1);
          expect(members).to.deep.equal([RedisKeys.topic(topicId1)]);
          done();
        });
      });
    });

    it('should have the stored topic', function (done) {
      cli.hgetall({ key: RedisKeys.topic(topicId1) }).then(topicHash => {
        expect(topicHash).to.deep.equal(topic1ToBeStoredInRedis);
        done();
      });
    });

    it('should create second topic', function (done) {
      TopicsManager.store(topics2ToStore.topics).then(() => {
        cli.zrangebyscore({ key: RedisKeys.topicsListByClientId(clientId2), withscores: false }).then(members => {
          expect(members.length).to.equal(1);
          expect(members).to.deep.equal([RedisKeys.topic(topicId2)]);
          done();
        });
      });
    });

    it('should check if the second topic is correctely linked to his feeds', function (done) {
      cli.zrangebyscore({ key: RedisKeys.feedsListByTopicId(topicId2), withscores: false }).then(members => {
        expect(members).to.deep.have.members(topic2expectedFeedsList);
        done();
      });
    });

    // add a keyword to second topic and check if that feed exists for second topic
    it('should add a cross-keyword to second topic', function (done) {
      TopicsManager.store(topics2ToUpdate.topics).then(() => {
        cli.zrangebyscore({ key: RedisKeys.topicsListByClientId(clientId2), withscores: false }).then(members => {
          expect(members.length).to.equal(1);
          expect(members).to.deep.equal([RedisKeys.topic(topicId2)]);
          done();
        });
      });
    });

    it('should check if the feed is connected to two topics', function (done) {
      cli.zrangebyscore({ key: RedisKeys.topicListByFeedIdSource('Tinky-Winky', 'googleplus'), withscores: false }).then(members => {
        expect(members.length).to.equal(2);
        expect(members).to.deep.equal([RedisKeys.topic(topicId1), RedisKeys.topic(topicId2)]);
        done();
      });
    });

    it('should check if the first topic is linked to this feed', function (done) {
      cli.zrangebyscore({ key: RedisKeys.feedsListByTopicId(topicId1), withscores: false }).then(members => {
        expect(members).to.include(RedisKeys.feed('Tinky-Winky', 'googleplus'));
        done();
      });
    });

    it('should check if the second topic is linked to this feed', function (done) {
      cli.zrangebyscore({ key: RedisKeys.feedsListByTopicId(topicId2), withscores: false }).then(members => {
        expect(members).to.include(RedisKeys.feed('Tinky-Winky', 'googleplus'));
        done();
      });
    });

    it('should add third topic to client 1', function (done) {
      TopicsManager.store(topics11ToStore.topics).then(() => {
        cli.zrangebyscore({ key: RedisKeys.topicsListByClientId(clientId1), withscores: false }).then(members => {
          expect(members.length).to.equal(2);
          expect(members).to.include(RedisKeys.topic(topicId11));
          done();
        });
      });
    });

    it('should add fourth topic to client 3', function (done) {
      TopicsManager.store(topics3ToStore.topics).then(() => {
        cli.zrangebyscore({ key: RedisKeys.topicsListByClientId(clientId3), withscores: false }).then(members => {
          expect(members.length).to.equal(1);
          expect(members).to.include(RedisKeys.topic(topicId3));
          done();
        });
      });
    });

    // Delete a topic

    it('should delete first topic', function (done) {
      TopicsManager.delete(topicId1).then(() => {
        cli.hgetall({ key: RedisKeys.topic(topicId1) }).then(topicHash => {
          expect(topicHash).to.equal(null);
          done();
        });
      });
    });

    it('should delete second topic', function (done) {
      TopicsManager.delete(topicId2).then(() => {
        cli.hgetall({ key: RedisKeys.topic(topicId2) }).then(topicHash => {
          expect(topicHash).to.equal(null);
          done();
        });
      });
    });

    it('should delete third topic', function (done) {
      TopicsManager.delete(topicId11).then(() => {
        cli.hgetall({ key: RedisKeys.topic(topicId11) }).then(topicHash => {
          expect(topicHash).to.equal(null);
          done();
        });
      });
    });

    it('should delete fourth topic', function (done) {
      TopicsManager.delete(topicId3).then(() => {
        cli.hgetall({ key: RedisKeys.topic(topicId3) }).then(topicHash => {
          expect(topicHash).to.equal(null);
          done();
        });
      });
    });

    after(function (done) {
      cli.zrangebyscore({ key: RedisKeys.deletedFeedsList(), withscores: false }).then(members => {
        const dList = [];
        members.forEach(key => {
          dList.push(cli.del({ key }));
        });
        Promise.all(dList).then(() => {
          cli.del({ key: RedisKeys.deletedFeedsList() }).then(() => done());
        });
      });
    });
  });
});
