'use strict';
global.Promise = require('bluebird');
var Redis = require('ioredis');
var logger = require('bunyan-hub-logger');
logger.replaceDebug('simple-npm-cache-proxy');
var http = require('http');
http.globalAgent.maxSockets = Infinity;
var urlParse = require('url').parse;
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var co = require('co');
var request = require('promisingagent');
var mkdirp = require('mkdirp');
var concat = require('concat-stream');
var shp = require('simple-http-proxy');
var utils = require('./utils');
var matchUpstream = utils.matchUpstream;
var replaceBodyRegistry = utils.replaceBodyRegistry;
var xtend = utils.xtend;
var sleep = utils.sleep;
var pickHeaders = utils.pickHeaders;
var log = logger({
    app: 'simple-npm-cache-proxy',
    name: 'update',
    serializers: xtend(logger.stdSerializers, {
        response: logger.stdSerializers.res
    }),
});

var up = co.wrap(function * (ctx) {
    var urls = yield ctx.db.zrangebyscore('schedule', 0, Date.now());
    if (!urls.length) {
        return;
    }
    var url;
    while ((url = urls.shift())) {
        yield update(url, ctx);
    }
});

module.exports = Updater;
function Updater(config) {
    var db = new Redis(config.redis || void 0);
    var ctx = {
        run: run,
        config: config,
        db: db,
        interval: utils.randomInterval(config),
    };
    return ctx;
    function run() {
        up(ctx).catch(log.error.bind(log)).then(setTimeout.bind(null, run, 100));
    }
}

function update(url, ctx) {
    var db = ctx.db;
    var config = ctx.config;
    var interval = ctx.interval;
    return co(function * () {
        var upstream = matchUpstream(config.upstreams, url);
        db.zadd('schedule', Date.now() + interval(), url);
        var cachedJson = yield db.get('cache||' + url);
        var etag;
        if (cachedJson) {
            var cache = JSON.parse(cachedJson);
            etag = cache.etag;
        }
        log.trace({
            job: 'update',
            url: url,
        });
        var registryUrl, registryHost;
        if (Array.isArray(upstream.proxyTo)) {
            registryUrl = upstream.proxyTo[0];
            registryHost = upstream.proxyTo[1];
        } else {
            registryUrl = upstream.proxyTo;
            registryHost = urlParse(upstream.proxyTo).host;
        }
        var r = yield request.get(registryUrl + url, {
            headers: xtend({
                host: registryHost,
            }, etag ? {'if-none-match': etag} : {}),
        });
        log.trace({
            job: 'update',
            url: url,
            etag: etag,
            response: r,
            rtext: r.text,
        });
        if (r.statusCode !== 200 || !r.headers.etag) {
            return;
        }
        var headers = r.headers;
        if (r.text && headers.etag && headers.etag !== etag) {
            var body = replaceBodyRegistry(upstream.replace, r.text);
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
                yield db.set('cache||' + url, JSON.stringify(cacheObject));
            }
        }
    }).catch(log.error.bind(log));
}
