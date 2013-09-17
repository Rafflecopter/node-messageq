# messageq [![Build Status][1]][2]

A simple pub/sub system that uses reliable task queues for delivery. It uses [relyq](https://github.com/yanatan16/relyq) (simple Redis-backed reliable task queues) to establish reliable messaging. It also provides a pub/sub interface for reliable messaging by adding a discovery service backed by any database or service using a modular system.

## Operation

Install:

```
npm install relyq
```

Usage:

```javascript
var redis = require('redis'),
  cli = redis.createClient();

var messageq = require('messageq'),
  mq = new messageq.Redis(cli, options);

mq.subscribe('channel-name' [, function (message) {...}]);
mq.on('channel-name', function (message) {...});
```

## Tests

```
npm install -g nodeunit
npm install --dev
npm test
```

## Storage Backends

The messageq system can use any of the following backends, which are subclasses of the master type, so each represents a fully functional messageq system type.

### Redis

The


### Mongo




## License

See LICENSE file.

[1]: https://travis-ci.org/yanatan16/node-relyq.png?branch=master
[2]: http://travis-ci.org/yanatan16/node-relyq