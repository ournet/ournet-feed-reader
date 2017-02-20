'use strict';

var utils = require('./utils');
var logger = require('./logger');
var _ = utils._;
var Promise = utils.Promise;
var TimeoutError = Promise.TimeoutError;
var htmlExplorer = require('html-explorer');
var itemImage = require('./item_image');
var itemVideo = require('./item_video');
var url = require('url');
var internal = {};
var stories = require('./stories_creator');
var quoteParser = require('quote-parser');
var Data = require('./data');
var inTextSearch = require('in-text-search');
var normalizeUrl = require('normalize-url');

exports.process = function(item) {
	var culture = {
		country: item.country,
		lang: item.lang
	};

	return htmlExplorer.explore(item.url, {
			page: {
				lang: item.lang,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36'
				},
				validator: function(page) {
					if (url.parse(page.href).path.length < 4) {
						throw new Error('Url is too short: ' + item.href);
					}
				},
				timeout: 1000 * 3
			},
			// content: false,
			images: {
				limit: 3,
				identify: true,
				data: true,
				timeout: 1500,
				filter: {
					minViewHeight: 180,
					minHidth: 300,
					minRatio: 0.5,
					maxRatio: 2.2,
					types: 'jpg'
				}
			},
			video: {
				limit: 1,
				filter: {
					minHidth: 400,
					minHeight: 260,
					extraSrc: /\.canal2\.md\/|\.prime\.md\//i
				},
				customFinders: require('./custom_video_finders')
			}
		})
		.timeout(1000 * 10)
		.catch(TimeoutError, function(error) {
			logger.error('explore item url TimeoutError' + item.url, error);
		})
		.then(function(page) {
			return internal.processPage(page, item, culture);
		});
};

internal.processPage = function(page, item, culture) {
	if (!page) {
		return null;
	}
	var originalUrl = item.url;
	item.url = page.canonical || page.href || item.url;
	item.url = internal.normalizeUrl(item.url);
	if (!item.url) {
		item.url = internal.normalizeUrl(originalUrl);
	}

	if (item.title.indexOf('�') > 0) {
		// utils.warn('item invalid title: ' + item.title);
		if (page.title && page.title.indexOf('�') < 0) {
			item.title = page.title;
		} else {
			return Promise.reject(new Error('Invalid item title ' + item.url));
		}
	}

	internal.normalizeItem(item, page, culture);

	item.id = Data.webdata.createWebPageId(item.url);

	if (!item.summary || item.summary.length < 100) {
		return Promise.reject(new Error('Invalid item'));
	}

	return Data.webdata.access.webpage({
			culture: culture,
			where: {
				_id: item.id
			}
		})
		.then(function(exists) {
			// if (exists) return Promise.reject(new Error('Webpage exists: ' + item.id));
			if (exists) {
				return Promise.resolve();
			}
			return internal.setItemData(item).then(function() {
				return itemImage.process(item, page.images)
					.then(function() {
						return itemVideo.process(item, page.videos)
							.then(function() {
								return Data.webdata.control.createWebPage(item)
									.then(function(webpage) {
										logger.info('+\tAdded news:', item.url);
										return stories.processWebPage(webpage)
											.timeout(parseInt(1000 * 60 * 1.5))
											.catch(TimeoutError, function() {
												logger.error('stories.processWebPage TimeoutError: ' + item.url);
											})
											.then(function() {

											});
									});
							});
					});
			});
		});
};

internal.normalizeItem = function(item, page, culture) {
	item.url = decodeURIComponent(item.url);
	if (item.images) {
		item.images.forEach(function(it) {
			it.src = decodeURIComponent(it.src);
		});
	}
	if (item.videos) {
		item.videos.forEach(function(it) {
			it.sourceId = decodeURIComponent(it.sourceId);
		});
	}

	item.title = utils.clearNewsTitle(item.title, culture.lang);
	item.summary = utils.clearNewsContent(item.summary, culture.lang);
	item.content = utils.clearNewsContent(item.content, culture.lang);
	item.pageContent = page.content = utils.clearNewsContent(page.content, culture.lang);
	item.pageContent = page.content = utils.clearPageContent(page.content, culture.lang);

	if (page.description && (!item.summary || item.summary && page.description.length > item.summary.length)) {
		item.summary = page.description;
	}
	if (item.content && (!item.summary || item.summary.length < 300 && item.summary.length < item.content.length)) {
		item.summary = item.content;
	}
	if (page.content && (!item.summary || item.summary.length < 300 && item.summary.length < page.content.length)) {
		if (inTextSearch(page.content).search(item.title) > 0.8) {
			item.summary = page.content;
		}
	}

	item.summary = utils.clearNewsContent(item.summary, culture.lang);
};

internal.setItemData = function(item) {
	var context = {
		text: [item.title, item.content || item.summary].join('\n'),
		lang: item.lang,
		country: item.country
	};

	return internal.setItemTopics(context, item)
		.timeout(1000 * 30)
		.then(function() {
			return internal.setItemQuotes(context, item);
		})
		.catch(TimeoutError, function() {
			logger.error('setItemData TimeoutError');
		});
};

