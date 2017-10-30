/* eslint-disable prefer-arrow-callback, no-unused-expressions, no-param-reassign, func-names, prefer-destructuring */
const expect = require('chai').expect;
const _ = require('lodash');

const config = require('../../../app/config');
const RedisKeys = require('../../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');

config.set('REDIS:db', 1); // 1 is the test db index
const cli = new RedisClient(
  config.get('REDIS:host'),
  config.get('REDIS:port'),
  config.get('REDIS:db'),
);
const TopicsManager = require('../../../app/models/redis/topics-manager');

describe('FeedsManager', function() {
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
                network: 'instagram',
              },
            ],
          },
          {
            accounts: [
              {
                id: 2349687,
                network: 'instagram',
              },
            ],
          },
        ],
        sources: ['instagram', 'googleplus'],
        client_id: clientId,
        languages: [],
        countries: [],
        or: [{ content: 'boa' }, { content: 'python' }, { content: 'arbok' }],
        and: [],
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
  const expectedListofFeed = [
    {
      source: 'instagram',
      id: 'arbok',
      entity: 'result',
      languages: '',
      countries: '',
    },
    {
      source: 'instagram',
      id: 'boa',
      entity: 'result',
      languages: '',
      countries: '',
    },
    {
      source: 'instagram',
      id: 'python',
      entity: 'result',
      languages: '',
      countries: '',
    },
    {
      source: 'instagram',
      id: '12394867',
      entity: 'author',
      languages: '',
      countries: '',
    },
    {
      source: 'instagram',
      id: '2349687',
      entity: 'author',
      languages: '',
      countries: '',
    },
    {
      source: 'googleplus',
      id: 'arbok',
      entity: 'result',
      languages: '',
      countries: '',
    },
    {
      source: 'googleplus',
      id: 'boa',
      entity: 'result',
      languages: '',
      countries: '',
    },
    {
      source: 'googleplus',
      id: 'python',
      entity: 'result',
      languages: '',
      countries: '',
    },
  ];

  describe('Delete one topic', function() {
    before(function(done) {
      // topicId
      TopicsManager.store(topicsToStore.topics).then(() => {
        cli
          .zcount({ key: RedisKeys.topicsListByClientId(clientId) })
          .then(() => {
            cli
              .zrangebyscore({
                key: RedisKeys.feedsListByTopicId(topicId),
                withscores: false,
              })
              .then(members => {
                expect(members).to.deep.have.members(feedListToBeStoredInRedis);
                done();
              });
          });
      });
    });

    before(function(done) {
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

    it('should delete the first topic', function(done) {
      TopicsManager.delete(topicId).then(() => {
        cli
          .zcount({ key: RedisKeys.topicsListByClientId(clientId) })
          .then(count => {
            expect(count).to.equal(0);
            done();
          });
      });
    });

    it('should find an empty list of feed keys in global feedsList', function(
      done,
    ) {
      cli
        .zrangebyscore({ key: RedisKeys.feedsList(), withscores: false })
        .then(members => {
          expect(members).to.be.empty;
          done();
        });
    });

    it('should find the list of feed keys in deletedFeedsList', function(done) {
      cli
        .zrangebyscore({ key: RedisKeys.deletedFeedsList(), withscores: false })
        .then(members => {
          expect(members.length).to.equal(8);
          expect(members).to.deep.have.members(feedListToBeStoredInRedis);
          done();
        });
    });

    it('should find no list of feed keys in the list by topicId', function(
      done,
    ) {
      cli.zcount({ key: RedisKeys.feedsListByTopicId(topicId) }).then(count => {
        expect(count).to.equal(0);
        done();
      });
    });

    it('should find no list of feed keys in the list by secondTopicId', function(
      done,
    ) {
      cli
        .zcount({ key: RedisKeys.feedsListByTopicId(secondTopicId) })
        .then(count => {
          expect(count).to.equal(0);
          done();
        });
    });

    it('should find no sleeping feed hashes in Redis', function(done) {
      const dList = [];
      feedListToBeStoredInRedis.forEach(key => {
        dList.push(cli.hgetall({ key }));
      });
      Promise.all(dList).then(results => {
        const sleepingFeedHashes = _.transform(
          expectedListofFeed,
          (result, feed) => {
            feed.status = 'sleep';
            result.push(feed);
          },
          [],
        );
        expect(results).to.deep.have.members(sleepingFeedHashes);
        done();
      });
    });

    after(function(done) {
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

    after(function(done) {
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

    after(function(done) {
      // common feeds
      const dList = [
        cli.del({ key: RedisKeys.feedsList() }),
        cli.del({ key: RedisKeys.deletedFeedsList() }),
        cli.del({ key: RedisKeys.topicsListByClientId(clientId) }),
      ];
      feedListToBeStoredInRedis.forEach(key => {
        dList.push(cli.del({ key }));
      });
      Promise.all(dList).then(() => done());
    });
  });
});
