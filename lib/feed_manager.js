'use strict';

var utils = require('./utils');
var logger = require('./logger');
var Promise = utils.Promise;
var TimeoutError = Promise.TimeoutError;
var feedReader = require('./feed_reader');
var feedItem = require('./feed_item');
var internal = {};

exports.process = function(feed, result) {
	var feedResult;
	return feedReader.read(feed.url, {
			stopLinkHash: feed.itemReadedHash,
			limit: 20
		})
		.timeout(1000 * 10)
		.each(function(item) {
			return internal.processItem(item, feed, result)
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

internal.processItem = function(item, feed, result) {
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
	return feedItem.process(page, result);
};
