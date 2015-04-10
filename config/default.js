'use strict';
var path = require('path');
module.exports = {
    db: {
        path: './db.level',
        config: {
            cacheSize: 64 * 1024 * 1024,
        },
    },
    registry: {
        public: 'http://registry.npmjs.org',
        private: 'http://npmcc.creditcloud.com',
    },
    tarballCacheDir: path.resolve(__dirname, '..', 'cache'),
    cachePublic: true,
    cachePrivate: true,
    replaceHost: [/http:\/\/registry\.npmjs\.org/g, 'http://cclab:7007'],
    server: {
        port: 7007,
    },
};
