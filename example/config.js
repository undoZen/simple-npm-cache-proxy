'use strict';
var path = require('path');
module.exports = {
    redis: 'redis://127.0.0.1:6379/5',
    updateInterval: 2000,
    tarballCacheDir: path.join(__dirname, 'cache'),
    upstreams: [
        {
            name: 'private',
            urlExp: /^\/(-\/user\/|enjoy-).*$/i,
            proxyTo: 'http://localhost:4873',
            replace: [/http:\/\/localhost:4873/g, 'http://localhost:7000'],
            cache: false,
        }, {
            name: 'official',
            urlExp: /.*/,
            proxyTo: 'https://registry.npmjs.org',
            replace: [/https:\/\/registry\.npmjs\.org/g, 'http://localhost:7000'],
            cache: true,
        }
    ],
    stCacheOptions: {
        // refer to https://www.npmjs.com/package/st
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
    },
};
