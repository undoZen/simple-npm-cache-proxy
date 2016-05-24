'use strict';
global.Promise = require('bluebird');
var Redis = require('ioredis');
var logger = require('bunyan-hub-logger');
logger.replaceDebug('simple-npm-cache-proxy');
var http = require('http');
http.globalAgent.maxSockets = Infinity;
var url = require('url');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var co = require('co');
//var superagent = require('superagent');
var mkdirp = require('mkdirp');
var concat = require('concat-stream');
var shp = require('simple-http-proxy');
var st = require('st');
var utils = require('./utils');
var xtend = utils.xtend;
var pickHeaders = utils.pickHeaders;
var replaceBodyRegistry = utils.replaceBodyRegistry;
var matchUpstream = utils.matchUpstream;
var defaultUpstream = utils.defaultUpstream;
var randomInterval = utils.randomInterval;
var log = logger({
    app: 'simple-npm-cache-proxy',
    name: 'server',
    serializers: xtend(logger.stdSerializers, {
        response: logger.stdSerializers.res
    }),
});
var rimraf = Promise.promisify(require('rimraf'));

module.exports = function (config) {

    var db = new Redis(config.redis || void 0);
    var cachedRequest = {};
    var mount = st(xtend({
        cache: utils.defaultStCacheOptions,
    }, {
        cache: config.stCacheOptions || {},
    }, {
        path: config.tarballCacheDir,
        index: false,
        passthrough: true,
    }));
    var interval = randomInterval(config);

    var proxy = co.wrap(function * (upstream, req, res) {
        var crkey = upstream.name + '|' + req.url;
        if (upstream.cache && req.method === 'GET' && !req.url.match(/^\/-\//)) {
            var cachedJson = yield db.get('cache||' + req.url);
            if (cachedJson) {
                var cache = JSON.parse(cachedJson);
                log.debug({
                    req: req,
                    cachedObject: cache
                });
                if ('if-none-match' in req.headers && req.headers['if-none-match'] === cache.etag) {
                    cache.headers['content-length'] = 0;
                    return {
                        statusCode: 304,
                        headers: cache.headers,
                        body: new Buffer(0),
                    };
                }
                return cache;
            }
            var cr;
            if ((cr = cachedRequest[crkey])) {
                return cr;
            }
        }
        if ('if-none-match' in req.headers) { // make sure upstream return 200 instead of 304
            delete req.headers['if-none-match'];
        }
        if ('accept-encoding' in req.headers) { // remove gzip, get raw text body
            req.headers['accept-encoding'] = 'identity';
        }
        var registryUrl, registryHost;
        if (Array.isArray(upstream.proxyTo)) {
            registryUrl = upstream.proxyTo[0];
            registryHost = upstream.proxyTo[1];
        } else {
            registryUrl = upstream.proxyTo;
            registryHost = url.parse(upstream.proxyTo).host;
        }
        req.headers.host = registryHost;

        var rp = new Promise(function(resolve, reject) {
            var request, response;
            var concatStream = concat(function(body) {
                if (!response && request) response = request.res;
                var headers = response.headers;
                // cache tarball
                if (upstream.cache && req.method === 'GET' && !headers.location &&
                    headers['content-type'] === 'application/octet-stream') {
                    var filePath = path.resolve(config.tarballCacheDir, req.url.replace(/^\/+/, ''));
                    mkdirp(path.dirname(filePath), function(err) {
                        if (err) log.error(err);
                        fs.writeFile(filePath, body, function(err) {
                            if (err) log.error(err);
                        });
                    });
                }
                // cache json
                else if ((headers['content-type'] || '').match(/^application\/json/i)) {
                    body = body.toString('utf8');
                    log.debug({
                        req: req,
                        body: body,
                    });
                    body = replaceBodyRegistry(upstream.replace, body);
                    log.debug({
                        req: req,
                        headers: headers,
                        replacedBody: body,
                    });
                    headers = xtend(headers, {
                        'content-length': Buffer.byteLength(body)
                    });
                    if (upstream.cache && req.method === 'GET' && !req.url.match(/^\/-\//) && typeof headers['etag'] === 'string') {
                        var b;
                        try {
                            var b = JSON.stringify(JSON.parse(body));
                        } catch (e) {}
                        if (b) {
                            headers['content-length'] = Buffer.byteLength(b);
                        }
                        db.set('cache||' + req.url, JSON.stringify({
                            statusCode: response.statusCode,
                            headers: headers,
                            body: body,
                            etag: headers.etag,
                        }));
                        db.zadd('schedule', Date.now() + interval(), req.url);
                    }
                }
                resolve({
                    statusCode: response.statusCode,
                    headers: pickHeaders(headers),
                    body: body,
                });
            });
            //if (['GET', 'HEAD'].indexOf(req.method) === -1) {
                shp(registryUrl, {
                    timeout: 300000,
                    onrequest: function(options, req) {
                        options.headers.host = registryHost;
                    },
                    onresponse: function(_response, res) {
                        response = _response;
                        response.pipe(concatStream);
                        return true;
                    },
                })(req, res, reject);
                /*
            } else {
                request = superagent(req.method, registryUrl + req.url)
                    .redirects(1)
                    .set(req.headers);
                request.pipe(concatStream);
                request._callback = function(err) {
                    if (err) return reject(err);
                };
            }
            */
        });
        if (req.method === 'GET') {
            cachedRequest[crkey] = rp;
            rp.finally(function() {
                delete cachedRequest[crkey];
            });
        }
        return rp;
    });

    function routeProxy(req, res) {
        var upstream = matchUpstream(config.upstreams, req.url);
        return proxy(upstream, req, res);
    }
    var server = http.createServer();
    server.on('request', function(req, res) {
        req.url = req.url.replace(/\/+/g, '/').replace(/\?.*$/g, '');
        res.status = function(code) {
            res.statusCode = code;
        };
        req.res = res;
        res.req = req;
        log.debug({
            req: req,
            res: res
        });
        if (req.url.match(/\/__flush__\//)) {
            var flushUrl = req.url.substring('/__flush__'.length);
            return co(function * () {
                if (/\.tgz$/i.test(flushUrl)) {
                    yield rimraf(path.join(config.tarballCacheDir, flushUrl));
                } else {
                    yield db.del('cache||' + flushUrl);
                }
                res.end('done\n');
            }).catch(resError);
        }
        ((['GET', 'HEAD'].indexOf(req.method) === -1) ?
            routeProxy(req, res) :
            new Promise(function(resolve, reject) {
                req.on('close', resolve);
                req.on('finish', resolve);
                mount(req, res, function() {
                    resolve(routeProxy(req, res));
                });
            })
        ).then(function(cache) {
            res.writeHeader(cache.statusCode, cache.headers);
            res.end(cache.body);
        }).catch(resError);

        function resError(err) {
            if (err) log.error(err);
            if (err && !res.headersSent) {
                res.status(500);
                log.error(err);
                res.end('500 internal error.');
            }
        }
    });

    return server;
};
