'use strict';

var utils = require('./utils');
var logger = require('./logger');
var _ = utils._;
var Promise = utils.Promise;
var md5 = utils.md5;
var FeedParser = require('feedparser');
var request = require('request');
var Url = require('url');
var charset = require('charset');
var DecodingStream = require('./decoding_stream');
var normalizeUrl = require('normalize-url');

var ITEM_NAMES = ['title', 'description', 'summary', 'content'];
var ITEM_CONTENT_NAMES = ['yandex:full-text'];

function normalize(item) {
	delete item.meta;
	var link = Url.parse(item.link);
	if (link.path.indexOf('//') === 0) {
		link.path = link.path.substr(1);
	}
	if (!link.host) {
		return null;
	}
	link.host = link.host.replace(/\//g, '');
	if (!link.host || link.host.length < 3) {
		logger.error('Feed item invalid host: ' + item.link, item, true);
		return null;
	}
	item.link = 'http://' + link.host + link.path;

	item.link = normalizeUrl(item.link, {
		normalizeProtocol: true,
		normalizeHttps: false,
		stripFragment: true,
		stripWWW: false,
		removeQueryParameters: [/^utm_\w+/i],
		removeTrailingSlash: false,
		removeDirectoryIndex: false
	});

	item.pubdate = item.pubDate = item.pubDate || item.date || Date.now();
	if (isNaN(item.pubDate) || !_.isNumber(item.pubDate) && !_.isDate(item.pubDate)) {
		item.pubdate = item.pubDate = Date.now();
	}

	if (new Date(item.pubdate) > new Date()) {
		item.pubdate = item.pubDate = Date.now();
	}

	ITEM_CONTENT_NAMES.forEach(function(cname) {
		if (item[cname]) {
			item.content = item[cname]['#'];
		}
	});

	if (!item.title) {
		return null;
	}
	if (item.title.indexOf('�') > 0) {
		logger.warn('item invalid title: ' + item.link + ' - ' + item.title);
		return null;
	}

	item.title = item.title.replace(/[\t\n\r]/g, ' ').trim();

	ITEM_NAMES.forEach(function(name) {
		if (item[name]) {
			item[name] = utils.html.decode(item[name]);
			item[name] = utils.html.strip(item[name]);
			item[name] = utils.text.normalize(item[name]);
		}
	});

	return item;
}

exports.read = function(url, options) {
	logger.info('Feed: reading ', url);
	options = _.defaults(options || {}, {
		limit: 20,
		interval: 1000 * 60 * 60 * 24 // hours
	});

	var encoding = 'utf8';

	var urlHost = Url.parse(url).host;

	var encodings = {
		'windows-1251': ['dariknews.bg', 'fontanka.ru', 'gazeta.ru', '5-tv.ru', 'novayagazeta.ru'],
		'iso-8859-2': ['money.pl', 'sonline.hu', 'beol.hu', 'ma.hu', 'origo.hu', 'bama.hu', 'ilmessaggero.it', 'life.hu', 'kemma.hu', 'www.kemma.hu', 'vg.hu', 'www.vg.hu'],
		'iso-8859-1': ['sardegnaoggi.it', 'www.sardegnaoggi.it']
	};

	Object.keys(encodings).forEach(function(enc) {
		for (var i = encodings[enc].length - 1; i >= 0; i--) {
			var host = encodings[enc][i];
			if (host === urlHost || urlHost.indexOf('.' + host, urlHost.length - (host.length + 1)) !== -1) {
				encoding = enc;
				break;
			}
		}
	});
	var decodingStream = new DecodingStream();
	if (encoding !== 'utf8') {
		decodingStream.decSetEncoding(encoding);
	}


	return new Promise(function(resolve, reject) {
		var req = request({
			url: url,
			timeout: 1000 * 5,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36'
			},
			pool: false
		});
		req.on('error', reject);

		var items = [];
		var resolved = false;
		var feedparser = new FeedParser({
			addmeta: false
		});

		feedparser.on('error', reject);
		req.pipe(decodingStream).pipe(feedparser);

		feedparser.on('meta', function(meta) {
			encoding = meta['#xml'].encoding;
			if (encoding && encoding.toLowerCase() !== 'utf-8') {
				//utils.warn('encoding: ' + encoding);
				decodingStream.decSetEncoding(encoding);
			}
		});

		req.on('response', function(res) {
			// var stream = this;

			if (res.statusCode < 200 || res.statusCode > 399) {
				return this.emit('error', new Error('Bad status code: ' + res.statusCode));
			}
			encoding = charset(res.headers['content-type']);
			decodingStream.decSetEncoding(encoding);
			// stream.pipe(decodingStream).pipe(feedparser);
		});

		function end() {
			if (resolved) {
				//console.info('Already ended', url);
				return;
			}
			//console.info('Ending feed reading', url);
			resolved = true;
			items.reverse();
			resolve(items);
		}
		var stopReading = false;
		feedparser.on('readable', function() {
			//console.info('readable', url);
			// This is where the action is!
			var
				stream = this,
				// meta = this.meta,
				item, date, now = Date.now();

			/*eslint no-cond-assign:0*/
			while (item = stream.read()) {
				if (resolved || stopReading) {
					continue;
				}
				//console.info('stopReading', stopReading, item.link);
				item = normalize(item);
				if (!item) {
					continue;
				}
				if (options.stopLinkHash === md5(item.link)) {
					//console.info('Item already readed!', url);
					stopReading = true;
					continue;
				}
				date = new Date(item.pubdate || item.pubDate || item.date);
				if (date && options.interval && options.interval < now - date.getTime()) {
					//console.info('Item is too old!', url);
					stopReading = true;
					continue;
				}
				items.push(item);
				if (options.limit === items.length) {
					//console.info('Feed limit!', url);
					stopReading = true;
					continue;
				}
			}
		});

		feedparser.on('end', end);
	});
};
