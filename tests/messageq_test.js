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
    Q: 'RedisJsonQ',
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

// If we are getting a test.done complaint, turn this on. It helps find errors
process.on('uncaughtException', function (err) {
  console.error(err.stack);
});


function createTests(type, opts) {
  var tests = {}, Q1, Q2;

  tests.setUp = function setUp (callback) {
    var disco = 'messageq-test:'+Moniker.choose()+':channels';

    Q1 = new type(redis, _.extend(opts, {prefix: 'messageq-test:'+Moniker.choose()+':endpoints', discovery_prefix: disco}));
    Q2 = new type(redis, _.extend(opts, {prefix: 'messageq-test:'+Moniker.choose()+':endpoints', discovery_prefix: disco}));
    Q3 = new type(redis, _.extend(opts, {prefix: 'messageq-test:'+Moniker.choose()+':endpoints', discovery_prefix: disco}));
    callback();
  };

  tests.tearDown = function tearDown (callback) {
    Q1.end(); // Usually you'd wait on it
    Q2.end();
    Q3.end();
    callback();
  };

  // -- Tests --
  tests.basic = function (test) {
    Q1.on('error', test.ifError);
    Q2.on('error', test.ifError);

    Q1.subscribe('mychan', function (msg, done) {
      test.deepEqual(_.omit(msg, 'id'), {hello: 'world'});
      test.notEqual(msg.id, undefined);
      done();
      setTimeout(function () {
        var Q = Q1._channels['mychan'].queue;
        async.parallel([
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

  // This essentially tests that we don't send ourself our own messages
  tests.two_way = function (test) {
    Q1.on('error', test.ifError)
      .sub('chan1', function (msg, done) {
        test.equal(msg.from, 'q2');
        done();
      });
    Q2.on('error', test.ifError)
      .sub('chan2', function (msg, done) {
        test.equal(msg.from, 'q1');
        done();
        if (msg.last) {
          test.done();
        }
      });

    Q1.pub('chan2', {from: 'q1'});
    Q2.pub('chan1', {from: 'q2'});
    Q2.pub('chan1', {from: 'q2'});
    Q1.pub('chan2', {from: 'q1'});
    Q2.pub('chan1', {from: 'q2'});
    Q1.pub('chan2', {from: 'q1', last:true});
  };

  tests.manage_a_troi = function (test) {
    var counts = {};

    Q1.on('error', test.ifError)
      .sub('chan2', sub('q1'))
      .sub('chan3', sub('q1'));
    Q2.on('error', test.ifError)
      .sub('chan1', sub('q2'))
      .sub('chan3', sub('q2'));
    Q3.on('error', test.ifError)
      .sub('chan1', sub('q3'))
      .sub('chan2', sub('q3'));

    function finaly() {
      test.ok(counts.x===2&&counts.y===2&&counts.z===2, 'Counts should all be 2: ' +JSON.stringify(counts));
      test.done();
    }

    function sub(from) {
      return function (msg, done) {
        test.notEqual(msg.from, from);
        counts[msg.key] = (counts[msg.key] || 0) + 1;
        done();
        if (msg.last && counts.z==2) {
          finaly();
        }
      };
    }

    Q1.pub('chan1', {from: 'q1', key: 'x'});
    Q2.pub('chan2', {from: 'q2', key: 'y'});
    Q3.pub('chan3', {from: 'q3', key: 'z', last: true});
  }

  tests.two_chans = function (test) {
    var counts = {};

    Q1.on('error', test.ifError)
      .sub('chan1', function (msg, done) {
        test.equal(msg.on, 'chan1');
        counts[msg.on] = (counts[msg.on]||0)+1;
        done();
      });
    Q2.on('error', test.ifError)
      .sub('chan2', function (msg, done) {
        test.equal(msg.on, 'chan2');
        counts[msg.on] = (counts[msg.on]||0)+1;
        done();
        if (msg.last) finaly();
      })
      .sub('chan1', function (msg, done) {
        test.equal(msg.on, 'chan1');
        counts[msg.on] = (counts[msg.on]||0)+1;
        done();
      });
    Q3.on('error', test.ifError)
      .sub('chan2', function (msg, done) {
        test.equal(msg.on, 'chan2');
        counts[msg.on] = (counts[msg.on]||0)+1;
        done();
        if (msg.last) finaly();
      });

    var i = 0
    function finaly() {
      if (++i < 2) return;

      test.deepEqual(counts, {
        chan1: 4,
        chan2: 6,
      });
      test.done();
    }

    Q1.pub('chan1', {on: 'chan1'});
    Q1.pub('chan2', {on: 'chan2'});
    Q3.pub('chan1', {on: 'chan1'});
    Q3.pub('chan2', {on: 'chan2'});
    Q2.pub('chan2', {on: 'chan2', last: true});
  };

  tests.overridable_options = function (test) {
    var out = 0;

    Q1.on('error', test.ifError)
      .subscribe('chan', {max_out: 1}, function (msg, done) {
        test.equal(++out, 1);
        setTimeout(function () {
          done();
          --out;
          if (msg.last) {
            test.done();
          }
        }, 5);
      });

    Q2.pub('chan', {});
    Q2.pub('chan', {});
    Q2.pub('chan', {last: true});
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