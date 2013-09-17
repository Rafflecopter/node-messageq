// discovery/redis.js
// A redis-based storage for a pub/sub discovery service

// builtin
var util = require('util');

// local
var MQ = require('../messageq');

function RedisMQ(redis, opts) {
  if (!(this instanceof RedisMQ)) {
    return new RedisMQ(redis, opts);
  }

  MQ.call(this, redis, opts);

  this._discovery_prefix = opts.discovery_prefix;
}

util.inherits(RedisMQ, MQ);

RedisMQ.prototype._register = function (channel, endpoint, callback) {
  var key = [this._discovery_prefix, channel].join(this._delimeter);
  this._redis.sadd(key, endpoint, callback);
};

RedisMQ.prototype._unregister = function (channel, endpoint, callback) {
  var key = [this._discovery_prefix, channel].join(this._delimeter);
  this._redis.srem(key, endpoint, callback);
};

RedisMQ.prototype._subscribers = function (channel, callback) {
  var key = [this._discovery_prefix, channel].join(this._delimeter);
  this._redis.smembers(key, callback);
};

module.exports = RedisMQ;