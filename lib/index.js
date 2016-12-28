'use strict';

var feedManager = require('./feed_manager');

exports.logger = require('./logger');

exports.read = function(feed, result) {
	return feedManager.process(feed, result);
};
