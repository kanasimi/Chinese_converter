/*

Chinese_converter
在人工智慧繁簡轉換前，中文分詞、判斷語境之後再做轉換會是比較準確的方式。

# 中文分詞（附帶詞性標註）+自動判斷句子、段落的語境（配合維基百科專有名詞轉換）
# 繁簡轉換（先輕量化繁簡轉換辭典負擔）

簡化辭典複雜度
正確率檢核：繁→簡→繁

https://noob.tw/js-nlp-jieba/
https://github.com/ldkrsi/jieba-zh_TW


-------------------------------------------------


install Python

# run as Administrator
npm install --global windows-build-tools
npm install -g node-gyp
npm install -g node-pre-gyp
npm install hexo-ruby-character --save
npm install nodejieba

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

const nodejieba = require("nodejieba");

// --------------------------------------------------------

function Chinese_converter() {
	this.convertion_pairs = new Map;
}



function load_dictionary(file_path) {
	;
}

// 自動判斷句子、段落的語境（配合維基百科專有名詞轉換）
function detect_domain(paragraphs) {
	;
}

// --------------------------------------------------------

function tag_paragraph(paragraph, options) {
	return nodejieba.tag(paragraph);
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

	return word_list.map(word => {
		if (!this.convertion_pairs.has(word)) {
			return forced_convert.call(this, word);
		}

		const convert_to = this.convertion_pairs.get(word);
		if (typeof convert_to === 'string')
			return convert_to;

		//assert: convert_to=[{ word: '詞', tag: '詞性' },{ word: '詞', tag: '詞性' },...]
		for (let index = 0; index < convert_to.length; index++) {
			const to_word = convert_to[index];
			// 依照最佳詞性轉換。
			if (word.tag === to_word.tag)
				return to_word.word;
		}

		// return the best guess.
		return convert_to[0].word;
	});
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

	const domain = this.detect_domain(paragraphs);

	const converted_paragraphs = paragraphs.map(paragraph => convert_paragraph.call(this, paragraph, options));

	if (input_string)
		converted_paragraphs = converted_paragraphs[0];
}

// --------------------------------------------------------

Object.assign(Chinese_converter.prototype, {
	to_TW: convert_to_TW,

	detect_domain,
});

module.exports = Chinese_converter;

// export default Chinese_converter;
