/* eslint-disable prefer-arrow-callback, global-require, no-unused-expressions, func-names, prefer-destructuring */
const expect = require('chai').expect;
const request = require('supertest');

const config = require('../../app/config');
const RedisKeys = require('../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');

config.set('REDIS:db', 1); // 1 is the test db index
config.set('MYSQL:database', 'sweetgcloudtest'); // sweetgcloudtest is the test database
const cli = new RedisClient(
  config.get('REDIS:host'),
  config.get('REDIS:port'),
  config.get('REDIS:db'),
);
// import that after config is changed
const ProjectsManager = require('../../app/models/sql/projects-manager');

describe('REST Topics', function() {
  this.timeout(5000); // instead of the default 2000
  let app;
  let bearerToken;
  let projectId;
  let topicId;
  const project = {
    name: 'test--project',
  };

  const pokemonTopicHash = {
    name: 'Pokemon',
    words: ['charizard', 'blastoise'],
    accounts: [
      {
        id: '96879107',
        source: 'twitter',
      },
      {
        id: '2324671124',
        source: 'twitter',
      },
      {
        id: '499943',
        source: 'instagram',
      },
      {
        id: '2188884939',
        source: 'instagram',
      },
    ],
    sources: ['twitter', 'instagram'],
  };

  const storedPokemonTopicHash = {
    name: 'Pokemon',
    words: ['charizard', 'blastoise'],
    accounts: [
      {
        id: '96879107',
        source: 'twitter',
      },
      {
        id: '2324671124',
        source: 'twitter',
      },
      {
        id: '499943',
        source: 'instagram',
      },
      {
        id: '2188884939',
        source: 'instagram',
      },
    ],
    sources: ['twitter', 'instagram'],
    feeds: [
      {
        source: 'instagram',
        id: '2188884939',
        entity: 'author',
        status: 'sleep',
      },
      {
        source: 'instagram',
        id: '499943',
        entity: 'author',
        status: 'sleep',
      },
      {
        source: 'instagram',
        id: 'blastoise',
        entity: 'result',
        status: 'sleep',
      },
      {
        source: 'instagram',
        id: 'charizard',
        entity: 'result',
        status: 'sleep',
      },
      {
        source: 'twitter',
        id: '2324671124',
        entity: 'author',
        status: 'sleep',
      },
      {
        source: 'twitter',
        id: '96879107',
        entity: 'author',
        status: 'sleep',
      },
      {
        source: 'twitter',
        id: 'blastoise',
        entity: 'result',
        status: 'sleep',
      },
      {
        source: 'twitter',
        id: 'charizard',
        entity: 'result',
        status: 'sleep',
      },
    ],
  };

  before(async () => {
    const result = await ProjectsManager.create(project);
    projectId = result.id;
    pokemonTopicHash.projectId = projectId;
    storedPokemonTopicHash.projectId = projectId;
  });

  before(function(done) {
    app = require('../../app/');
    request(app)
      .post('/auth')
      .send({
        service: 'mocha',
        passphrase: config.get('SVC_SCHEDULER:jwt_passphrase'),
      })
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '156')
      .expect(200)
      .end(function(err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.token).to.be.ok;
        bearerToken = `Bearer ${res.body.token}`;
        done();
      });
  });

  describe('GET Topics', function() {
    it('GET /api/v1/topics', function(done) {
      request(app)
        .get('/api/v1/topics')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '212')
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body.error.name).to.equal('TopicsManagerError');
          expect(res.body.error.message).to.equal(
            'Missing parameters: projectId or topicIds',
          );
          done();
        });
    });

    it('GET /api/v1/topics?client_id=1', function(done) {
      request(app)
        .get('/api/v1/topics?client_id=1')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '147')
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          expect(res.body.topics).to.be.empty;
          expect(res.body.meta.num_topics).to.equal(0);
          done();
        });
    });

    it('GET /api/v1/topics?topic_ids=1', function(done) {
      request(app)
        .get('/api/v1/topics?topic_ids=1')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '147')
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          expect(res.body.topics).to.be.empty;
          expect(res.body.meta.num_topics).to.equal(0);
          done();
        });
    });

    it('GET /api/v1/metrics', function(done) {
      request(app)
        .get('/api/v1/metrics')
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '1025')
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          expect(res.body.metrics.series).to.be.empty;
          expect(res.body.metrics.plotBands).to.be.empty;
          expect(res.body.metrics.plotLines).to.be.empty;
          done();
        });
    });
  });

  describe('POST Topics', function() {
    it('POST /api/v1/topics', function(done) {
      request(app)
        .post('/api/v1/topics')
        .set('Authorization', bearerToken)
        .send({ topics: [pokemonTopicHash] })
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '31')
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          done();
        });
    });

    it('GET /api/v1/topics?client_id="projectId"', function(done) {
      request(app)
        .get(`/api/v1/topics?client_id=${projectId}`)
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '973')
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          expect(res.body.topics.length).to.equal(1);
          expect(res.body.topics[0].id).to.not.be.undefined;
          topicId = res.body.topics[0].id;
          expect(res.body.topics[0].name).to.equal(storedPokemonTopicHash.name);
          console.log(JSON.stringify(res.body.topics[0].feeds));
          console.log(JSON.stringify(storedPokemonTopicHash.feeds));
          expect(res.body.topics[0].feeds).to.deep.have.members(
            storedPokemonTopicHash.feeds,
          );
          expect(res.body.topics[0].accounts).to.deep.have.members(
            storedPokemonTopicHash.accounts,
          );
          expect(res.body.topics[0].sources).to.deep.have.members(
            storedPokemonTopicHash.sources,
          );
          expect(res.body.meta.num_topics).to.equal(1);
          done();
        });
    });
  });

  describe('DELETE Topics', function() {
    it('POST /api/v1/topics', function(done) {
      request(app)
        .delete(`/api/v1/topics/${topicId}`)
        .set('Authorization', bearerToken)
        .expect('Content-Type', /json/)
        // .expect('Content-Length', '16')
        .expect(200)
        .end(function(err, res) {
          if (err) throw err;
          expect(res.body.success).to.equal(true);
          done();
        });
    });

    it('should clear all feeds stored in spite of being deleted', async () => {
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
      await cli.zrem({ key, members });
      const count = await cli.zcount({ key });
      expect(count).to.equal(0);
    });
  });

  after(async () => {
    const feedsListKey = RedisKeys.feedsList();
    const dList = [];
    const members = await cli.zrangebyscore({
      key: feedsListKey,
      withscores: false,
    });
    members.forEach(key => {
      dList.push(cli.del({ key }));
    });
    await cli.del({ key: feedsListKey });
    await Promise.all(dList);
  });

  after(async () => {
    const key = RedisKeys.deletedFeedsList();
    await cli.del({ key });
  });

  after(async () => {
    const key = RedisKeys.topicsListByClientId(1);
    await cli.del({ key });
  });

  after(async () => {
    const key = RedisKeys.inboundRequestsByServiceName('mocha');
    await cli.del({ key });
  });

  after(async () => {
    const topicsListKey = RedisKeys.feedsListByTopicId(topicId);
    const dList = [];
    const members = await cli.zrangebyscore({
      key: topicsListKey,
      withscores: false,
    });
    members.forEach(key => {
      dList.push(cli.del({ key }));
    });
    await cli.del({ key: topicsListKey });
    await cli.del({ key: RedisKeys.topic(topicId) });
    await Promise.all(dList);
  });

  after(async () => {
    await ProjectsManager.delete(projectId);
  });
});
