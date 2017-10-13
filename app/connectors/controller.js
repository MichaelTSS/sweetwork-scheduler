/* eslint-disable no-param-reassign, arrow-body-style */

const HTTP = require('q-io/http');
const bufferStream = require('q-io/buffer-stream');
const querystring = require('query-string');
const utils = require('sweetwork-utils');

class Controller {
  constructor(host, port, passphrase) {
    if (!host) throw new Error('Missing host argument');
    if (!port) throw new Error('Missing port argument');
    this.host = `${host}:${port}`;
    this.headers = { 'Content-Type': 'application/json' };
    this.passphrase = passphrase;
  }

  auth(serviceName) {
    if (!serviceName) {
      return Promise.reject(new Error('please provide a service name'));
    }
    const that = this;
    return new Promise((resolve, reject) => {
      utils.authJWT(that.host, that.headers, serviceName, that.passphrase).then(
        token => {
          that.headers.Authorization = `Bearer ${token}`;
          that.failedAuth = null;
          resolve();
        },
        err => {
          that.failedAuth = serviceName;
          reject(err);
        },
      );
    });
  }

  search(search) {
    const that = this;
    function fn() {
      return new Promise((resolve, reject) => {
        HTTP.request({
          url: `${that.host}/api/v1/search`,
          method: 'POST',
          headers: that.headers,
          body: bufferStream(Buffer.from(JSON.stringify(search), 'utf8')),
        }).then(
          res => {
            res.body.read().then(body => {
              const response = JSON.parse(Buffer.from(body, 'utf8'));
              if (response.success) resolve();
              else reject(response.error);
            });
          },
          error => reject(error),
        );
      });
    }
    if (that.failedAuth) {
      return new Promise((resolve, reject) => {
        return that
          .auth(that.failedAuth)
          .then(
            () => fn().then(r => resolve(r), e => reject(e)),
            err => reject(err),
          );
      });
    }
    return fn();
  }

  getAuthor(opt) {
    if (!opt.ids)
      return Promise.reject(new Error('Missing ids option argument'));
    if (!opt.source)
      return Promise.reject(new Error('Missing source option argument'));
    if (!opt.client_id)
      return Promise.reject(new Error('Missing client_id option argument'));
    const that = this;
    if (Array.isArray(opt.ids)) opt.ids = opt.ids.join(',');
    const queryParams = querystring.stringify(opt, '&', '=', {
      encodeURIComponent: querystring.unescape,
    });
    function fn() {
      return new Promise((resolve, reject) => {
        HTTP.request({
          url: `${that.host}/api/v1/authors?${queryParams}`,
          method: 'GET',
          headers: that.headers,
        }).then(
          res => {
            res.body.read().then(body => {
              const response = JSON.parse(Buffer.from(body, 'utf8'));
              if (response.success) resolve(response.authors);
              else reject(response.error);
            });
          },
          error => reject(error),
        );
      });
    }
    if (that.failedAuth) {
      return new Promise((resolve, reject) => {
        return that
          .auth(that.failedAuth)
          .then(
            () => fn().then(r => resolve(r), e => reject(e)),
            err => reject(err),
          );
      });
    }
    return fn();
  }

  getPosts(opt) {
    if (!opt.ids)
      return Promise.reject(new Error('Missing ids option argument'));
    if (!opt.source)
      return Promise.reject(new Error('Missing source option argument'));
    if (!opt.client_id)
      return Promise.reject(new Error('Missing client_id option argument'));
    const that = this;
    if (Array.isArray(opt.ids)) opt.ids = opt.ids.join(',');
    const queryParams = querystring.stringify(opt, '&', '=', {
      encodeURIComponent: querystring.unescape,
    });
    function fn() {
      return new Promise((resolve, reject) => {
        HTTP.request({
          url: `${that.host}/api/v1/posts?${queryParams}`,
          method: 'GET',
          headers: that.headers,
        }).then(
          res => {
            res.body.read().then(body => {
              const response = JSON.parse(Buffer.from(body, 'utf8'));
              if (response.success) resolve(response.authors);
              else reject(response.error);
            });
          },
          error => reject(error),
        );
      });
    }
    if (that.failedAuth) {
      return new Promise((resolve, reject) => {
        return that
          .auth(that.failedAuth)
          .then(
            () => fn().then(r => resolve(r), e => reject(e)),
            err => reject(err),
          );
      });
    }
    return fn();
  }
}

module.exports = Controller;
