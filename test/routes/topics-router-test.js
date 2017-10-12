/* eslint-disable prefer-arrow-callback, global-require, no-unused-expressions */
const expect = require('chai').expect;
const request = require('supertest');

const config = require('../../app/config');
const RedisKeys = require('../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');
config.set('REDIS:db', 1); // 1 is the test db index
const cli = new RedisClient(config.get('REDIS:host'), config.get('REDIS:port'), config.get('REDIS:db'));

describe('REST Topics', function () {
  let app;
  let bearerToken;

  const pokemonTopicHash = {
    id: 'a3c50ef',
    name: 'Pokemon',
    or: [
      {
        content: 'charizard'
      },
      {
        content: 'blastoise'
      }
    ],
    included_profiles: [
      {
        accounts: [
          {
            id: 96879107,
            network: 'twitter'
          },
          {
            id: 2324671124,
            network: 'twitter'
          },
          {
            id: 499943,
            network: 'instagram'
          },
          {
            id: 2188884939,
            network: 'instagram'
          }
        ]
      }
    ],
    sources: ['twitter', 'instagram'],
    client_id: 1,
    languages: [],
    countries: []
  };

  const storedPokemonTopicHash = {
    id: 'a3c50ef',
    name: 'Pokemon',
    sources: ['twitter', 'instagram'],
    client_id: 1,
    languages: [],
    countries: [],
    or: [{ content: 'charizard' }, { content: 'blastoise' }],
    and: [],
    exclude: [],
    custom: [],
    included_profiles: [
      {
        rss: [],
        accounts: [
          {
            network: 'twitter'
          },
          {
            network: 'twitter'
          },
          {
            network: 'instagram'
          },
          {
            network: 'instagram'
          }
        ]
      }
    ],
    feeds: [
      {
        source: 'instagram',
        id: '2188884939',
        entity: 'author',
        languages: [],
        countries: []
      },
      {
        source: 'instagram',
        id: '499943',
        entity: 'author',
        languages: [],
        countries: []
      },
      {
        source: 'instagram',
        id: 'blastoise',
        entity: 'result',
        languages: [],
        countries: []
      },
      {
        source: 'instagram',
        id: 'charizard',
        entity: 'result',
        languages: [],
        countries: []
      },
      {
        source: 'twitter',
        id: '2324671124',
        entity: 'author',
        languages: [],
        countries: []
      },
      {
        source: 'twitter',
        id: '96879107',
        entity: 'author',
        languages: [],
        countries: []
      },
      {
        source: 'twitter',
        id: 'blastoise',
        entity: 'result',
        languages: [],
        countries: []
      },
      {
        source: 'twitter',
        id: 'charizard',
        entity: 'result',
        languages: [],
        countries: []
      }
    ]
  };

  before(function (done) {
    app = require('../../app/');
    request(app)
      .post('/auth')
      .send({
        service: 'mocha',
        passphrase: config.get('SVC_SCHEDULER:jwt_passphrase')
      })
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '156')
      .expect(200)
      .end(function (err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.token).to.be.ok;
        bearerToken = `Bearer ${res.body.token}`;
        done();
      });
  });

  describe('GET Topics', function () {
    it('GET /api/v1/topics', function (done) {
      request(app)
        .get('/api/v1/topics')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '212')
        .expect(200)
        .end(function (err, res) {
          if (err) throw err;
          expect(res.body.error.name).to.equal('TopicsManagerError');
          expect(res.body.error.message).to.equal('Missing parameters: clientId or topicIds');
          done();
        });
    });

    it('GET /api/v1/topics?client_id=1', function (done) {
      request(app)
        .get('/api/v1/topics?client_id=1')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '147')
        .expect(200)
        .end(function (err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          expect(res.body.topics).to.be.empty;
          expect(res.body.meta.num_topics).to.equal(0);
          done();
        });
    });

    it('GET /api/v1/topics?topic_ids=1', function (done) {
      request(app)
        .get('/api/v1/topics?topic_ids=1')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '147')
        .expect(200)
        .end(function (err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          expect(res.body.topics).to.be.empty;
          expect(res.body.meta.num_topics).to.equal(0);
          done();
        });
    });

    it('GET /api/v1/metrics', function (done) {
      request(app)
        .get('/api/v1/metrics')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '1025')
        .expect(200)
        .end(function (err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          expect(res.body.metrics.series).to.be.empty;
          expect(res.body.metrics.plotBands).to.be.empty;
          expect(res.body.metrics.plotLines).to.be.empty;
          done();
        });
    });
  });

  describe('POST Topics', function () {
    it('POST /api/v1/topics', function (done) {
      request(app)
        .post('/api/v1/topics')
        .set('Authorization', bearerToken)
        .send({ topics: [pokemonTopicHash] })
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '31')
        .expect(200)
        .end(function (err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          done();
        });
    });

    it('GET /api/v1/topics?client_id=1', function (done) {
      request(app)
        .get('/api/v1/topics?client_id=1')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '973')
        .expect(200)
        .end(function (err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          expect(res.body.topics.length).to.equal(1);
          expect(res.body.topics).to.deep.have.members([storedPokemonTopicHash]);
          expect(res.body.meta.num_topics).to.equal(1);
          done();
        });
    });
  });

  describe('DELETE Topics', function () {
    const pokemonTopicId = 3;

    it('POST /api/v1/topics', function (done) {
      request(app)
        .delete(`/api/v1/topics/${pokemonTopicId}`)
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '16')
        .expect(200)
        .end(function (err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          done();
        });
    });

    it('should clear all feeds stored in spite of being deleted', function (done) {
      const key = RedisKeys.deletedFeedsList();
      const members = [];
      storedPokemonTopicHash.feeds.forEach(feed => {
        const k1 = RedisKeys.feed(feed.id, feed.source);
        const k2 = RedisKeys.topicListByFeedIdSource(feed.id, feed.source);
        cli.del({ key: k1 });
        cli.del({ key: k2 });
        members.push(k1);
        members.push(k2);
      });
      cli.zrem({ key, members }).then(() => {
        cli.zcount({ key }).then(count => {
          expect(count).to.equal(0);
          done();
        });
      });
    });

    after(function (done) {
      const feedsListKey = RedisKeys.feedsList();
      // cli.del({ key }).then(() => done());
      const dList = [];
      cli.zrangebyscore({ key: feedsListKey, withscores: false }).then(members => {
        members.forEach(key => {
          dList.push(cli.del({ key }));
        });
        dList.push(cli.del({ key: feedsListKey }));
        Promise.all(dList).then(() => done());
      });
    });

    after(function (done) {
      const key = RedisKeys.deletedFeedsList();
      cli.del({ key }).then(() => done());
    });

    after(function (done) {
      const key = RedisKeys.topicsListByClientId(1);
      cli.del({ key }).then(() => done());
    });

    after(function (done) {
      const key = RedisKeys.inboundRequestsByServiceName('mocha');
      cli.del({ key }).then(() => done());
    });

    after(function (done) {
      const topicsListKey = RedisKeys.feedsListByTopicId('a3c50ef');
      const dList = [];
      cli.zrangebyscore({ key: topicsListKey, withscores: false }).then(members => {
        members.forEach(key => {
          dList.push(cli.del({ key }));
        });
        dList.push(cli.del({ key: topicsListKey }));
        dList.push(cli.del({ key: RedisKeys.topic('a3c50ef') }));
        Promise.all(dList).then(() => done());
      });
    });
  });
});
