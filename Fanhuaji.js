/**
 * 本程式使用了繁化姬的 API 服務，以作為正確性備用檢核。繁化姬(https://zhconvert.org/)商用必須付費。
 * 
 * @since 2022/6/30 11:14:58
 */


'use strict';

// modify from wikiapi.js
let CeL;

try {
	// Load CeJS library.
	CeL = require('cejs');
} catch (e) /* istanbul ignore next: Only for debugging locally */ {
	// https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md
	require('./_CeL.loader.nodejs.js');
	CeL = globalThis.CeL;
}
// assert: typeof CeL === 'function'

// 在非 Windows 平台上避免 fatal 錯誤。
//CeL.env.ignore_COM_error = true;

// Load modules.
CeL.run(['application.debug',
	// 載入不同地區語言的功能 for wiki.work()。
	'application.locale',
	// Add color to console messages. 添加主控端報告的顏色。
	'interact.console',

	//for CeL.URI()
	'application.net',
	//for CeL.get_URL()
	'application.net.Ajax',

	// for 'application.platform.nodejs': CeL.env.arg_hash, CeL.wiki.cache(),
	// CeL.fs_mkdir(), CeL.wiki.read_dump()
	'application.storage']);


// ----------------------------------------------------------------------------


function Fanhuaji() {
	;
}


const convert_separator = '[sep]';
async function Fanhuaji_converter(text, options) {
	// https://docs.zhconvert.org/api/convert/
	var url = new CeL.URI('https://api.zhconvert.org/convert');
	url.search_params.set_parameters({
		//apiKey: '',
		//outputFormat: 'json',
	});

	const is_Array = Array.isArray(text);
	if (is_Array) {
		text = text.join(convert_separator);
	}

	return new Promise((resolve, reject) => {
		CeL.get_URL(url, (XMLHttp, error) => {
			if (error) {
				reject(error);
				return;
			}

			try {
				const result = JSON.parse(XMLHttp.responseText);
				result = result.data.text;
				if (is_Array) {
					result = result.split(convert_separator);
					if (text.lenth !== result.lenth)
						throw new Error(`Fanhuaji_converter: The length of text list is different! ${text.lenth}!==${result.lenth}`);
				}
				resolve(result);
			} catch (e) {
				reject(e);
			}
		}, null, {
			text: text,
			converter: options?.converter,
		});
	});
}


async function Fanhuaji_to_TW(text, options) {
	return await Fanhuaji_converter(text, {
		converter: 'Traditional'
	});
}

async function Fanhuaji_to_CN(text, options) {
	return await Fanhuaji_converter(text, {
		converter: 'Simplified'
	});
}

Object.assign(Fanhuaji, {
	to_TW: Fanhuaji_to_TW,
	to_CN: Fanhuaji_to_CN,
});

module.exports = Fanhuaji;
