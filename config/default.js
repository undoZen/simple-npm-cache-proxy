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
        public: 'http://registry.npmjs.org', // no tailing slash
        private: 'http://npmcc.creditcloud.com', // no tailing slash
    },
    cache: {
        public: true,
        private: true,
    },
    tarballCacheDir: path.resolve(__dirname, '..', 'cache'),
    replaceHost: [/http:\/\/registry\.npmjs\.org/g, 'http://218.241.199.27:7007'],
    server: {
        port: 7007,
    },
};
