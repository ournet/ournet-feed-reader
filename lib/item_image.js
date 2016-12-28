'use strict';

var utils = require('./utils');
var logger = require('./logger');
var _ = utils._;
var Promise = utils.Promise;
var dhash = require('dhash');
var internal = {};
var gm = require('gm');
var s3 = require('./s3');
var Data = require('./data');

exports.process = function(item, images) {
	if (!images || images.length === 0) {
		return Promise.resolve();
	}

	return Promise.resolve(images)
		.each(function(image) {
			return internal.fillImage(image).catch(function() {});
		}).then(function() {
			images = images.filter(function(image) {
				return image.dhash;
			});

			images = _.take(images, 2);

			return Promise.resolve(images)
				.each(function(image) {
					if (item.imageId) {
						return null;
					}
					image.length = image.length || image.data.length;
					image.id = Data.webdata.createImageId(image);
					return Data.webdata.access.image(image.id)
						.then(function(dbImage) {
							if (dbImage && dbImage.websites.indexOf(item.websiteId) > -1) {
								//console.info('dbImage', dbImage);
								return null;
							}
							return internal.uploadImage(image)
								.then(function() {
									return internal.saveImage(image, dbImage, item)
										.then(function() {
											item.imageId = image.id;
										});
								})
								.catch(function(error) {
									logger.error('error', error);
								});
						});
				});
		});
};

internal.saveImage = function(image, dbImage, item) {
	delete image.data;
	if (dbImage) {
		return Data.webdata.control.addWebsiteToImage(image.id, item.websiteId);
	}
	image.websites = [item.websiteId];
	return Data.webdata.control.createImage(image);
};

internal.uploadImage = function(image) {
	var sizes = s3.sizes;

	return Promise.map(sizes, function(size) {
		var stream;
		if (size.crop) {
			stream = internal.squareImageResize(image.data, size.size, size.quality);
		} else {
			if (image.width > size.width) {
				stream = internal.simpleImageResize(image.data, size.width, size.height, size.mode, size.quality);
			} else {
				stream = Promise.resolve(image.data);
			}
		}
		var key = 'news/' + image.id.substr(0, 4) + '/' + size.name + '/' + image.id + '.jpg';
		return stream.then(function(body) {
			return internal.uploadImageBody(key, body);
		});
	}, {
		concurrency: 4
	});
};

internal.simpleImageResize = function(data, width, height, mode, quality) {
	return new Promise(function(resolve, reject) {
		gm(data)
			.noProfile()
			.quality(quality || 90)
			.resize(width, height, mode || '>')
			.toBuffer('jpg', function(error, stream) {
				if (error) {
					return reject(error);
				}
				resolve(stream);
			});
	});
};

internal.squareImageResize = function(data, size, quality) {
	return new Promise(function(resolve, reject) {
		gm(data)
			.noProfile()
			.quality(quality || 90)
			.resize(size, size, '^')
			.gravity('Center')
			.crop(size, size)
			.toBuffer('jpg', function(error, stream) {
				if (error) {
					return reject(error);
				}
				resolve(stream);
			});
	});
};

internal.uploadImageBody = function(key, body) {
	return s3.put(key, body);
};

internal.fillImage = function(image) {
	return new Promise(function(resolve, reject) {
		image.length = image.data.length;
		if (image.length < 5000) {
			return reject(new Error('Image is too small: ' + image.length));
		}
		try {
			dhash(image.data, function(error, hash) {
				if (error) {
					return reject(error);
				}
				image.dhash = hash.toLowerCase();
				resolve();
			});
		} catch (e) {
			reject(e);
		}
	});
};
