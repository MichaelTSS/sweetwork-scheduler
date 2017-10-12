/* eslint-disable prefer-arrow-callback, global-require, no-unused-expressions */
const expect = require('chai').expect;
const request = require('supertest');

const config = require('../../app/config');
const RedisKeys = require('../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');
config.set('REDIS:db', 1); // 1 is the test db index
const cli = new RedisClient(config.get('REDIS:host'), config.get('REDIS:port'), config.get('REDIS:db'));

describe('POST Feeds', function () {
  let app;
  let bearerToken;
  const feedClientId = 1;
  const feedId = 'blastoise';
  const feedSource = 'instagram';
  const feedEntity = 'result';

  const errorFeedUpdateRecoveryFix = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1476801854, // October 18, 2016, 4:44:14 PM
    timestamp_to: 1476841454, // October 19, 2016, 3:44:14 AM
    num_results: 0,
    ticks: []
  };

  const errorFeedUpdatePartialFix = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1476801854, // October 18, 2016, 4:44:14 PM
    timestamp_to: 1478886254, // November 11, 2016, 6:44:14 PM
    num_results: 5,
    ticks: [1478335454000, 1477208654000, 1476863054000, 1476841454000],
    error: { name: 'Error', message: 'No more available accounts', clientId: 1 }
  };

  const errorFeedUpdateContinuation = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1476801854, // October 18, 2016, 4:44:14 PM
    timestamp_to: 1478792654, // November 10, 2016, 4:44:14 PM
    num_results: 0,
    ticks: [],
    error: { name: 'Error', message: 'No more available accounts', clientId: 1 }
  };

  const errorFeedUpdate = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1476801854, // October 18, 2016, 4:44:14 PM
    timestamp_to: 1478357054, // November 5, 2016, 4:44:14 PM
    num_results: 0,
    ticks: [],
    error: { name: 'Error', message: 'No more available accounts', clientId: 1 }
  };

  const regularFeedUpdate = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1470667454, // August 8, 2016, 4:44:14 PM
    timestamp_to: 1476715558, // October 10, 2016, 4:45:58 PM
    num_results: 4,
    ticks: [1474209854000, 1472913854000, 1472481854000, 1471704254000] // all those ticks are between timestamp_from and timestamp_to
  };

  before(function (done) {
    // runs before all tests in this block
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

  before(function (done) {
    const key = RedisKeys.feed(feedId, feedSource);
    cli
      .hmset({
        key,
        hash: {
          id: feedId,
          source: feedSource,
          entity: feedEntity,
          languages: '',
          countries: ''
        }
      })
      .then(() => done());
  });

  before(function (done) {
    // clear error ticks
    const key = RedisKeys.feedWarningTicks(feedClientId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  before(function (done) {
    // clear error ticks
    const key = RedisKeys.feedErrorTicks(feedClientId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  before(function (done) {
    // clear error ticks
    const key = RedisKeys.feedsList(feedId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  before(function (done) {
    // clear error plotbands
    const key = RedisKeys.feedErrorBands(feedId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  before(function (done) {
    // clear ticks
    const key = RedisKeys.feedTicks(feedId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  it(`GET /api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`, function (done) {
    request(app)
      .get(`/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`)
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

  it('POST /api/v1/feeds NORMAL feed update', function (done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(regularFeedUpdate)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function (e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics NORMAL feed update check', function (done) {
    request(app)
      .get(`/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`)
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function (err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [[1471644000000, 1], [1472421600000, 1], [1472853600000, 1], [1474149600000, 1]],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'idle',
            client_ids: []
          }
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1470667454000 // August 8
          }
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  it('POST /api/v1/feeds ERROR feed update', function (done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(errorFeedUpdate)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function (e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics ERROR feed update check', function (done) {
    request(app)
      .get(`/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`)
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function (err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [[1471644000000, 1], [1472421600000, 1], [1472853600000, 1], [1474149600000, 1]],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'errored',
            client_ids: []
          }
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1470667454000 // August 8
          },
          {
            status: 'error',
            from: 1476801854000, // October 18
            to: 1478357054000 // November 5
          }
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  it('POST /api/v1/feeds ERROR feed update continuation', function (done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(errorFeedUpdateContinuation)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function (e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics ERROR feed update continuation check', function (done) {
    request(app)
      .get(`/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`)
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function (err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [[1471644000000, 1], [1472421600000, 1], [1472853600000, 1], [1474149600000, 1]],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'errored',
            client_ids: []
          }
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1470667454000 // August 8
          },
          {
            status: 'error',
            from: 1476801854000, // October 18
            to: 1478792654000 // November 10
          }
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  it('POST /api/v1/feeds ERROR feed update partial fix', function (done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(errorFeedUpdatePartialFix)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function (e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics ERROR feed update partial fix check', function (done) {
    request(app)
      .get(`/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`)
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function (err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [
              [1471644000000, 1],
              [1472421600000, 1],
              [1472853600000, 1],
              [1474149600000, 1],
              [1476828000000, 2],
              [1477173600000, 1],
              [1478300400000, 1]
            ],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'errored',
            client_ids: []
          }
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1470667454000 // August 8
          },
          {
            status: 'error',
            from: 1476801854000, // October 18
            to: 1476841454000 // October 19
          }
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  it('POST /api/v1/feeds ERROR feed update recovery fix', function (done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(errorFeedUpdateRecoveryFix)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function (e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics ERROR feed update partial fix check', function (done) {
    request(app)
      .get(`/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`)
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function (err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [
              [1471644000000, 1],
              [1472421600000, 1],
              [1472853600000, 1],
              [1474149600000, 1],
              [1476828000000, 2],
              [1477173600000, 1],
              [1478300400000, 1]
            ],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'idle',
            client_ids: []
          }
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1470667454000 // August 8
          }
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  after(function (done) {
    const key = RedisKeys.feed(feedId, feedSource);
    cli.del({ key }).then(() => done());
  });

  after(function (done) {
    // clear error ticks
    const key = RedisKeys.feedWarningTicks(feedClientId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  after(function (done) {
    // clear error ticks
    const key = RedisKeys.feedErrorTicks(feedClientId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  after(function (done) {
    // clear error ticks
    const key = RedisKeys.feedsList(feedId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  after(function (done) {
    // clear error plotbands
    const key = RedisKeys.feedErrorBands(feedId, feedSource);
    cli.zrangebyscore({ key, withscores: false }).then(members => {
      if (members.length === 0) done();
      else {
        cli.zrem({ key, members }).then(() => done());
      }
    });
  });

  after(function (done) {
    // clear ticks
    const key1 = RedisKeys.feedTicks(feedId, feedSource);
    const key2 = RedisKeys.feedEfficiencyTicks(feedId, feedSource);
    const dList = [];
    dList.push(cli.del({ key: key1 }));
    dList.push(cli.del({ key: key2 }));
    Promise.all(dList).then(() => done());
  });

  after(function (done) {
    // clear feeds
    const key = RedisKeys.feedsList();
    cli.del({ key }).then(() => done());
  });

  describe('Clean Redis', function () {
    const key = RedisKeys.inboundRequestsByServiceName('mocha');
    before(function (done) {
      cli.del({ key }).then(() => done());
    });

    it('should have no keys', function (done) {
      cli.zrangebyscore({ key }).then(members => {
        expect(members).to.be.empty;
        done();
      });
    });
  });
});
