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
  EventEmitter.call(this);

  this._Q = opts.Q ?
    _.isFunction(opts.Q) ? opts.Q : relyq[opts.Q] :
    relyq.RedisJsonQ;
  this._redis = redis;
  this._prefix = opts.prefix;
  this._delimeter = opts.delimeter || ':';
  this._opts = _.extend(opts, {
    allow_defer: false,
    allow_recur: false,
  });
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

MQ.prototype.sub = MQ.prototype.subscribe = function subscribe(channel, other_opts) {
  // -- Core subscribe logic --
  var endpoint = this._prefix + this._delimeter + channel,
    self = this,
    nargs = _.isFunction(other_opts) ? 1 : 2,
    listeners = Array.prototype.slice.call(arguments, nargs),
    opts = _.isFunction(other_opts) ? {} : other_opts;


  this._create_listener(channel, endpoint, opts);

  // Apply on(channel, listener) for all listeners
  var listeners = Array.prototype.slice.call(arguments, nargs);
  _.each(listeners, _.bind(this.on, this, 'message:'+channel));

  this._register(channel, endpoint, function (err) {
    if (err) {
      return self.emit('error', err, channel);
    }
    self.emit('subscribed', channel);
  });

  return this;
};

MQ.prototype.pub = MQ.prototype.publish = function publish(channel, message, callback) {
  var self = this,
    ourEndpoint = this._channels[channel] && this._channels[channel].endpoint;

  async.waterfall([
    _.bind(this._subscribers, this, channel),
    function (endpoints, cb) {
      async.each(_.without(endpoints, ourEndpoint), function (endp, cb) {
        self._queue(endp, self._opts).push(message, cb);
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

  var self = this;

  if (callback)
    self.once('end', callback);

  async.map(_.values(this._queues), function (q, cb) { q.end(cb); }, function (err) {
    if (err) {
      self.emit('error', err);
    }
    self.emit('end', err);
  });
};

// -- Helpers --

MQ.prototype._create_listener = function(channel, endpoint, other_opts) {
  var self = this,
    opts = _.extend(_.clone(this._opts), other_opts),
    q = this._queue(endpoint, opts),
    l = q.listen(opts)
      .on('error', function (err, taskref) {
        self.emit('error', err, channel, taskref);
      })
      .on('task', function (msg, done) {
        self.emit('message:'+channel, msg, done);
      });

  self._channels[channel] = {endpoint: endpoint, queue: q, listener: l};
};

MQ.prototype._queue = function _queue(endpoint, opts) {
  // Create a new relyq and cache it
  return this._queues[endpoint] ||
    (this._queues[endpoint] =
      new this._Q(
        this._redis,
        _.extend(opts || {}, { prefix: endpoint })
      )
    );
};

module.exports = MQ;