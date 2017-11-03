/* eslint-disable max-len, no-param-reassign, no-underscore-dangle, prefer-destructuring */
const moment = require('moment-timezone');
const startConnection = require('../../utils').startConnection;

class ProjectsManager {
  constructor(topic) {
    if (!topic) {
      throw new Error('Missing topic argument');
    }
    this.topic = topic;
  }
  static jsonToSQL(project) {
    return {
      name: project.name,
      createdAt: project.createdAt || moment().unix(),
      updatedAt: project.updatedAt || moment().unix(),
    };
  }
  /**
   * Returns an object { id: 3, name: 'my-name', createdAt: 149837598, updatedAt: 149837598 }
   * or undefined if not found
   */
  static get(projectId) {
    return new Promise(async (resolve, reject) => {
      const connection = await startConnection();
      connection.query(
        'SELECT * FROM Projects WHERE ?',
        { id: projectId },
        async (error, results) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(results[0]);
        },
      );
    });
  }
  /**
   * Returns an object { id: 3, name: 'my-name', createdAt: 149837598, updatedAt: 149837598 }
   * or undefined if not found
   */
  static create(project) {
    return new Promise(async (resolve, reject) => {
      const row = ProjectsManager.jsonToSQL(project);
      const connection = await startConnection();
      connection.query(
        'INSERT INTO Projects SET ?',
        row,
        async (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          const result = await ProjectsManager.get(response.insertId);
          resolve(result);
        },
      );
    });
  }
  /**
   * Updates and returns the object
   */
  static update(project) {
    /* eslint-disable prefer-destructuring */
    return new Promise(async (resolve, reject) => {
      const id = project.id;
      delete project.id;
      const row = ProjectsManager.jsonToSQL(project);
      row.updatedAt = moment().unix();
      const connection = await startConnection();
      connection.query(
        'UPDATE Projects SET ? WHERE ?',
        [row, { id }],
        async error => {
          if (error) {
            reject(error);
            return;
          }
          const result = await ProjectsManager.get(id);
          resolve(result);
        },
      );
    });
  }
  /**
   * Returns undefined
   */
  static delete(projectId) {
    return new Promise(async (resolve, reject) => {
      const connection = await startConnection();
      connection.query(
        'DELETE FROM Projects WHERE ?',
        { id: projectId },
        async error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });
  }
}

module.exports = ProjectsManager;
