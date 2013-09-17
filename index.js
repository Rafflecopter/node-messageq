// messageq/index.js
// MessageQ!

var MQ = require('./messageq'),
  RedisMQ = require('./discovery/redis');

module.exports = {
  MQ: RedisMQ,
  RedisMQ: RedisMQ,
};