internal.setItemQuotes = function(context, item) {
	if (!item.topics || item.topics.length === 0) {
		return Promise.resolve();
	}
	var topics = item.topics.filter(function(topic) {
		return topic.type === 1;
	});

	if (topics.length === 0) {
		return Promise.resolve();
	}

	var persons = [],
		quotes;

	topics.forEach(function(topic) {
		if (!topic.concepts) {
			logger.warn('TOPIC CONCEPTS IS NULL', topic);
			return;
		}
		topic.concepts.forEach(function(concept) {
			persons.push({
				id: topic.id,
				key: topic.key,
				name: topic.name,
				uniqueName: topic.uniqueName,
				category: topic.category,
				index: concept.index,
				abbr: topic.abbr
			});
		});
	});

	// console.info('context', context);
	try {
		quotes = quoteParser.parse(context.text, context.lang, {
			persons: persons
		}) || [];
	} catch (e) {
		return Promise.reject(e);
	}

	if (quotes.length > 0) {
		item.quotes = [];
		item.uniqueName = item.uniqueName || Data.webdata.createWebPageUniqueName(item.title);
		return Promise.resolve(quotes)
			.each(function(q) {
				q.webpage = item;
				q.topics = [];
				q.category = item.category;

				if (!q.author) {
					return null;
				}

				if (!q.author || !q.author.id || !item.country || !item.lang) {
					logger.error('INVALID QUOTE', _.pick(q, 'text', 'author', 'country', 'lang'));
					return null;
				}

				item.topics.forEach(function(topic) {
					if (!topic.concepts) {
						logger.error('No concepts for topic:' + topic.name);
						return;
					}
					for (var i = topic.concepts.length - 1; i >= 0; i--) {
						var concept = topic.concepts[i];
						if (concept.index >= q.index && concept.index < q.index + q.text.length) {
							q.topics.push(topic);
							break;
						}
					}
				});

				q.id = Data.quotes.Quote.createId(q);

				return Data.quotes.access.quote(q.id)
					.then(function(dbQuote) {
						item.quotes = item.quotes || [];
						// quote exists
						if (dbQuote) {
							if (item.quotes.indexOf(q.id) < 0) {
								item.quotes.push(q.id);
							}
						} else {
							// create quote
							return Data.quotes.control.createQuote(q)
								.then(function(quote) {
									item.quotes.push(quote.id);
									quote = _.clone(quote);
									if (!quote.authorId || !quote.country || !quote.lang) {
										var quoteError = new Error('Invalid quote: cannot add to webdata: ' + quote.id);
										quoteError.quote = quote;
										return Promise.reject(quoteError);
									}
									return Data.webdata.control.createQuote(quote);
								});
						}
					})
					.catch(function(error) {
						logger.error('Quote create error', error);
					});
			});
	}
	return Promise.resolve();
};

internal.setItemTopics = function(context, item) {

	var entityTypes = {
		person: 1,
		place: 2,
		group: 3,
		brand: 4,
		arts: 5
	};

	function createTopics(entities) {
		entities = entities || [];
		if (!entities.map) {
			logger.error('entities no map', entities);
			entities = [];
		}
		return entities.map(function(entity) {
			if (entity.type) {
				entity.type = entityTypes[entity.type];
			}
			entity.uniqueName = entity.slug;
			entity.country = entity.country || context.country;
			entity.lang = entity.lang || context.lang;
			entity.key = entity.slug_key || Data.entities.Entity.createSlugKey(entity);

			delete entity.slug;
			delete entity.slug_key;
			delete entity.keys;
			// delete entity.concepts;

			return entity;
		});
	}
	//console.info('concepts', concepts);
	return Data.entities.extractor.fromContext(context)
		.then(function(entities) {
			var topics = createTopics(entities);
			item.topics = _.take(topics, 10);
			topics = topics.filter(function(it) {
				return it.category;
			});
			// console.info('topics', topics, item.title);
			// throw new Error('STOP');
			if (!topics || topics.length === 0) {
				return;
			}
			var grouped = _.groupBy(topics, 'category');
			var max = -1;
			for (var category in grouped) {
				var c = grouped[category].length;
				if (c > max) {
					max = c;
					item.category = parseInt(category);
				}
			}
		});
};

internal.normalizeUrl = function(link) {
	link = url.parse(link);
	if (link.path.indexOf('//') === 0) {
		link.path = link.path.substr(1);
	}
	if (!link.host || link.host.length < 4) {
		return null;
	}
	link.host = link.host.replace(/\//g, '');

	link = 'http://' + link.host + link.path;

	link = normalizeUrl(link, {
		normalizeProtocol: true,
		normalizeHttps: false,
		stripFragment: true,
		stripWWW: false,
		removeQueryParameters: [/^utm_\w+/i],
		removeTrailingSlash: false,
		removeDirectoryIndex: false
	});

	return link;
};
