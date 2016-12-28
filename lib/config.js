'use strict';

var MIN_IMPORTANT_NEWS = parseInt(process.env.MIN_IMPORTANT_NEWS) || 20;
var MIN_STORY_NEWS = parseInt(process.env.MIN_STORY_NEWS) || 4;

module.exports = {
	minStoryNews: function(country) {
		if (country === 'md') {
			return MIN_STORY_NEWS - 1;
		}
		return MIN_STORY_NEWS;
	},

	importantNewsCount: function(country) {
		if (country === 'md') {
			return MIN_IMPORTANT_NEWS - 4;
		}
		return MIN_IMPORTANT_NEWS;
	}
};
