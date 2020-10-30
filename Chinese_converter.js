/*

TODO:
整合繁簡轉換各家辭典
簡化辭典複雜度


https://zhuanlan.zhihu.com/p/95358646
常用的关键词提取算法：TF-IDF算法、TextRank算法
https://blog.csdn.net/vivian_ll/article/details/106647666
利用jieba进行关键字提取时，有两种接口。一个基于TF-IDF算法，一个基于TextRank算法。
https://s.itho.me/techtalk/2017/%E4%B8%AD%E6%96%87%E6%96%B7%E8%A9%9E%EF%BC%9A%E6%96%B7%E5%8F%A5%E4%B8%8D%E8%A6%81%E6%82%B2%E5%8A%87.pdf
某個詞在⼀篇⽂章中出現的頻率⾼，且在其他⽂章中很少出現，則此詞語為具代表性的關鍵詞

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

// Cache default convertors without CeCC.
const CeL_CN_to_TW = CeL.zh_conversion.CN_to_TW, CeL_TW_to_CN = CeL.zh_conversion.TW_to_CN;

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
		return convert_Chinese.call(this, paragraphs, options);
	}

	/**
	 * convert to CN
	 * @param {Array}paragraphs [{String}, {String}, ...]
	 * @param {Object}[options]
	 */
	to_CN(paragraphs, options) {
		options = Object.assign({ convert_to_language: 'CN' }, options);
		return convert_Chinese.call(this, paragraphs, options);
	}

	// 自動判斷句子、段落的語境（配合維基百科專有名詞轉換）
	detect_domain(paragraphs, options) {
		// TODO
	}
}

// [ condition, is target, not match, tag (PoS), word / pattern, optional ]
const PATTERN_condition = /^(~)?(!)?(?:([^:]+):)?(.*?)(\?)?$/;

function parse_condition(condition) {
	condition = condition.split('+');
	let target_index;
	condition = condition.map((token, index) => {
		const matched = token.match(PATTERN_condition);
		const condition_data = Object.create(null);
		if (matched[1]) {
			condition_data.target = true;
			if (target_index >= 0)
				CeL.warn(`${parse_condition.name}: Multiple target: ${condition.join('+')}`);
			else
				target_index = index;
		}
		if (matched[4]) {
			condition_data.word = CeL.PATTERN_RegExp.test(matched[4]) ? matched[4].toRegExp() : matched[4];
		}
		if (matched[2])
			condition_data.not_match = matched[2];
		if (matched[3])
			condition_data.tag = matched[3];
		if (matched[5])
			condition_data.optional = true;
		return condition_data;
	});

	if (condition.length === 1) {
		return condition[0];
	}

	if (target_index >= 0)
		condition.target_index = target_index;

	return condition;
}

function load_dictionary(file_path, options) {
	const word_list = CeL.data.pair.remove_comments(CeL.read_file(module.path + file_path)).split('\n');
	const convertion_pairs = this.convertion_pairs[options.language] = new Map;
	for (let conditions of word_list) {
		conditions = conditions.trim().split('\t');
		if (!convertion_pairs.has(conditions[0]))
			convertion_pairs.set(conditions[0], []);
		const convertion_data = convertion_pairs.get(conditions[0]);
		for (let index = 1; index < conditions.length; index++) {
			convertion_data.push(parse_condition(conditions[index]));
		}
	};
}

function not_match_single_condition(single_condition, word_data) {
	//console.trace([single_condition, word_data]);

	// 依照最佳詞性轉換。
	// ICTPOS3.0词性标记集 https://gist.github.com/luw2007/6016931 http://ictclas.nlpir.org/
	// CKIP中文斷詞系統 詞類標記列表 http://ckipsvr.iis.sinica.edu.tw/cat.htm https://github.com/ckiplab/ckiptagger/wiki/POS-Tags
	// NLPIR 词性类别: 计算所汉语词性标记集 http://103.242.175.216:197/nlpir/html/readme.htm
	if (single_condition.tag && single_condition.not_match ^ !CeL.fit_filter(single_condition.tag, word_data.tag))
		return true;
	if (!single_condition.target && single_condition.word && single_condition.not_match ^ !CeL.fit_filter(single_condition.word, word_data.word))
		return true;
}

