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
	//
	'data.statistics',
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

function parse_word_record(record) {
	record = record.trim();
	const data_array = record.split(/\s+/);
	if (data_array.length !== 3)
		return;
	return {
		word: data_array[0],
		weight: +data_array[1],
		tag: data_array[2]
	};
}

function scan_dictionary_list(dictionary_list) {
	const weights_old = [], weights_new = [], tag_convertion = Object.create(null);

	function scan_line(record) {
		const word_data = parse_word_record(record);
		const old_word_data = word_data && dictionary_words[word_data.word];
		if (!old_word_data)
			return;
		weights_old.push(old_word_data.weight);
		weights_new.push(word_data.weight);
		if (old_word_data.tag !== word_data.tag) {
			if (!tag_convertion[old_word_data.tag])
				tag_convertion[old_word_data.tag] = [];
			if (!tag_convertion[old_word_data.tag].includes(word_data.tag))
				tag_convertion[old_word_data.tag].push(word_data.tag);
		}
	}

	dictionary_list.forEach(scan_line);
	const statistics_old = CeL.statistics(weights_old);
	const statistics_new = CeL.statistics(weights_new);
	console.log(tag_convertion);
	console.trace([statistics_old, statistics_new]);
	return {
		delta: statistics_old.mean - statistics_new.mean,
		ratio: statistics_old.SD / statistics_new.SD,
		tag_convertion,
	};
}

function add_word(record, status) {
	record = record.trim();
	const word_data = parse_word_record(record);
	if (!word_data)
		return;
	if (word_data.word in dictionary_words) {
		//CeL.error(`Duplicated word ${word}: ${dictionary_words[word]}; ${line}`);
		return;
	}

	dictionary_words[word_data.word] = word_data;
	// 正規化 weight, https://en.wikipedia.org/wiki/Normalization_(statistics)
	// by standard score
	if (status.ratio > 0)
		word_data.weight = Math.round((word_data.weight + status.delta) * status.ratio);
}

async function main_process() {
	if (false) {
		const dictionary_list = CeL.read_file(require.resolve("nodejieba").replace(/[^\\\/]+$/, 'dict/jieba.dict.utf8')).toString().split('\n');
		dictionary_list.forEach(add_word);
	}

	for (const url of [
		// 支持繁體分詞更好的詞典文件
		'https://github.com/fxsjy/jieba/raw/master/extra_dict/dict.txt.big',
		// 結巴(jieba)斷詞台灣繁體版本 切分"「台中」正確應該不會被切開"不正確
		'https://raw.githubusercontent.com/ldkrsi/jieba-zh_TW/master/jieba/dict.txt',
	]) {
		const dictionary_list = (await get_URL_cache(url)).split('\n');
		const status = scan_dictionary_list(dictionary_list);
		if (status.ratio > 0)
			console.trace(status);
		dictionary_list.forEach(record => add_word(record, status));
	}

	//dict_hybrid.txt
	CeL.write_file('../dictionaries/commons.txt',
		Object.values(dictionary_words)
			.map(word_data => `${word_data.word} ${word_data.weight} ${word_data.tag}`)
			.join('\n')
	);

}
