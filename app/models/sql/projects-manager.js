/* eslint-disable max-len, no-param-reassign, no-underscore-dangle */
const fs = require('fs');
const moment = require('moment-timezone');
const mysql = require('mysql');
const config = require('../../config');

const connection = mysql.createConnection({
  host: config.get('MYSQL:host'),
  user: config.get('MYSQL:user'),
  password: config.get('MYSQL:password'),
  database: config.get('MYSQL:database'),
  charset: config.get('MYSQL:charset'),
  ssl: {
    ca: fs.readFileSync(config.get('MYSQL:ssl:ca')),
    cert: fs.readFileSync(config.get('MYSQL:ssl:cert')),
    key: fs.readFileSync(config.get('MYSQL:ssl:key')),
  },
});

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
    return new Promise((resolve, reject) => {
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
    return new Promise((resolve, reject) => {
      const row = ProjectsManager.jsonToSQL(project);
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
    return new Promise((resolve, reject) => {
      const id = project.id;
      delete project.id;
      const row = ProjectsManager.jsonToSQL(project);
      row.updatedAt = moment().unix();
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
    return new Promise((resolve, reject) => {
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
