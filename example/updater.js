'use strict';
var config = require('./config');
var Updater = require('simple-npm-cache-proxy/updater');
var updater = Updater(config);
updater.run();
