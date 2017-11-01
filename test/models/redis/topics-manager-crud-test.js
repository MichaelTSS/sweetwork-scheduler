/* eslint-disable prefer-arrow-callback, no-unused-expressions, quotes, func-names, prefer-destructuring */
const expect = require('chai').expect;

const config = require('../../../app/config');

config.set('MYSQL:database', 'sweetgcloudtest'); // sweetgcloudtest is the test database
const TopicsManager = require('../../../app/models/redis/topics-manager');
const ProjectsManager = require('../../../app/models/sql/projects-manager');

describe('TopicsManager', function() {
  let projectId;
  let topicId;
  const project = {
    name: 'Let the silences change you',
  };
  const topicsToStore = {
    topics: [
      {
        name: 'Teletubbies',
        sources: ['googleplus'],
        projectId,
        words: ['Tinky-Winky', 'Dipsy'],
        accounts: [],
      },
    ],
  };

  before(async () => {
    const result = await ProjectsManager.create(project);
    projectId = result.id;
    topicsToStore.topics[0].projectId = projectId;
  });

  it('should create a topic and return it', async () => {
    const results = await TopicsManager.store(topicsToStore.topics);
    topicId = results[0].id;
    topicsToStore.topics[0].id = topicId;
    expect(results[0].id).to.not.be.undefined;
    expect(results[0].name).to.equal('Teletubbies');
    expect(results[0].createdAt).is.a('number');
    expect(results[0].updatedAt).is.a('number');
  });

  it('should read a topic previously created', async () => {
    const results = await TopicsManager.get(null, [topicId]);
    expect(results[0].id).to.equal(topicId);
    expect(results[0].name).to.equal('Teletubbies');
    expect(results[0].createdAt).is.a('number');
    expect(results[0].updatedAt).is.a('number');
  });

  it('should update a topic and return it', async () => {
    topicsToStore.topics[0].name = 'What a much better name';
    const result = await TopicsManager.update(topicsToStore.topics[0]);
    expect(result.id).to.equal(topicId);
    expect(result.name).to.equal('What a much better name');
  });

  it('should delete a topic', async () => {
    await TopicsManager.delete(topicId);
    const results = await TopicsManager.get(null, [topicId]);
    expect(results).to.be.empty;
  });

  after(async () => {
    await ProjectsManager.delete(projectId);
  });
});