function match_condition(conditions, word_data, index, parent) {
	//console.trace([conditions, word_data]);
	if (!Array.isArray(conditions))
		return !not_match_single_condition(conditions, word_data) && conditions;

	const target_index = conditions.target_index || 0;

	// 檢查當前 part。
	if (not_match_single_condition(conditions[target_index], word_data))
		return;

	// 向後檢查。
	for (let index_of_condition = target_index + 1, index_of_target = index + 1; index_of_condition < conditions.length; index_of_condition++) {
		if (index_of_target >= parent.length)
			return;
		const condition = conditions[index_of_condition];
		if (not_match_single_condition(condition, parent[index_of_target])) {
			if (!condition.optional)
				return;
			// Skip the target part.
		} else
			index_of_target++;
	}

	// 向前檢查。
	for (let index_of_condition = target_index - 1, index_of_target = index - 1; index_of_condition >= 0; index_of_condition--) {
		if (index_of_target < 0)
			return;
		const condition = conditions[index_of_condition];
		if (not_match_single_condition(condition, parent[index_of_target])) {
			if (!condition.optional)
				return;
			// Skip the target part.
		} else
			index_of_target--;
	}

	return conditions[target_index];
}


// --------------------------------------------------------

function tag_paragraph(paragraph, options) {
	return nodejieba_CN.tag(paragraph);
}

// 強制轉換段落/sentence。
function forced_convert_to_TW(paragraph, index, parent, options) {
	//CeL.log(`${paragraph}→${CeL_CN_to_TW(paragraph)}`);

	// 採行 CeL.CN_to_TW() 的原因：這是經過調試，比較準確的轉換器。
	// 採用的辭典見 https://github.com/kanasimi/CeJS/blob/master/extension/zh_conversion/corrections.txt 。
	return CeL_CN_to_TW(paragraph);
}

function forced_convert_to_CN(paragraph, index, parent, options) {
	return CeL_TW_to_CN(paragraph);
}

/**
 * 轉換段落文字。
 * @param {String}paragraph 段落文字
 * @param {Object}[options]
 */
function convert_paragraph(paragraph, options) {
	const word_list = tag_paragraph.call(this, paragraph, options);
	//console.trace(word_list);
	const convertion_pairs = this.convertion_pairs[options.convert_to_language];
	const forced_convert = (options.convert_to_language === 'TW' ? forced_convert_to_TW : forced_convert_to_CN).bind(this);
	const word_convert_mode = !options.forced_convert_mode || options.forced_convert_mode === 'word';

	let converted_text = word_list.map((word_data, index, parent) => {
		if (!convertion_pairs.has(word_data.word)) {
			return word_convert_mode ? forced_convert(word_data.word, index, parent, options) : word_data.word;
		}

		const convert_to_conditions = convertion_pairs.get(word_data.word);
		//assert: convert_to = [{ word: '詞', tag: '詞性' }, { word: '詞', tag: '詞性' }, ...]
		for (let index_of_conditions = 0; index_of_conditions < convert_to_conditions.length; index_of_conditions++) {
			const conditions = convert_to_conditions[index_of_conditions];
			const to_word_data = match_condition(conditions, word_data, index, parent);
			if (to_word_data)
				return to_word_data.word || word_data.word;
		}

		// return the best guess.
		return convert_to_conditions[0].word || (word_convert_mode ? forced_convert(word_data.word, index, parent, options) : word_data.word);
	}).join('');

	if (!word_convert_mode) {
		converted_text = forced_convert(converted_text);
	}
	return converted_text;
}

function convert_Chinese(paragraphs, options) {
	if (!paragraphs)
		return paragraphs === 0 ? String(paragraphs) : '';

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
