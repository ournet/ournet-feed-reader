'use strict';

var feedManager = require('./feed_manager');

exports.logger = require('./logger');

exports.read = function(feed) {
	return feedManager.process(feed);
};
