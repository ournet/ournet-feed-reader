'use strict';

module.exports = [
	// ProTv video finder
	{
		find: function(page) {
			if (!/^http:\/\/(\w+\.)?(protv|inprofunzime)\.md/.test(page.href)) {
				return null;
			}

			var list = [];
			var body = page.dom('body').text();
			var result = /var mobile_file\s*=\s*\'(http:\/\/m\.protv\.md\/mobile\/\d+.mp4)\'/i.exec(body);
			if (result) {
				list.push({
					sourceId: result[1],
					sourceType: 'URL'
				});
			}
			return list;
		}
	},
	// 5tv.ru
	{
		find: function(page) {
			if (!/^http:\/\/(\w+\.)?5-tv\.ru/.test(page.href)) {
				return null;
			}

			var list = [];
			var body = page.dom('body').text();
			var result = /"url":\s*"(http:\/\/img\.5-tv\.ru\/shared\/files\/\d+\/1_\d+.mp4)"/i.exec(body);

			if (result) {
				list.push({
					sourceId: result[1],
					sourceType: 'URL'
				});
			}
			return list;
		}
	},
	// stirileprotv.ro
	{
		find: function(page) {
			if (!/^http:\/\/(\w+\.)?stirileprotv\.ro/.test(page.href)) {
				return null;
			}

			var list = [];
			var body = page.dom('body').text();
			var result = /<video\s+width='(\d+)'\s+height='(\d+)'\s+controls\s+><source\s+src='(http:\/\/vid1.stirileprotv.ro\/\d+\/\d+\/\d+\/\d+-2\.mp4)'/i.exec(body);

			if (result) {
				list.push({
					width: parseInt(result[1]),
					height: parseInt(result[2]),
					sourceId: result[3],
					sourceType: 'URL'
				});
			}
			return list;
		}
	},
	// jurnaltv.md
	{
		find: function(page) {
			if (!/^http:\/\/(\w+\.)?jurnaltv\.md/.test(page.href)) {
				return null;
			}

			var list = [];
			var body = page.dom('body').text();
			var result = /videoUrl\s*:\s*"http:\/\/video\.jurnaltv\.md\/gallery_video\/(\d+)\.mp4"/i.exec(body);

			if (result) {
				list.push({
					width: 640,
					height: 358,
					sourceId: 'http://video.jurnaltv.md/gallery_video/' + result[1] + '.mp4',
					sourceType: 'URL'
				});
			}
			return list;
		}
	},
	// tvzvezda.ru
	{
		find: function(page) {
			if (!/^http:\/\/(\w+\.)?tvzvezda\.ru/.test(page.href)) {
				return null;
			}

			var list = [];
			var body = page.dom('body').text();
			var result = /http:\/\/mp4zvezda\.cdnvideo\.ru\/mp4\/([\w\d]+)\.mp4/i.exec(body);

			if (result) {
				list.push({
					width: 640,
					height: 358,
					sourceId: 'http://mp4zvezda.cdnvideo.ru/mp4/' + result[1] + '.mp4',
					sourceType: 'URL'
				});
			}
			return list;
		}
	}
];
