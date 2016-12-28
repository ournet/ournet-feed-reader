'use strict';

var utils = require('./utils');
var logger = require('./logger');
var Promise = utils.Promise;
var S3 = require('aws-sdk').S3;
var s3 = new S3();

exports.sizes = [{
	name: 'master',
	width: 1024,
	quality: 90
}, {
	name: 'large',
	width: 480,
	mode: null,
	quality: 80
}, {
	name: 'medium',
	width: 240,
	mode: null,
	quality: 80
}, {
	name: 'square',
	size: 90,
	crop: true,
	quality: 80
}];

function copyToStoriesById(key) {
	return exports.copy('news/' + key, 'stories/' + key)
		.catch(function(err) {
			if (err.code === 'SlowDown' && err.retryable) {
				return Promise.delay(1000).then(function() {
					return copyToStoriesById(key);
				});
			}
		});
}

exports.put = function(key, body) {
	return new Promise(function(resolve, reject) {
		s3.putObject({
			Bucket: process.env.S3_IMAGES_BUCKET,
			Key: key,
			CacheControl: 'public, max-age=' + (86400 * 30),
			ContentType: 'image/jpeg',
			Body: body,
			ACL: 'public-read'
		}, function(err) {
			if (err) {
				return reject(err);
			}
			resolve();
			//console.info('uploaded image', key);
		});
	});
};

exports.copy = function(sourceKey, key) {
	return new Promise(function(resolve, reject) {
		s3.copyObject({
			Bucket: process.env.S3_IMAGES_BUCKET,
			Key: key,
			CopySource: process.env.S3_IMAGES_BUCKET + '/' + sourceKey,
			CacheControl: 'public, max-age=' + (86400 * 60),
			ContentType: 'image/jpeg',
			ACL: 'public-read'
		}, function(err) {
			if (err) {
				return reject(err);
			}
			resolve();
		});
	});
};

exports.copyToStoriesById = function(id) {
	return Promise.resolve(exports.sizes).each(function(size) {
		var key = id.substr(0, 4) + '/' + size.name + '/' + id + '.jpg';
		return copyToStoriesById(key);
	}).catch(function(error) {
		logger.error('S3 Error', error);
		return Promise.reject(error);
	});
};
