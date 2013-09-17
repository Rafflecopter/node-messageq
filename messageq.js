// messageq.js
// Main messageq logic
// Establishes main supertype that subtypes inherit from to apply storage logic.

// builtin
var util = require('util'),
  EventEmitter = require('events').EventEmitter;

// vendor
var _ = require('underscore'),
  async = require('async'),
  relyq = require('relyq'),
  redis = require('redis'),
  uuid = require('uuid');

// -- Main Type --
// MQ is a messageq object
function MQ(redis, opts) {
  this._Q = opts.Q || relyq.RedisJsonQ;
  this._redis = redis;
  this._prefix = opts.prefix;
  this._delimeter = opts.delimeter || ':';
  this._opts = opts;
  this._channels = [];
  this._queues = {};

  if (opts.ensureid === undefined || opts.ensureid) {
    var idfield = opts.idfield || 'id';
    opts.getid = function (task) {
      var id = task[idfield] = task[idfield] || uuid.v4();
      return id;
    };
  }
}

util.inherits(MQ, EventEmitter);


// -- These are overridden by discovery storage --

// @overridable
// Register a subscription
MQ.prototype._register = function (channel, endpoint, callback) {
  //override
};

// @overridable
// Unregister a subscription
MQ.prototype._unregister = function (channel, endpoint, callback) {

};

// @overridable
// List the subscribers of a channel
MQ.prototype._subscribers = function (channel, callback) {

};

// -- Public API --

MQ.prototype.subscribe = function subscribe(channel) {

  // -- Core subscribe logic --
  var endpoint = this._prefix + this._delimeter + channel,
    self = this;

  this._create_listener(channel, endpoint);

  // Apply on(channel, listener) for all listeners
  var listeners = Array.prototype.slice.call(arguments, 1);
  _.each(listeners, _.bind(this.on, this, 'message:'+channel));

  this._register(channel, endpoint, function (err) {
    if (err) {
      return self.emit('error', err, channel);
    }
    self.emit('subscribed', channel);
  });

  return this;
};

MQ.prototype.publish = function publish(channel, message, callback) {
  var self = this;

  async.waterfall([
    _.bind(this._subscribers, this, channel),
    function (endpoints, cb) {
      async.each(endpoints, function (endp, cb) {
        self._queue(endp).push(message, cb);
      }, cb);
    },
  ], callback);

  return this;
};

MQ.prototype.unsubscribe = function unsubscribe(channel, callback) {
  var chan = self._channels[channel];

  if (!chan) {
    return this.emit('error', new Error('can\'t unsubscribe from a channel youre not subscribed to'), channel);
  }

  async.series([
    _.bind(this._unregister, this, channel, chan.endpoint),
    _.bind(this._end1, chan)
  ], function (err) {
    if (err) {
      this.emit('error', err, channel);
    }
  });

  return this;
}

MQ.prototype.end = function end (callback) {
  var self = this;

  async.map(_.values(this._channels), this._end1, function (err) {
    if (err) {
      self.emit('error', err);
    }
    self.emit('end');
    if (callback) callback();
  });
};

// -- Helpers --

MQ.prototype._end1 = function (chan, callback) {
  chan.listener.once('end', callback).end();
};

MQ.prototype._create_listener = function(channel, endpoint) {
  var self = this,
    q = this._queue(endpoint),
    l = q.listen(this._opts)
      .on('error', function (err, taskref) {
        self.emit('error', err, channel, taskref);
      })
      .on('task', function (msg, done) {
        self.emit('message:'+channel, msg, done);
      });

  self._channels[channel] = {endpoint: endpoint, queue: q, listener: l};
};

MQ.prototype._queue = function _queue(endpoint) {
  // Create a new relyq and cache it
  return this._queues[endpoint] ||
    (this._queues[endpoint] = new this._Q(this._redis, _.extend(this._opts, { prefix: endpoint })));
};

module.exports = MQ;