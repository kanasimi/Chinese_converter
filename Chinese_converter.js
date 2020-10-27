/*

TODO:
簡化辭典複雜度

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
nodejieba_CN.load('dictionaries/commons.txt');

// --------------------------------------------------------

function Chinese_converter() {
	this.convertion_pairs = new Map;
}



function load_dictionary(file_path) {
	;
}

// 自動判斷句子、段落的語境（配合維基百科專有名詞轉換）
function detect_domain(paragraphs, options) {
	;
}

// --------------------------------------------------------

function tag_paragraph(paragraph, options) {
	return nodejieba_CN.tag(paragraph);
}

// 強制轉換段落/sentence。
function forced_convert(paragraph) {
	return CeL.CN_to_TW(paragraph);
}

/**
 * 
 * @param {String}paragraph
 * @param {Object}[options]
 */
function convert_paragraph(paragraph, options) {
	const word_list = tag_paragraph.call(this, paragraph, options);
	console.trace(word_list);

	return word_list.map(word => {
		if (!this.convertion_pairs.has(word.word)) {
			return forced_convert.call(this, word.word);
		}

		const convert_to = this.convertion_pairs.get(word.word);
		if (typeof convert_to === 'string')
			return convert_to;

		//assert: convert_to = [{ word: '詞', tag: '詞性' }, { word: '詞', tag: '詞性' }, ...]
		for (let index = 0; index < convert_to.length; index++) {
			const to_word = convert_to[index];
			// 依照最佳詞性轉換。
			// ICTPOS3.0词性标记集 https://gist.github.com/luw2007/6016931
			if (word.tag === to_word.tag)
				return to_word.word;
		}

		// return the best guess.
		return convert_to[0].word;
	}).join('');
}

/**
 * 
 * @param {Array}paragraphs [{String}, {String}, ...]
 * @param {Object}[options]
 */
function convert_to_TW(paragraphs, options) {
	const input_string = typeof paragraphs === 'string';
	if (input_string)
		paragraphs = [paragraphs];

	options = Object.assign({ convert_to_language: 'TW' }, options);
	const domain = this.detect_domain(paragraphs, options);

	let converted_paragraphs = paragraphs.map(paragraph => convert_paragraph.call(this, paragraph, options));

	if (input_string)
		converted_paragraphs = converted_paragraphs[0];

	return converted_paragraphs;
}

function convert_to_CN(paragraphs, options) {
	const input_string = typeof paragraphs === 'string';
	if (input_string)
		paragraphs = [paragraphs];

	options = Object.assign({ convert_to_language: 'CN' }, options);
	const domain = this.detect_domain(paragraphs, options);

	let converted_paragraphs = paragraphs.map(paragraph => convert_paragraph.call(this, paragraph, options));

	if (input_string)
		converted_paragraphs = converted_paragraphs[0];

	return converted_paragraphs;
}

// --------------------------------------------------------

Object.assign(Chinese_converter.prototype, {
	to_TW: convert_to_TW,
	to_CN: convert_to_CN,

	detect_domain,
});

module.exports = Chinese_converter;

// export default Chinese_converter;
