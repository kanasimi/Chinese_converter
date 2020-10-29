/*

TODO:
整合繁簡轉換各家辭典
簡化辭典複雜度

https://s.itho.me/techtalk/2017/%E4%B8%AD%E6%96%87%E6%96%B7%E8%A9%9E%EF%BC%9A%E6%96%B7%E5%8F%A5%E4%B8%8D%E8%A6%81%E6%82%B2%E5%8A%87.pdf
某個詞在⼀篇⽂章中出現的頻率⾼，且在其他⽂章中很少出現，則此詞語為具代表性的關鍵詞

*/

'use strict';

// Copy from wikiapi.js
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
CeL.env.ignore_COM_error = true;

// Load modules.
CeL.run(['application.debug',
	// 載入不同地區語言的功能 for wiki.work()。
	'application.locale',
	// Add color to console messages. 添加主控端報告的顏色。
	'interact.console',
	// 
	'extension.zh_conversion',
	// for 'application.platform.nodejs': CeL.env.arg_hash, CeL.wiki.cache(),
	// CeL.fs_mkdir(), CeL.wiki.read_dump()
	'application.storage']);

const nodejieba_CN = require("nodejieba");
nodejieba_CN.load({ dict: module.path + '/dictionaries/commons.txt' });

// --------------------------------------------------------

class Chinese_converter {
	constructor(options) {
		this.convertion_pairs = Object.create(null);
		load_dictionary.call(this, '/dictionaries/CN_to_TW.PoS.txt', { language: 'TW' });
		load_dictionary.call(this, '/dictionaries/TW_to_CN.PoS.txt', { language: 'CN' });
	}

	/**
	 * convert to TW
	 * @param {Array}paragraphs [{String}, {String}, ...]
	 * @param {Object}[options]
	 */
	to_TW(paragraphs, options) {
		options = Object.assign({ convert_to_language: 'TW' }, options);
		return convert_Chiinese.call(this, paragraphs, options);
	}

	/**
	 * convert to CN
	 * @param {Array}paragraphs [{String}, {String}, ...]
	 * @param {Object}[options]
	 */
	to_CN(paragraphs, options) {
		options = Object.assign({ convert_to_language: 'CN' }, options);
		return convert_Chiinese.call(this, paragraphs, options);
	}

	// 自動判斷句子、段落的語境（配合維基百科專有名詞轉換）
	detect_domain(paragraphs, options) {
		// TODO
	}
}


function load_dictionary(file_path, options) {
	const word_list = CeL.read_file(module.path + file_path).toString().split('\n');
	const convertion_pairs = this.convertion_pairs[options.language] = new Map;
	for (let record of word_list) {
		if (record.startsWith('#') || record.startsWith('//'))
			continue;
		record = record.trim().split('\t');
		if (!convertion_pairs.has(record[0]))
			convertion_pairs.set(record[0], []);
		const PoS_data = convertion_pairs.get(record[0]);
		for (let index = 1; index < record.length; index++) {
			const data = record[index].match(/^([^:]+):(.+)$/);
			PoS_data.push(data ? { word: data[2], tag: data[1] } : { word: record[index] });
		}
	};
}


// --------------------------------------------------------

function tag_paragraph(paragraph, options) {
	return nodejieba_CN.tag(paragraph);
}

// 強制轉換段落/sentence。
function forced_convert_to_TW(paragraph, index, parent, options) {
	// 採行 CeL.CN_to_TW() 的原因：這是經過調試，比較準確的轉換器。
	// 採用的辭典見 https://github.com/kanasimi/CeJS/blob/master/extension/zh_conversion/corrections.txt 。 
	return CeL.CN_to_TW(paragraph);
}

function forced_convert_to_CN(paragraph, index, parent, options) {
	return CeL.TW_to_CN(paragraph);
}

/**
 * 轉換段落文字。
 * @param {String}paragraph 段落文字
 * @param {Object}[options]
 */
function convert_paragraph(paragraph, options) {
	const word_list = tag_paragraph.call(this, paragraph, options);
	if (CeL.is_debug()) {
		console.trace(word_list);
	}
	const convertion_pairs = this.convertion_pairs[options.convert_to_language];

	return word_list.map((word, index, parent) => {
		if (!convertion_pairs.has(word.word)) {
			const forced_convert = options.convert_to_language === 'TW' ? forced_convert_to_TW : forced_convert_to_CN;
			return forced_convert.call(this, word.word, index, parent, options);
		}

		const convert_to = convertion_pairs.get(word.word);
		if (typeof convert_to === 'string')
			return convert_to;

		//assert: convert_to = [{ word: '詞', tag: '詞性' }, { word: '詞', tag: '詞性' }, ...]
		for (let index = 0; index < convert_to.length; index++) {
			const to_word = convert_to[index];
			// 依照最佳詞性轉換。
			// ICTPOS3.0词性标记集 https://gist.github.com/luw2007/6016931 http://ictclas.nlpir.org/
			// CKIP中文斷詞系統 詞類標記列表 http://ckipsvr.iis.sinica.edu.tw/cat.htm https://github.com/ckiplab/ckiptagger/wiki/POS-Tags
			if (word.tag === to_word.tag)
				return to_word.word;
		}

		// return the best guess.
		return convert_to[0].word;
	}).join('');
}

function convert_Chiinese(paragraphs, options) {
	const input_string = typeof paragraphs === 'string';
	if (input_string)
		paragraphs = [paragraphs];

	const domain = this.detect_domain(paragraphs, options);

	let converted_paragraphs = paragraphs.map(paragraph => convert_paragraph.call(this, paragraph, options));

	if (input_string)
		converted_paragraphs = converted_paragraphs[0];

	return converted_paragraphs;
}

// --------------------------------------------------------

module.exports = Chinese_converter;

// export default Chinese_converter;
