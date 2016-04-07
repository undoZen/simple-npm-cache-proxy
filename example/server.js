'use strict';
var config = require('./config');
var Server = require('simple-npm-cache-proxy/server');
var server = Server(config);
server.listen(7000);
