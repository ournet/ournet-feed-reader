'use strict';

var feedManager = require('./feed_manager');
var Data = require('./data');

exports.logger = require('./logger');

exports.read = function(feed) {
	return feedManager.process(feed);
};

exports.updateFeed = function(feed) {
	return Data.news.control.updateFeed(feed);
};
