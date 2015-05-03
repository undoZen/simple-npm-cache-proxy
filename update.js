'use strict';
global.Promise = require('bluebird');
var Redis = require('redis');
var config = require('config');
Promise.promisifyAll(Redis);
var logger = require('bunyan-hub-logger');
logger.replaceDebug('simple-npm-cache-proxy');
var http = require('http');
http.globalAgent.maxSockets = Infinity;
var url = require('url');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var co = require('co');
var superagent = require('superagent');
var mkdirp = require('mkdirp');
var concat = require('concat-stream');
var shp = require('simple-http-proxy');
var db = Redis.createClient(config.redis || {});
db.select(5);
var log = logger({
    app: 'simple-npm-cache-proxy',
    name: 'update',
    serializers: xtend(logger.stdSerializers, {
        response: logger.stdSerializers.res
    }),
});

function replaceBodyRegistry(body) {
    return body.replace(config.replaceHost[0], config.replaceHost[1]);
}

function xtend() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift({});
    return _.assign.apply(_, args);
}

function sleep(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

function pickHeaders(headers) {
    return _.pick(headers, [
        'etag',
        'content-type',
        'content-length',
    ]);
}

var up = co.wrap(function * () {
    var urls = yield db.zrangebyscoreAsync('schedule', 0, Date.now());
    if (!urls.length) {
        return;
    }
    var url;
    while ((url = urls.shift())) {
        yield update(url);
    }
});

function u() {
    up().catch(log.error.bind(log)).then(setTimeout.bind(null, u, 100));
}
u();

function update(registryAndUrl) {
    return co(function * () {
        var index = registryAndUrl.indexOf('||');
        var payload = {
            registry: registryAndUrl.substring(0, index),
            url: registryAndUrl.substring(index + 2)
        };
        db.zadd('schedule', Date.now() + 8 * 60 * 1000 + Math.random() * 4, payload.registry + '||' + payload.url);
        var cachedJson = yield db.getAsync('cache||' + payload.registry + '||' + payload.url);
        if (cachedJson) {
            var cache = JSON.parse(cachedJson);
            payload.etag = cache.etag;
        }
        log.trace({
            job: 'update',
            payload: payload,
        });
        var registryUrl, registryHost;
        if (Array.isArray(config.registry[payload.registry])) {
            registryUrl = config.registry[payload.registry][0];
            registryHost = config.registry[payload.registry][1];
        } else {
            registryUrl = config.registry[payload.registry];
            registryHost = url.parse(config.registry[payload.registry]).host;
        }
        var r = superagent.get(registryUrl + payload.url).set('host', registryHost);
        if (payload.etag) {
            r.set('if-none-match', payload.etag)
        }
        r.end(co.wrap(function * (err, r) {
            log.trace({
                job: 'update',
                payload: payload,
                err: err,
                response: r,
            });
            if (err || r.statusCode !== 200 || !r.headers.etag) {
                return;
            }
            var headers = r.headers;
            if (r.text && headers.etag && headers.etag !== payload.etag) {
                var body = replaceBodyRegistry(r.text);
                var b;
                try {
                    b = JSON.stringify(JSON.parse(body));
                } catch (e) {}
                if (b) {
                    var cacheObject = {
                        statusCode: r.statusCode,
                        headers: xtend(pickHeaders(r.headers), {
                            'content-length': Buffer.byteLength(b)
                        }),
                        etag: r.headers.etag,
                        body: body,
                    };
                    log.info({
                        updated: true,
                        cacheObject: cacheObject,
                    });
                    yield db.setAsync('cache||' + payload.url, JSON.stringify(cacheObject));
                }
            }
        }));
    }).catch(log.error.bind(log));
}
