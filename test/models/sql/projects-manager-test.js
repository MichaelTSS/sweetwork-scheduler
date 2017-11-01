/* eslint-disable prefer-arrow-callback, no-unused-expressions, quotes, func-names, prefer-destructuring */
const expect = require('chai').expect;

const config = require('../../../app/config');

config.set('MYSQL:database', 'sweetgcloudtest'); // sweetgcloudtest is the test database
const ProjectsManager = require('../../../app/models/sql/projects-manager');

describe('ProjectsManager', function() {
  let project = {
    name: 'my-awesome-testing-project',
  };
  const projectId = 1;
  it('should find no projects for a non-existing projectId', async () => {
    const projects = await ProjectsManager.get(projectId);
    expect(projects).to.be.empty;
  });

  it('should create a project and return it', async () => {
    const response = await ProjectsManager.create(project);
    expect(response.id).to.not.be.undefined;
    expect(response.name).to.equal('my-awesome-testing-project');
    expect(response.createdAt).is.a('number');
    expect(response.updatedAt).is.a('number');
    project = JSON.parse(JSON.stringify(response));
  });

  it('should update a project and return it', function(done) {
    this.timeout(5000); // this test can take up to 5 seconds
    setTimeout(async () => {
      project.name = 'much-better-name';
      const response = await ProjectsManager.update(project);
      expect(response.id).to.not.be.undefined;
      expect(response.name).to.equal('much-better-name');
      expect(response.createdAt).to.equal(project.createdAt);
      expect(response.updatedAt).to.not.equal(project.updatedAt);
      done();
    }, 1200); // wait 1.2 second so we can check the updatedAt is changed
  });

  it('should delete a project', async () => {
    await ProjectsManager.delete(project.id);
    const projects = await ProjectsManager.get(project.id);
    expect(projects).to.be.undefined;
  });
});
