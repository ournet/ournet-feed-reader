'use strict';

var utils = require('./utils');
var logger = require('./logger');
var _ = utils._;
var Promise = utils.Promise;
var TimeoutError = Promise.TimeoutError;
var internal = {};
var s3 = require('./s3');
var config = require('./config');
var Data = require('./data');
var inTextSearch = require('in-text-search');

var MIN_SCORE = process.env.SEARCH_MIN_SCORE;

if (MIN_SCORE) {
	MIN_SCORE = parseFloat(MIN_SCORE);
} else {
	MIN_SCORE = 1.2;
}

exports.processWebPage = function(webpage) {
	if (!webpage.topics || webpage.topics.length === 0) {
		return Promise.resolve();
	}

	var params = {
		q: webpage.title,
		country: webpage.country,
		lang: webpage.lang,
		/*eslint camelcase:0*/
		min_score: MIN_SCORE
			//ignoreId: webpage.id || webpage._id
	};

	// if (params.q.length < 120)
	//   params.q += ' ' + webpage.summary.substr(0, 120 - params.q.length);

	return Data.webdata.search.searchWebPages(params)
		.timeout(1000 * 5)
		.then(function(docs) {
			if (docs.length === 0) {
				return null;
			}
			return internal.processWebPages(webpage, docs);
		})
		.catch(TimeoutError, function() {
			logger.error('searchWebPages TimeoutError');
		});
};

internal.processWebPages = function(webpage, docs) {
	docs = docs.filter(function(doc) {
		return doc.id !== webpage.id;
	});
	if (docs.length === 0) {
		return null;
	}

	var docsWithStory = docs.filter(function(doc) {
		return utils.isNotNull(doc.storyId);
	});

	if (docsWithStory.length > 0) {
		return internal.updateStory(docsWithStory[0].storyId, webpage)
			.timeout(1000 * 30)
			.delay(1000 * 3)
			.catch(TimeoutError, function() {
				logger.error('updateStory TimeoutError');
			});
	}

	docs.push(webpage);

	if (docs.length < config.minStoryNews(webpage.country, webpage.lang)) {
		return null;
	}

	return internal.createStory(docs)
		.timeout(1000 * 30)
		.delay(1000 * 3)
		.catch(TimeoutError, function() {
			logger.error('createStory TimeoutError');
		});
};

internal.updateStory = function(storyId, webpage) {
	logger.info('updating story...');
	var searchUpdate = Data.webdata.search.updateWebPage(webpage.id || webpage._id, {
		storyId: storyId
	});

	searchUpdate.then(function() {
		webpage.storyId = storyId;
		//return Data.webdata.search.refresh();
	});

	return Data.stories.access.story(storyId, { params: { AttributesToGet: ['id', 'countNews', 'importantKey', 'culture', 'createdAt'] } })
		.then(function(dbStory) {
			if (!dbStory || !dbStory.countNews) {
				logger.error('No story', storyId);
				return null;
			}
			dbStory.createdAt = new Date(dbStory.createdAt).getTime();

			// story is too old
			if (dbStory.createdAt < Date.now() - 1000 * 3600 * 24) {
				logger.warn('Story ' + dbStory.id + ' is too old for adding new news');
				return null;
			}

			var updateQuotesStory = Promise.resolve(webpage.quotes || [])
				.map(function(qid) {
					return Data.quotes.control.updateQuote({
						id: qid,
						storyId: storyId
					}).then(function() {
						logger.info('updated quote storyId', qid, storyId);
					}).catch(function(error) {
						logger.error('error on updating quote storyId', error, true);
					});
				});

			var storyData = {
				id: storyId,
				countNews: {
					$add: 1
				}
			};

			if (!dbStory.importantKey && dbStory.countNews >= config.importantNewsCount(webpage.country)) {
				storyData.importantKey = dbStory.culture;
				logger.warn('Updated story ' + dbStory.id + ' to important story!');
			}

			if (webpage.quotes && webpage.quotes.length > 0) {
				storyData.quotes = {
					$add: webpage.quotes
				};
			}

			var storyUpdate = Data.stories.control.updateStory(storyData);

			var updateWebPageStory = internal.setNewsStoryId(webpage, storyId);

			return Promise.all([searchUpdate, storyUpdate, updateQuotesStory, updateWebPageStory])
				.then(function() {
					if (webpage.videoId) {
						return Data.stories.control.updateStory({
							id: storyId,
							videos: {
								$add: webpage.videoId
							}
						}).catch(function(error) {
							logger.error('Error on updating story videos', error);
						});
					}
				})
				.then(function() {
					return Data.stories.access.story(storyId, { params: { AttributesToGet: ['id', 'country', 'lang', 'countNews', 'importantKey', 'quotes', 'videos'] } })
						.then(function(story) {
							if (story.importantKey) {
								story.isImportant = true;
							}
							return Data.webdata.control.updateStory(story);
						});
				});

		});
};

