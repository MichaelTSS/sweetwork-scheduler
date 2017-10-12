/* eslint-disable prefer-arrow-callback, no-unused-expressions,  no-param-reassign */
const expect = require('chai').expect;

const config = require('../../../app/config');
const RedisKeys = require('../../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');
config.set('REDIS:db', 1); // 1 is the test db index
const cli = new RedisClient(config.get('REDIS:host'), config.get('REDIS:port'), config.get('REDIS:db'));
const TopicsManager = require('../../../app/models/redis/topics-manager');

describe('FeedsManager', function () {
  const topicId = 5678901234567890;
  const secondTopicId = 8701915463476;
  const clientId = 123987456876123;
  const topicsToStore = {
    topics: [
      {
        id: topicId,
        name: 'test--name',
        excluded_profiles: [],
        restricted_profiles: [],
        included_profiles: [
          {
            accounts: [
              {
                id: 12394867,
                network: 'instagram'
              }
            ]
          },
          {
            accounts: [
              {
                id: 2349687,
                network: 'instagram'
              }
            ]
          }
        ],
        sources: ['instagram', 'googleplus'],
        client_id: clientId,
        languages: [],
        countries: [],
        or: [{ content: 'boa' }, { content: 'python' }, { content: 'arbok' }],
        and: [],
        exclude: []
      }
    ]
  };
  const moreTopicsToStore = {
    topics: [
      {
        id: secondTopicId,
        name: 'test--second-name',
        excluded_profiles: [],
        restricted_profiles: [],
        included_profiles: [],
        sources: ['googleplus'],
        client_id: clientId,
        languages: [],
        countries: [],
        or: [],
        and: [{ content: 'python' }, { content: 'cobra' }],
        exclude: []
      }
    ]
  };
  const feedListToBeStoredInRedis = [
    'hmap:feed:feedSource:instagram:feedId:arbok',
    'hmap:feed:feedSource:instagram:feedId:boa',
    'hmap:feed:feedSource:instagram:feedId:python',
    'hmap:feed:feedSource:instagram:feedId:12394867',
    'hmap:feed:feedSource:instagram:feedId:2349687',
    'hmap:feed:feedSource:googleplus:feedId:arbok',
    'hmap:feed:feedSource:googleplus:feedId:boa',
    'hmap:feed:feedSource:googleplus:feedId:python'
  ];

  describe('Delete first topic when the second shares feeds', function () {
    const topicListKeys = [
      'zset:topicsList:feedSource:googleplus:feedId:python:timestamp',
      'zset:topicsList:feedSource:googleplus:feedId:cobra:timestamp'
    ];
    const firstTopicFeedKeys = [
      'hmap:feed:feedSource:googleplus:feedId:arbok',
      'hmap:feed:feedSource:googleplus:feedId:boa',
      'hmap:feed:feedSource:instagram:feedId:12394867',
      'hmap:feed:feedSource:instagram:feedId:2349687',
      'hmap:feed:feedSource:instagram:feedId:arbok',
      'hmap:feed:feedSource:instagram:feedId:boa',
      'hmap:feed:feedSource:instagram:feedId:python'
    ];
    const secondTopicFeedKeys = ['hmap:feed:feedSource:googleplus:feedId:cobra', 'hmap:feed:feedSource:googleplus:feedId:python'];
    before(function (done) {
      // topicId
      TopicsManager.store(topicsToStore.topics).then(() => {
        cli.zcount({ key: RedisKeys.topicsListByClientId(clientId) }).then(() => {
          cli.zrangebyscore({ key: RedisKeys.feedsListByTopicId(topicId), withscores: false }).then(members => {
            expect(members).to.deep.have.members(feedListToBeStoredInRedis);
            done();
          });
        });
      });
    });

    before(function (done) {
      // secondTopicId
      TopicsManager.store(moreTopicsToStore.topics).then(() => {
        cli.zcount({ key: RedisKeys.topicsListByClientId(clientId) }).then(() => {
          cli.zrangebyscore({ key: RedisKeys.feedsListByTopicId(secondTopicId), withscores: false }).then(members => {
            expect(members).to.deep.have.members(secondTopicFeedKeys);
            done();
          });
        });
      });
    });

    it('should find two topics for the first feed (A1)', function (done) {
      cli.zcount({ key: topicListKeys[0], withscores: false }).then(count => {
        expect(count).to.equal(2);
        done();
      });
    });

    it('should find one topic for the second feed (B1)', function (done) {
      cli.zcount({ key: topicListKeys[1], withscores: false }).then(count => {
        expect(count).to.equal(1);
        done();
      });
    });

    it('should delete the first topic', function (done) {
      TopicsManager.delete(topicId).then(() => {
        cli.zcount({ key: RedisKeys.topicsListByClientId(clientId) }).then(count => {
          expect(count).to.equal(1);
          done();
        });
      });
    });

    it('should find a list of 2 feed keys in global feedsList', function (done) {
      cli.zrangebyscore({ key: RedisKeys.feedsList(), withscores: false }).then(members => {
        expect(members.length).to.equal(2);
        expect(members).to.deep.have.members(secondTopicFeedKeys);
        done();
      });
    });

    it('should find a list of 5 feed keys in deletedFeedsList', function (done) {
      cli.zrangebyscore({ key: RedisKeys.deletedFeedsList(), withscores: false }).then(members => {
        expect(members.length).to.equal(7);
        expect(members).to.deep.have.members(firstTopicFeedKeys);
        done();
      });
    });

    it('should find two topics for the first feed (A2)', function (done) {
      cli.zcount({ key: topicListKeys[0], withscores: false }).then(count => {
        expect(count).to.equal(1);
        done();
      });
    });

    it('should find one topic for the second feed (B2)', function (done) {
      cli.zcount({ key: topicListKeys[1], withscores: false }).then(count => {
        expect(count).to.equal(1);
        done();
      });
    });

    after(function (done) {
      // topicId
      const key = RedisKeys.feedsListByTopicId(topicId);
      cli.zrangebyscore({ key, withscores: false }).then(members => {
        const dList = [];
        members.forEach(feedKey => {
          dList.push(cli.del({ key: feedKey }));
        });
        dList.push(cli.del({ key: RedisKeys.topic(topicId) }));
        dList.push(cli.del({ key }));
        Promise.all(dList).then(() => done());
      });
    });

    after(function (done) {
      // secondTopicId
      const key = RedisKeys.feedsListByTopicId(secondTopicId);
      cli.zrangebyscore({ key, withscores: false }).then(members => {
        const dList = [];
        members.forEach(feedKey => {
          dList.push(cli.del({ key: feedKey }));
        });
        dList.push(cli.del({ key: RedisKeys.topic(secondTopicId) }));
        dList.push(cli.del({ key }));
        Promise.all(dList).then(() => done());
      });
    });

    after(function (done) {
      // common feeds
      const dList = [
        cli.del({ key: RedisKeys.feedsList() }),
        cli.del({ key: RedisKeys.deletedFeedsList() }),
        cli.del({ key: RedisKeys.topicsListByClientId(clientId) })
      ];
      feedListToBeStoredInRedis.forEach(key => {
        dList.push(cli.del({ key }));
      });
      topicListKeys.forEach(key => {
        dList.push(cli.del({ key }));
      });
      Promise.all(dList).then(() => done());
    });
  });
});
