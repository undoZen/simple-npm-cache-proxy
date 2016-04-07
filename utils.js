'use strict';
global.Promise = require('bluebird');
var _ = require('lodash');

var defaultStCacheOptions = {
    fd: {
        max: 1000,
        maxAge: 1000 * 60 * 60,
    },
    stat: false,
    content: {
        max: 1024 * 1024 * 64,
        maxAge: 1000 * 60 * 10,
        cacheControl: 'public, max-age=600'
    },
};
exports.defaultStCacheOptions = defaultStCacheOptions;

exports.matchUpstream = matchUpstream;
function matchUpstream(upstreams, url) {
    return upstreams.filter(upstream => {
        return upstream &&
            upstream.urlExp instanceof RegExp &&
            upstream.urlExp.exec(url);
    })[0];
}

exports.replaceBodyRegistry = replaceBodyRegistry;
function replaceBodyRegistry(replace, body) {
    return body.replace(replace[0], replace[1]);
}

exports.xtend = xtend;
function xtend() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift({});
    return _.assign.apply(_, args);
}

exports.sleep = sleep;
function sleep(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

exports.pickHeaders = pickHeaders;
function pickHeaders(headers) {
    return _.pick(headers, [
        'etag',
        'content-type',
        'content-length',
    ]);
}

exports.randomInterval = randomInterval;
function randomInterval(config) {
    var interval = config.updateInterval || 2000;
    return function () {
        return interval * (Math.random() * 0.4 + 0.8)
    };
}
