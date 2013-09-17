// messageq_test.js
require('longjohn').async_trace_limit = -1;

// vendor
var redis = require('redis').createClient(),
  Moniker = require('moniker'),
  async = require('async'),
  _ = require('underscore'),
  uuid = require('uuid');

// local
var messageq = require('..'),
  relyq = require('relyq');

// Storages to test
var storages = {
  'RedisMQ': [messageq.RedisMQ, {
    delimeter: ':',
    Q: relyq.RedisMsgPackQ,
    idfield: 'id',
    ensureid: true
  }],
}

_.each(storages, function (arr, name) {
  exports[name] = createTests(arr[0], arr[1]);
});

// Clean up redis to allow a clean escape!
exports.cleanUp = function cleanUp (test) {
  redis.end();
  test.done();
};

// If we are getting a test.done complaint, turn this on. It breaks nodeunit, but helps find errors
// process.on('uncaughtException', function (err) {
//   console.error(err.stack);
// });


function createTests(type, opts) {
  var tests = {}, Q1, Q2;

  tests.setUp = function setUp (callback) {
    var disco = 'messageq-test:'+Moniker.choose()+':channels';

    Q1 = new type(redis, _.extend(opts, {prefix: 'messageq-test:'+Moniker.choose()+':endpoints', discovery_prefix: disco}));
    Q2 = new type(redis, _.extend(opts, {prefix: 'messageq-test:'+Moniker.choose()+':endpoints', discovery_prefix: disco}));
    callback();
  };

  tests.tearDown = function tearDown (callback) {
    Q1.end(function () {}); // Usually you'd wait on it
    Q2.end(function () {});
    callback();
  };

  // -- Tests --
  tests.basic = function (test) {
    Q1.on('error', test.ifError);
    Q2.on('error', test.ifError);

    Q1.subscribe('mychan', function (msg, done) {
      test.deepEqual(_.omit(msg, 'id'), {hello: 'world'});
      done();
      setTimeout(function () {
        var Q = Q1._channels['mychan'].queue;
        async.parallel([
          checkByStorageList(test, Q, Q.done, [{hello:'world'}], 'id'),
          checkByStorageList(test, Q, Q.doing, []),
          checkByStorageList(test, Q, Q.todo, []),
        ], test.done);
      }, 10);
    });
    Q2.publish('mychan', {hello: 'world'}, function (err) {
      test.ifError(err);
    });
  };

  tests.subscribe_listeners = function (test) {
    Q1.on('error', test.ifError);
    Q2.on('error', test.ifError);
    var cnt = 0;

    Q1.subscribe('mychan', function (msg, done) {
      test.deepEqual(_.omit(msg, 'id'), {hello: 'man'});
      cnt ++;
    })
    .on('message:mychan', function (msg, done) {
      test.deepEqual(_.omit(msg, 'id'), {hello: 'man'});
      cnt++;
      test.equal(cnt, 2);
      done();
      test.done();
    })
    Q2.publish('mychan', {hello: 'man'}, test.ifError);
  };

  tests.end = function (test) {
    Q1.on('error', test.ifError);
    Q2.on('error', test.ifError);
    var cnt = 0;

    Q1.subscribe('mychan', function (msg, done) {
      setTimeout(function () {
        Q1.end();
        Q2.end();
        done(); // Everything should still be fine because end should wait until all tasks are finished.
      }, 10);
    });

    Q1.on('end', function () {
      cnt++;
      if (cnt === 2) test.done();
    });

    Q2.on('end', function () {
      cnt++;
      if (cnt === 2) test.done();
    }).publish('mychan', {hello: 'dolly'}, test.ifError);
  };

  return tests;
}



function checkByStorageList(test, Q, sQ, exp, ignore) {
  var stack = new Error().stack;
  return function (callback) {
    async.waterfall([
      _.bind(sQ.list, sQ),
      function (list, cb) {
        async.map(list, function (ref, cb2) {
          Q.get(ref, function (err, obj) {
            cb2(err, _.omit(obj, ignore));
          });
        }, cb);
      },
      function (list2, cb) {
        test.deepEqual(list2, exp, 'checkByStorageList: ' + stack);
        cb();
      }
    ], callback);
  };
}