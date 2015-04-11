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
        taobao: 'http://registry.npm.taobao.org', // no tailing slash
    },
    cache: {
        public: true,
        private: true,
        taobao: true,
    },
    tarballCacheDir: path.resolve(__dirname, '..', 'cache'),
    replaceHost: [/http:\/\/registry\.npmjs\.org/g, 'http://localhost:7007'],
    server: {
        port: 7007,
    },
};
