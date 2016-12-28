'use strict';

var Transform = require('stream').Transform;
var util = require('util');

function DecodingStream(options, encoding) {
	if (!(this instanceof DecodingStream)) {
		return new DecodingStream(options);
	}

	Transform.call(this, options);
	if (encoding) {
		this.decDetEncoding(encoding);
	}
}

module.exports = DecodingStream;
util.inherits(DecodingStream, Transform);

DecodingStream.prototype.decSetEncoding = function(encoding) {
	if (!encoding) {
		return;
	}
	encoding = encoding.toLowerCase();
	switch (encoding) {
		case 'windows-1251':
		case 'windows1251':
			encoding = 'win1251';
			break;
	}
	//console.info('SET ENCODING', encoding);
	this.decEncoding = encoding.toLowerCase();
};

DecodingStream.prototype._transform = function(chunk, encoding, done) {
	if (!this.decEncoding || this.decEncoding === 'utf8') {
		//console.info('Transform with', this.decEncoding, encoding);
		this.push(chunk);
	} else {
		//console.info('Transform with', this.decEncoding, encoding);
		var iconv = require('iconv-lite');
		var str = iconv.decode(chunk, this.decEncoding);
		this.push(str);
	}

	done();
};
