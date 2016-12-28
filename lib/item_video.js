'use strict';

var utils = require('./utils');
var logger = require('./logger');
var _ = utils._;
var Promise = utils.Promise;
var Data = require('./data');
var internal = {};

exports.process = function(item, videos) {
	if (!videos || videos.length === 0) {
		return Promise.resolve();
	}
	item.websiteId = parseInt(item.websiteId);
	if (!item.imageId) {
		logger.warn('Video without imageId');
		return Promise.resolve();
	}
	videos.forEach(function(video) {
		video.websites = [item.websiteId];
		if (video.sourceId) {
			video.sourceId = video.sourceId.toString();
		}
	});

	var data = videos[0];
	data.id = Data.videos.Video.createId(data);

	return Data.videos.access.video(data.id)
		.then(function(dbVideo) {
			// video exists
			if (dbVideo) {
				return internal.updateVideo(dbVideo, item);
			}
			// is a new video
			return Data.videos.control.createVideo(data)
				.then(function(video) {
					item.videoId = video.id;
				});
		}).catch(function(error) {
			logger.error('Adding video error', error);
		});
};


internal.updateVideo = function(video, item) {
	// clear
	if (!video.websites || !_.isArray(video.websites)) {
		if (!video.websites) {
			video.websites = [];
		} else {
			video.websites = [parseInt(video.websites)];
		}
	}
	// set websiteId
	if (video.websites.indexOf(item.websiteId) < 0) {
		video.websites.push(item.websiteId);
		item.videoId = video.id;

		var params = {
			id: video.id,
			websites: video.websites
		};

		return Data.videos.control.updateVideo(params)
			.then(function() {
				logger.info('Updated video!', video);
			});
	}

	return Promise.resolve();
};
