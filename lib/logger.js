'use strict';

var Logger = console;

exports.set = function(logger) {
	Logger = logger;
};

exports.info = function() {
	return Logger.info.apply(Logger, arguments);
};

exports.warn = function() {
	return Logger.warn.apply(Logger, arguments);
};

exports.error = function() {
	return Logger.error.apply(Logger, arguments);
};
