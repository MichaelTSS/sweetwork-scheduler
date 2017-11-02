/* eslint-disable prefer-arrow-callback, global-require, no-unused-expressions, func-names, prefer-destructuring */
const expect = require('chai').expect;
const request = require('supertest');

const config = require('../../app/config');
const RedisKeys = require('../../app/redis-keys');
const RedisClient = require('sweetwork-redis-client');

config.set('REDIS:db', 1); // 1 is the test db index
const cli = new RedisClient(
  config.get('REDIS:host'),
  config.get('REDIS:port'),
  config.get('REDIS:db'),
);

describe('POST Feeds', function() {
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
    timestamp_from: 1506801854, // October 18, 2016, 4:44:14 PM
    timestamp_to: 1506841454, // October 19, 2016, 3:44:14 AM
    num_results: 0,
    ticks: [],
  };

  const errorFeedUpdatePartialFix = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1506801854, // October 18, 2016, 4:44:14 PM
    timestamp_to: 1508886254, // November 11, 2016, 6:44:14 PM
    num_results: 5,
    ticks: [1508335454000, 1507208654000, 1506863054000, 1506841454000],
    error: {
      name: 'Error',
      message: 'No more available accounts',
      clientId: 1,
    },
  };

  const errorFeedUpdateContinuation = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1506801854, // October 18, 2016, 4:44:14 PM
    timestamp_to: 1508792654, // November 10, 2016, 4:44:14 PM
    num_results: 0,
    ticks: [],
    error: {
      name: 'Error',
      message: 'No more available accounts',
      clientId: 1,
    },
  };

  const errorFeedUpdate = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1506801854, // October 18, 2016, 4:44:14 PM
    timestamp_to: 1508357054, // November 5, 2016, 4:44:14 PM
    num_results: 0,
    ticks: [],
    error: {
      name: 'Error',
      message: 'No more available accounts',
      clientId: 1,
    },
  };

  const regularFeedUpdate = {
    id: feedId,
    source: feedSource,
    entity: feedEntity,
    timestamp_from: 1500667454, // August 8, 2016, 4:44:14 PM
    timestamp_to: 1506715558, // October 10, 2016, 4:45:58 PM
    num_results: 4,
    ticks: [1504209854000, 1502913854000, 1502481854000, 1501704254000], // all those ticks are between timestamp_from and timestamp_to
  };

  before(function(done) {
    // runs before all tests in this block
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

  before(async () => {
    const key = RedisKeys.feed(feedId, feedSource);
    await cli.hmset({
      key,
      hash: {
        id: feedId,
        source: feedSource,
        entity: feedEntity,
        status: 'sleep',
      },
    });
  });

  it(`GET /api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`, function(
    done,
  ) {
    request(app)
      .get(
        `/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`,
      )
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

  it('POST /api/v1/feeds NORMAL feed update', function(done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(regularFeedUpdate)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function(e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics NORMAL feed update check', function(done) {
    request(app)
      .get(
        `/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`,
      )
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function(err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [
              [1501624800000, 1],
              [1502402400000, 1],
              [1502834400000, 1],
              [1504130400000, 1],
            ],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'idle',
            client_ids: [],
          },
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1500667454000, // August 8
          },
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  it('POST /api/v1/feeds ERROR feed update', function(done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(errorFeedUpdate)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function(e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics ERROR feed update check', function(done) {
    request(app)
      .get(
        `/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`,
      )
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function(err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [
              [1501624800000, 1],
              [1502402400000, 1],
              [1502834400000, 1],
              [1504130400000, 1],
            ],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'errored',
            client_ids: [],
          },
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1500667454000, // August 8
          },
          {
            status: 'error',
            from: 1506801854000, // October 18
            to: 1508357054000, // November 5
          },
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  it('POST /api/v1/feeds ERROR feed update continuation', function(done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(errorFeedUpdateContinuation)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function(e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics ERROR feed update continuation check', function(
    done,
  ) {
    request(app)
      .get(
        `/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`,
      )
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function(err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [
              [1501624800000, 1],
              [1502402400000, 1],
              [1502834400000, 1],
              [1504130400000, 1],
            ],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'errored',
            client_ids: [],
          },
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1500667454000, // August 8
          },
          {
            status: 'error',
            from: 1506801854000, // October 18
            to: 1508792654000, // November 10
          },
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  it('POST /api/v1/feeds ERROR feed update partial fix', function(done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(errorFeedUpdatePartialFix)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function(e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics ERROR feed update partial fix check', function(
    done,
  ) {
    request(app)
      .get(
        `/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`,
      )
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function(err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [
              [1501624800000, 1],
              [1502402400000, 1],
              [1502834400000, 1],
              [1504130400000, 1],
              [1506808800000, 2],
              [1507154400000, 1],
              [1508277600000, 1],
            ],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'errored',
            client_ids: [],
          },
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1500667454000, // August 8
          },
          {
            status: 'error',
            from: 1506801854000, // October 18
            to: 1506841454000, // October 19
          },
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  it('POST /api/v1/feeds ERROR feed update recovery fix', function(done) {
    request(app)
      .post('/api/v1/feeds')
      .set('Authorization', bearerToken)
      .send(errorFeedUpdateRecoveryFix)
      .expect('Content-Type', /json/)
      .expect('Content-Length', '16')
      .expect(200)
      .end(function(e, r) {
        if (e) throw e;
        expect(r.body.success).to.equal(true);
        done();
      });
  });

  it('POST /api/v1/metrics ERROR feed update partial fix check', function(
    done,
  ) {
    request(app)
      .get(
        `/api/v1/metrics?id=${feedId}&sources=${feedSource}&entities=${feedEntity}`,
      )
      .set('Authorization', bearerToken)
      .expect('Content-Type', /json/)
      // .expect('Content-Length', '1111')
      .expect(200)
      .end(function(err, res) {
        if (err) throw err;
        expect(res.body.success).to.equal(true);
        expect(res.body.metrics.series).to.deep.equal([
          {
            data: [
              [1501624800000, 1],
              [1502402400000, 1],
              [1502834400000, 1],
              [1504130400000, 1],
              [1506808800000, 2],
              [1507154400000, 1],
              [1508277600000, 1],
            ],
            id: 'blastoise',
            source: 'instagram',
            name: '-instagram:blastoise',
            last_time_crawl: 'a few seconds ago',
            entity: feedEntity,
            status: 'idle',
            client_ids: [],
          },
        ]);
        expect(res.body.metrics.plotBands).to.deep.have.members([
          {
            status: 'error',
            from: 0,
            to: 1500667454000, // August 8
          },
        ]);
        expect(res.body.metrics.plotLines).to.be.empty;
        done();
      });
  });

  after(async () => {
    const key = RedisKeys.feed(feedId, feedSource);
    await cli.del({ key });
  });

  after(async () => {
    // clear error ticks
    const key = RedisKeys.feedWarningTicks(feedClientId, feedSource);
    const members = await cli.zrangebyscore({ key, withscores: false });
    if (members.length > 0) {
      await cli.zrem({ key, members });
    }
  });

  after(async () => {
    // clear error ticks
    const key = RedisKeys.feedErrorTicks(feedClientId, feedSource);
    const members = await cli.zrangebyscore({ key, withscores: false });
    if (members.length > 0) {
      await cli.zrem({ key, members });
    }
  });

  after(async () => {
    // clear error ticks
    const key = RedisKeys.feedsList(feedId, feedSource);
    const members = await cli.zrangebyscore({ key, withscores: false });
    if (members.length > 0) {
      await cli.zrem({ key, members });
    }
  });

  after(async () => {
    // clear error plotbands
    const key = RedisKeys.feedErrorBands(feedId, feedSource);
    const members = await cli.zrangebyscore({ key, withscores: false });
    if (members.length > 0) {
      await cli.zrem({ key, members });
    }
  });

  after(async () => {
    // clear ticks
    const key1 = RedisKeys.feedTicks(feedId, feedSource);
    const key2 = RedisKeys.feedEfficiencyTicks(feedId, feedSource);
    const dList = [];
    dList.push(cli.del({ key: key1 }));
    dList.push(cli.del({ key: key2 }));
    await Promise.all(dList);
  });

  after(async () => {
    // clear feeds
    const key = RedisKeys.feedsList();
    await cli.del({ key });
  });

  describe('Clean Redis', function() {
    const key = RedisKeys.inboundRequestsByServiceName('mocha');
    before(async () => {
      await cli.del({ key });
    });

    it('should have no keys', async () => {
      const members = await cli.zrangebyscore({ key });
      expect(members).to.be.empty;
    });
  });
});
