# messageq [![Build Status][1]][2]

A simple pub/sub system that uses reliable task queues for delivery. It uses [relyq](https://github.com/Rafflecopter/relyq) (simple Redis-backed reliable task queues) to establish reliable messaging. It also provides a pub/sub interface for reliable messaging by adding a discovery service backed by any database or service using a modular system.

## Operation

Install:

```
npm install messageq
```

Usage:

```javascript
var redis = require('redis'),
  cli = redis.createClient();

var messageq = require('messageq'),
  mq = new messageq.RedisMQ(cli, {prefix: 'my-endpoint', discovery_prefix: 'my-queue-system'}); // see options below

mq.subscribe('channel-name' [, function (message) {...}]);
mq.on('message:channel-name', function (message) {...});

mq.publish('channel-name', {my: 'message'}, function (err) {...});
```

Options:

Note that all options can be passed in at create time. Some, which apply to subscriptions only, can be overridden or set at subscribe time.

- `prefix: 'my-endpoint'` (required) - The redis key prefix for the sub-queues.
- `delimeter: '|'` (default: ':') - The redis key delimeter for the sub-queues and discovery prefix if using RedisMQ.
- `idfield: 'tid'` (default: 'id') - The field of the task objects where the ID can be found.
- `ensureid: false` (default: true) - Adds an ID to the object if not there.

- `Q: relyq.RedisJsonQ` (defaults to RedisJsonQ) A [relyq](https://github.com/Rafflecopter/relyq) type to use as the sub-queues backend. Each one has specific options (overridable at subscribe time) that you should check out before continuing.

These options can be overridden at subscribe time:

- `timeout: 2` (default: 1) Number of seconds to wait between checking if `end()` has been called for each queue listener.
- `max_out: 10` (default: 0/infinity) Max number of message events to fire concurrently.
- `clean_finish: true` (default: true) Does not keep successfully finished messages. Set to `'keep_storage'` if you wish to keep them in storage but still remove from the queue.

In addition, the Discovery Backends have their own options (see below).

## Tests

```
npm install -g nodeunit
npm install --dev
npm test
```

## Discovery Backends

The messageq system can use any of the following backends, which are subclasses of the master type, so each represents a fully functional messageq system type.

### Redis

The Redis backend is the primary suggested one, because of its proximity to the queues.

```javascript
mq = new messageq.RedisMQ(cli, options);
```

Options:

- `discovery_prefix: 'my-queue-system'` (required) - The redis key prefix for the discovery backend


## License

See LICENSE file.

[1]: https://travis-ci.org/Rafflecopter/node-messageq.png?branch=master
[2]: http://travis-ci.org/Rafflecopter/node-messageq