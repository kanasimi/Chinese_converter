/*

*/

'use strict';

// Copy from wikiapi.js
let CeL;

try {
	// Load CeJS library.
	CeL = require('cejs');
} catch (e) /* istanbul ignore next: Only for debugging locally */ {
	// https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md
	require('../_CeL.loader.nodejs.js');
	CeL = globalThis.CeL;
}
// assert: typeof CeL === 'function'

// 在非 Windows 平台上避免 fatal 錯誤。
CeL.env.ignore_COM_error = true;

// Load modules.
CeL.run(['application.debug',
	// 載入不同地區語言的功能 for wiki.work()。
	'application.locale',
	// Add color to console messages. 添加主控端報告的顏色。
	'interact.console',
	// 
	'extension.zh_conversion',
	//
	'application.net.Ajax',
	// for 'application.platform.nodejs': CeL.env.arg_hash, CeL.wiki.cache(),
	// CeL.fs_mkdir(), CeL.wiki.read_dump()
	'application.storage']);

const nodejieba_CN = require("nodejieba");

// --------------------------------------------------------

const dictionary_words = Object.create(null);


(async () => {
	// await wiki.login(null, null, use_language);
	await main_process();
})();

function get_URL_cache(URL, options) {
	return new Promise((resolve, reject) =>
		CeL.get_URL_cache(URL, (data, error, XMLHttp) => {
			if (error) reject(error); else resolve(data);
		}, options)
	);
}

function add_word(line) {
	line = line.trim();
	const word = line.match(/^\S*/)[0];
	if (!word)
		return;
	if (word in dictionary_words) {
		//CeL.error(`Duplicated word ${word}: ${dictionary_words[word]}; ${line}`);
		return;
	}

	dictionary_words[word] = line;
}

async function main_process() {
	if (false) {
		const dictionary_list = CeL.read_file(require.resolve("nodejieba").replace(/[^\\\/]+$/, 'dict/jieba.dict.utf8')).toString().split('\n');
		dictionary_list.forEach(add_word);
	}

	for (const url of [
		// 結巴(jieba)斷詞台灣繁體版本 切分"「台中」正確應該不會被切開"不正確
		//'https://raw.githubusercontent.com/ldkrsi/jieba-zh_TW/master/jieba/dict.txt',
		// 支持繁體分詞更好的詞典文件
		'https://github.com/fxsjy/jieba/raw/master/extra_dict/dict.txt.big',
	]) {
		const dictionary_list = (await get_URL_cache(url)).split('\n');
		dictionary_list.forEach(add_word);
	}

	//dict_hybrid.txt
	CeL.write_file('../dictionaries/commons.txt', Object.values(dictionary_words).join('\n'));

}
