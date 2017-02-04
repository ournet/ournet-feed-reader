'use strict';

var utils = require('./utils');
var logger = require('./logger');
var Promise = utils.Promise;
var TimeoutError = Promise.TimeoutError;
var feedReader = require('./feed_reader');
var feedItem = require('./feed_item');
var internal = {};
var Data = require('./data');

exports.process = function(feedId) {
	return internal.getFeed(feedId)
		.then(function(feed) {
			if (!feed) {
				return Promise.reject('Not found feed:' + feedId);
			}

			return internal.readFeed(feed)
				.then(function(result) {
					if (result) {
						return Data.news.control.updateFeed({
							id: feed.id,
							itemReadedAt: Date.now(),
							itemReadedHash: result.lastLinkHash
						});
					}
				})
				.catch(function(error) {
					if (error && error.message) {
						logger.error('feed error', error);
					}
					return Data.news.control.updateFeed({
						id: feed.id,
						readErrorAt: Date.now(),
						readError: error && error.message || ('Feed error: ' + feed.url)
					});
				});
		});
};

internal.readFeed = function(feed) {
	var feedResult;
	return feedReader.read(feed.url, {
			stopLinkHash: feed.itemReadedHash,
			limit: 20
		})
		.timeout(1000 * 10)
		.each(function(item) {
			return internal.processItem(item, feed)
				.then(function() {
					feedResult = {
						time: Date.now(),
						lastLinkHash: utils.md5(item.link)
					};
				})
				.timeout(1000 * 120)
				.catch(TimeoutError, function() {
					logger.error('Item TimeoutError: ' + item.link);
				})
				.catch(function(error) {
					if (error.message !== 'Invalid item' && error.message.indexOf('ESOCKETTIMEDOUT') === -1) {
						logger.error('Item error', error);
					}
				});
		}).then(function() {
			return feedResult;
		});
};

internal.getFeed = function(feed) {
	if (typeof feed === 'object') {
		return Promise.resolve(feed);
	}
	return Data.news.access.feed({ where: { _id: feed } });
};

internal.processItem = function(item, feed) {
	var page = {
		title: item.title,
		summary: item.description || item.summary,
		url: item.link,
		country: feed.country.toLowerCase(),
		lang: feed.lang.toLowerCase(),
		contentType: feed.contentType,
		publishedAt: (item.pubDate || item.date || new Date()),
		websiteId: feed.websiteId,
		content: item.content
	};
	if (page.publishedAt.getTime) {
		page.publishedAt = page.publishedAt.getTime();
	}

	// if (!page.summary || page.summary.length < 100) {
	//   return Promise.reject(new Error('Invalid item'));
	// }

	page.title = utils.clearNewsTitle(page.title, page.lang);
	page.summary = utils.clearNewsContent(page.summary, page.lang);
	if (page.content) {
		page.content = utils.clearNewsContent(page.content, page.lang);
		if (!page.summary || page.summary.length < 100 && page.summary.length < page.content.length) {
			page.summary = page.content;
		}
	}
	return feedItem.process(page);
};
