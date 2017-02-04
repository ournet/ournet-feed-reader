'use strict';

var News = require('ournet.data.news');
var entitizer = {
	storage: require('entitizer.entities-storage'),
	Extractor: require('entitizer.entities-extractor')
};
var Stories = require('ournet.data.stories');
var Quotes = require('ournet.data.quotes');
var Videos = require('ournet.data.videos');

var news = {
	access: News.getAccessService(),
	control: News.getControlService()
};

exports.websites = news;

exports.entities = {
	extractor: entitizer.Extractor,
	Entity: entitizer.storage.Entity,
	EntityName: entitizer.storage.EntityName
};

exports.webdata = {
	access: news.access,
	control: news.control,
	createImageId: News.createImageId,
	createWebPageId: News.createWebPageId,
	createWebPageUniqueName: News.createWebPageUniqueName,
	search: News.Search
};

exports.news = exports.webdata;

exports.stories = {
	access: new Stories.AccessService(),
	control: new Stories.ControlService(),
	search: Stories.Search
};

exports.quotes = {
	access: new Quotes.AccessService(),
	control: new Quotes.ControlService(),
	Quote: Quotes.Quote
};

exports.videos = {
	access: new Videos.AccessService(),
	control: new Videos.ControlService(),
	Video: Videos.Video
};
