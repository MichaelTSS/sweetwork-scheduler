/* eslint-disable prefer-arrow-callback, no-unused-expressions,  no-param-reassign */
const expect = require('chai').expect;

const config = require('../../../app/config');
const RedisKeys = require('../../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');
config.set('REDIS:db', 1); // 1 is the test db index
const cli = new RedisClient(config.get('REDIS:host'), config.get('REDIS:port'), config.get('REDIS:db'));
const TopicsManager = require('../../../app/models/redis/topics-manager');
const FeedsManager = require('../../../app/models/redis/feeds-manager');

describe('FeedsManager', function () {
  const topicId = 5678901234567890;
  const secondTopicId = 8701915463476;
  const clientId = 123987456876123;
  const topicsToStore = {
    topics: [
      {
        id: topicId,
        name: 'test--name',
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
        and: []
      }
    ]
  };
  const moreTopicsToStore = {
    topics: [
      {
        id: secondTopicId,
        name: 'test--second-name',
        included_profiles: [],
        sources: ['googleplus'],
        client_id: clientId,
        languages: [],
        countries: [],
        or: [],
        and: [{ content: 'python' }, { content: 'cobra' }]
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
  const feedTopicsKeysList = [
    'zset:topicsList:feedSource:instagram:feedId:12394867:timestamp',
    'zset:topicsList:feedSource:googleplus:feedId:cobra:timestamp',
    'zset:topicsList:feedSource:instagram:feedId:2349687:timestamp',
    'zset:topicsList:feedSource:googleplus:feedId:boa:timestamp',
    'zset:topicsList:feedSource:instagram:feedId:boa:timestamp',
    'zset:topicsList:feedSource:googleplus:feedId:arbok:timestamp',
    'zset:topicsList:feedSource:instagram:feedId:arbok:timestamp',
    'zset:topicsList:feedSource:instagram:feedId:python:timestamp'
  ];
  const expectedListofFeed = [
    {
      source: 'instagram',
      id: 'arbok',
      entity: 'result',
      languages: '',
      countries: ''
    },
    {
      source: 'instagram',
      id: 'boa',
      entity: 'result',
      languages: '',
      countries: ''
    },
    {
      source: 'instagram',
      id: 'python',
      entity: 'result',
      languages: '',
      countries: ''
    },
    {
      source: 'instagram',
      id: '12394867',
      entity: 'author',
      languages: '',
      countries: ''
    },
    {
      source: 'instagram',
      id: '2349687',
      entity: 'author',
      languages: '',
      countries: ''
    },
    {
      source: 'googleplus',
      id: 'arbok',
      entity: 'result',
      languages: '',
      countries: ''
    },
    {
      source: 'googleplus',
      id: 'boa',
      entity: 'result',
      languages: '',
      countries: ''
    },
    {
      source: 'googleplus',
      id: 'python',
      entity: 'result',
      languages: '',
      countries: ''
    }
  ];
  const topicsListByFeedPair = RedisKeys.topicListByFeedIdSource('python', 'googleplus');

  describe('Empty and failures', function () {
    before(function (done) {
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

    before(function (done) {
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

    before(function (done) {
      // common feeds
      const dList = [
        cli.del({ key: RedisKeys.feedsList() }),
        cli.del({ key: RedisKeys.topicsListByClientId(clientId) }),
        cli.del({ key: RedisKeys.topicListByFeedIdSource('python', 'googleplus') })
      ];
      Promise.all(dList).then(() => done());
    });

    it('should find no feeds for a non-existing topic_id', function (done) {
      const feedsManager = new FeedsManager(topicsToStore);
      const key = RedisKeys.feedsListByTopicId(topicId);
      feedsManager.read().then(feeds => {
        expect(feeds).to.be.empty;
        cli.zcount({ key }).then(count => {
          expect(count)
            .to.a('number')
            .equal(0);
          done();
        });
      });
    });

    it('should find no feeds in global feeds list', function (done) {
      cli.zcount({ key: RedisKeys.feedsList() }).then(count => {
        expect(count)
          .to.a('number')
          .equal(0);
        done();
      });
    });

    it('should find no topics for a non-existing topic_id', function (done) {
      TopicsManager.get(null, [topicId]).then(topics => {
        expect(topics).to.be.empty;
        cli.hgetall({ key: RedisKeys.topic(topicId) }).then(topicHash => {
          expect(topicHash).to.equal(null);
          done();
        });
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
      const dList = [cli.del({ key: RedisKeys.feedsList() }), cli.del({ key: RedisKeys.topicsListByClientId(clientId) })];
      feedTopicsKeysList.forEach(key => {
        dList.push(cli.del({ key }));
      });
      Promise.all(dList).then(() => done());
    });
  });

  describe('Create initial topic', function () {
    before(function (done) {
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

    before(function (done) {
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

    before(function (done) {
      // common feeds
      const dList = [
        cli.del({ key: RedisKeys.feedsList() }),
        cli.del({ key: RedisKeys.topicsListByClientId(clientId) }),
        cli.del({ key: RedisKeys.topicListByFeedIdSource('python', 'googleplus') })
      ];
      Promise.all(dList).then(() => done());
    });

    it('should create one topic', function (done) {
      TopicsManager.store(topicsToStore.topics).then(() => {
        cli.zcount({ key: RedisKeys.topicsListByClientId(clientId) }).then(count => {
          expect(count).to.equal(1);
          done();
        });
      });
    });

    it('should find a list of feed keys in global feeds list', function (done) {
      cli.zrangebyscore({ key: RedisKeys.feedsList(), withscores: false }).then(members => {
        expect(members).to.deep.have.members(feedListToBeStoredInRedis);
        done();
      });
    });

    it('should find a list of feed keys in the list by topicId (1)', function (done) {
      cli.zrangebyscore({ key: RedisKeys.feedsListByTopicId(topicId), withscores: false }).then(members => {
        expect(members).to.deep.have.members(feedListToBeStoredInRedis);
        done();
      });
    });

    it('should find a list of feed keys in the list by topicId (2)', function (done) {
      const dList = [];
      feedListToBeStoredInRedis.forEach(key => {
        dList.push(cli.hgetall({ key }));
      });
      Promise.all(dList).then(results => {
        expect(results).to.deep.have.members(expectedListofFeed);
        done();
      });
    });

    it('should find list of related topics for a given feed_id/source pair', function (done) {
      cli.zrangebyscore({ key: topicsListByFeedPair, withscores: false }).then(members => {
        expect(members.length).to.equal(1);
        expect(members).to.deep.have.members([RedisKeys.topic(topicId)]);
        done();
      });
    });

    it('should create another topic with some shared feed pairs', function (done) {
      TopicsManager.store(moreTopicsToStore.topics).then(() => {
        cli.zcount({ key: RedisKeys.topicsListByClientId(clientId) }).then(count => {
          expect(count).to.equal(2);
          done();
        });
      });
    });

    it('should have an updated count of feed keys in global feedsList Zset', function (done) {
      cli.zrangebyscore({ key: topicsListByFeedPair, withscores: false }).then(members => {
        expect(members.length).to.equal(2);
        expect(members).to.deep.have.members([RedisKeys.topic(topicId), RedisKeys.topic(secondTopicId)]);
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
        cli.del({ key: RedisKeys.topicsListByClientId(clientId) }),
        cli.del({ key: 'zset:topicsList:feedSource:googleplus:feedId:python:timestamp' })
      ];
      feedTopicsKeysList.forEach(key => {
        dList.push(cli.del({ key }));
      });
      Promise.all(dList).then(() => done());
    });
  });
});
