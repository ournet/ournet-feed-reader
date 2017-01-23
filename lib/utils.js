'use strict';

var utils = require('ournet.utils');
var _ = require('lodash');
var Promise = require('bluebird');
var crypto = require('crypto');
utils.text = require('./text');

var INVALID_CONTENT = [{
	reg: /^Cite[șs]te mai mult/i,
	type: 'invalid'
}, {
	reg: /^Moldova Azi - breaking news/i,
	type: 'invalid'
}, {
	reg: /Adresa ta de email nu va fi/i,
	type: 'invalid'
}, {
	reg: /\bВсе права защищены\b/i,
	type: 'invalid'
}, {
	reg: /^(foto|фото)\s*:\s*(noi\.md)\b/i,
	type: 'start'
}, {
	reg: /^cite[sș]te [sș]tirea complet[aă] pe (a1\.ro)\b/i,
	type: 'start'
}, {
	reg: /^\/КРОСС\//i,
	type: 'start'
}, {
	reg: /^comentarii,\s+/i,
	type: 'start'
}, {
	reg: /\bПохожие статьи\b/i,
	type: 'end'
}, {
	reg: /\bЧита[йи]те также\b/i,
	type: 'end'
}, {
	reg: /\bRelated (Posts|Articles|News|Stories)\b/i,
	type: 'end'
}, {
	reg: /\bhistorias relacionadas\b/i,
	type: 'end'
}, {
	reg: /\bCite[sș]te [sș]i:/i,
	type: 'end'
}, {
	reg: /\bDalší články k tématu\b/i,
	type: 'end'
}, {
	reg: /\bОще по темата\b/i,
	type: 'end'
}, {
	reg: /\bDe acela[şs]i autor\b/i,
	type: 'end'
}, {
	reg: /\b[sș]tiri pe aceea[sș]i tem[aă]\b/i,
	type: 'end'
}, {
	reg: /([\(\[][ ]*)?\bcite[sș]te mai (departe|mult)\b/i,
	type: 'end'
}, {
	reg: /([\(\[][ ]*)?\bcite[sș]te articolul pe\b/i,
	type: 'end'
}, {
	reg: /Dac[ăa] [tţ]i-a pl[aă]cut articolul\b/i,
	type: 'end'
}, {
	reg: /Be the first of your friends/i,
	type: 'end'
}, {
	reg: /\bTags:/i,
	type: 'end'
}, {
	reg: /Alte articole( \w+)? pe aceeasi tema/i,
	type: 'end'
}, {
	reg: /\bNOTA: Va rugam sa comentati la obiect/i,
	type: 'end'
}, {
	reg: /\bNOT[AĂ]: V[ăa] rug[ăa]m s[ăa] folosi[tț]i/i,
	type: 'end'
}, {
	reg: /Post-ul /,
	type: 'end'
}, {
	reg: /See more at/i,
	type: 'end'
}, {
	reg: /\sPostat pe \d+/i,
	type: 'end'
}, {
	reg: /\[\.\.\.\]$/,
	type: 'end'
}, {
	reg: /(,\s*)?-\s*hotnews,/,
	type: 'end'
}, {
	reg: /, stiri, realitatea/i,
	type: 'end'
}, {
	reg: /\sFigyelem!/,
	type: 'end'
}, {
	reg: /\sThe post /,
	type: 'end'
}, {
	reg: /\sArticolul .+ apare /,
	type: 'end'
}];

var INVALID_TITLE = [{
	reg: /\s(\/\/|\||\/)\s*.{2,15}$/i,
	type: 'end'
}, {
	reg: /^\(\s*(video|foto|doc|doc[,-]\s*foto|video[,-]\s*foto|audio|galerie foto|ВИДЕО)\s*\)\s*[:\/-]?/i,
	type: 'start'
}, {
	reg: /^.{2,15}(\/\/|\||\/)\s/i,
	type: 'start'
}, {
	reg: /^(BREAKING NEWS|LIVE|RECENZE|Primele Stiri|VIDEO ZF Live)\s*[:\/-]/i,
	type: 'start'
}, {
	reg: /[-]?\s*\((foto|video)\)$/i,
	type: 'end'
}, {
	reg: /\s+-\s*(foto|video)$/i,
	type: 'end'
}];

exports.md5 = function(value) {
	return crypto.createHash('md5').update(value, 'utf8').digest('hex');
};

exports.clearNewsTitle = function(text, lang) {
	if (!text) {
		return text;
	}
	text = utils.html.decode(text).replace(/&nbsp;/g, ' ');
	text = text.replace(/\u00A0/g, ' ');
	text = text.trim().replace(/\s{2,}/g, ' ').trim();
	text = utils.text.correct(text, lang);

	for (var i = 0; i < INVALID_TITLE.length; i++) {
		var it = INVALID_TITLE[i];
		var result = it.reg.exec(text);
		if (result) {
			if (it.type === 'start') {
				text = text.substr(result[0].length).trim();
			} else if (it.type === 'end') {
				text = text.substr(0, result.index).trim();
			}
			return text.trim();
		}
	}

	return text.trim();
};

exports.clearNewsContent = function(text, lang) {
	if (!text) {
		return text;
	}
	text = text.replace(/&nbsp;/g, ' ');
	text = utils.html.decode(text).replace(/&nbsp;/g, ' ');
	text = utils.html.strip(text);
	text = utils.html.stripComments(text).trim();
	text = text.replace(/\u00A0/g, ' ');
	text = text.trim().replace(/ {2,}/g, ' ').trim();
	text = text.trim().replace(/ ([,;:])/g, '$1').trim();
	text = utils.text.correct(text, lang);

	for (var i = 0; i < INVALID_CONTENT.length; i++) {
		var it = INVALID_CONTENT[i];
		var result = it.reg.exec(text);
		if (result) {
			switch (it.type) {
				case 'invalid':
					return null;
				case 'start':
					text = text.substr(result[0].length).trim();
					break;
				case 'end':
					return text.substr(0, result.index).trim();
			}
		}
	}

	return text.trim();
};

exports.clearPageContent = function(text) {
	if (!text) {
		return text;
	}
	var lines = text.split(/\n/g);
	var endLine = /[.!?:]$/;
	text = [];

	lines.forEach(function(line) {
		line = line.trim();
		if (!(line.length < 50 || line.length < 100 && !endLine.test(line))) {
			text.push(line);
		}
	});

	return text.join('\n');
};

exports.Promise = Promise;
exports._ = _;

module.exports = exports = _.assign({}, utils, exports);
