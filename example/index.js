'use strict';
var config = require('./config');
var Server = require('../server');
var server = Server(config);
var Updater = require('../updater');
var updater = Updater(config);
server.listen(7000);
updater.run();