internal.createStory = function(docs) {
	logger.info('creating story...');
	var image;
	var category;
	var categories = {};
	var topics = [];
	var quotes = [];
	var videos = [];
	docs = _.sortBy(docs, function(doc) {
		if (doc.quotes) {
			quotes = quotes.concat(doc.quotes);
		}
		if (doc.category) {
			if (categories[doc.category]) {
				categories[doc.category]++;
			} else {
				categories[doc.category] = 1;
			}
		}
		if (!image && doc.imageId) {
			image = {
				id: doc.imageId,
				host: doc.host
			};
		}
		if (doc.topics) {
			topics = topics.concat(doc.topics);
		}
		if (doc.videoId) {
			videos.push(doc.videoId);
		}
		return doc.summary.length;
	});

	docs.reverse();

	if (topics.length === 0) {
		logger.warn('Stop story. Docs contains no topics!');
		return Promise.resolve();
	}
	if (!image || !image.id) {
		logger.warn('Stop story. Docs contains no image!');
		return Promise.resolve();
	}

	topics = _.groupBy(topics, 'id');

	topics = Object.keys(topics).map(function(id) {
		topics[id][0].rating = topics[id].length;
		return topics[id][0];
	});

	topics = topics.filter(function(topic) {
		return topic.rating > 1;
	});

	if (topics.length === 0) {
		logger.warn('Stop story. Docs contains no topics! 2');
		return Promise.resolve();
	}

	topics = _.sortBy(topics, 'rating');
	topics.reverse();

	topics = _.take(topics, 6);

	// console.info('topics', topics);

	var doc = docs[0];
	var max = -1;
	for (var prop in categories) {
		if (categories[prop] > max) {
			max = categories[prop];
			category = parseInt(prop);
		}
	}

	var story = {
		title: internal.getStoryTitle(docs, doc.summary),
		summary: doc.summary,
		countNews: docs.length,
		host: doc.host,
		path: doc.path,
		webpageId: doc.id || doc._id,
		country: doc.country,
		lang: doc.lang,
		news: [],
		category: category,
		uniqueName: doc.uniqueName,
		topics: topics,
		videos: videos,
		countShares: 0
	};

	if (story.countNews >= config.importantNewsCount(story.country)) {
		story.importantKey = [story.country, story.lang].join('_');
		logger.warn('Creating important story...');
	}

	if (doc.imageId) {
		story.imageId = doc.imageId;
		story.imageHost = doc.host;
	} else if (image) {
		story.imageId = image.id;
		story.imageHost = image.host;
	}

	for (var i = 1; i < docs.length && i < 6; i++) {
		var item = docs[i];
		story.news.push(item);
	}

	function updateQuotesStoryId(storyId) {
		return Promise.resolve(quotes).map(function(qid) {
			return Data.quotes.control.updateQuote({
				id: qid,
				storyId: storyId
			}).then(function() {
				logger.info('updated quote storyId', qid, storyId);
			}).catch(function(error) {
				logger.error('error on updating quote storyId', error);
			});
		});
	}

	return Data.stories.control.createStory(story)
		.then(function(dbStory) {
			if (!dbStory) {
				return null;
			}
			logger.info('created story', dbStory.id, dbStory.imageId);

			function copyStoryImage() {
				if (story.imageId) {
					return s3.copyToStoriesById(story.imageId);
				}
				return Promise.resolve();
			}

			return copyStoryImage().then(function() {
				return updateQuotesStoryId(dbStory.id)
					.then(function() {
						return Promise.resolve(docs).map(function(oneDoc) {
								return Data.webdata.search.updateWebPage(oneDoc.id || oneDoc._id, {
									storyId: dbStory.id
								});
							})
							.then(function() {
								return internal.setNewsStoryId(docs, dbStory.id)
									.then(function() {
										return Data.webdata.control.createStory(dbStory);
									});
							});
					});
			});
		});
};

internal.setNewsStoryId = function(news, storyId) {
	if (!_.isArray(news)) {
		news = [news];
	}
	return Promise.map(news, function(item) {
		return Data.webdata.control.updateWebPage({
			id: item.id,
			country: item.country,
			lang: item.lang,
			storyId: storyId
		});
	});
};

internal.getStoryTitle = function(docs, summary) {
	var r;
	var title = docs[0].title;

	docs = _.sortBy(docs, function(doc) {
		return doc.title.length;
	});
	var list = docs.filter(function(item) {
		r = (utils.text.countUpperLetters(item.title) / (utils.text.countLetters(item.title) || 1)) * 100;
		return item.title.length > 40 && item.title.length < 170 && r < 20;
	});
	if (list.length === 0) {
		return docs[0].title;
	}

	var textSearch = inTextSearch(summary);

	for (var i = 0; i < list.length; i++) {
		if (textSearch.search(list[i].title) >= 0.9) {
			return list[i].title;
		}
	}

	return title;

	// list = _.sortBy(list, function(item) {
	// 	return item.title.length;
	// });

	// return list[0].title;
};
