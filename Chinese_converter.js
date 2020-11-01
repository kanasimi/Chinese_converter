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

	// for CeL_CN_to_TW()
	'extension.zh_conversion',

	//for CeL.get_URL()
	'application.net.Ajax',

	// for 'application.platform.nodejs': CeL.env.arg_hash, CeL.wiki.cache(),
	// CeL.fs_mkdir(), CeL.wiki.read_dump()
	'application.storage']);

const nodejieba_CN = require("nodejieba");
nodejieba_CN.load({ dict: module.path + '/dictionaries/commons.txt' });

// Cache default convertors without CeCC.
const CeL_CN_to_TW = CeL.zh_conversion.CN_to_TW, CeL_TW_to_CN = CeL.zh_conversion.TW_to_CN;

// ----------------------------------------------------------------------------

let KEY_word = 'word', KEY_PoS_tag = 'tag';

// CeCC
class Chinese_converter {
	constructor(options) {
		this.convertion_pairs = Object.create(null);
		this.KEY_word = KEY_word;
		if (options?.CoreNLP_URL) {
			// using Stanford CoreNLP
			this.KEY_PoS_tag = 'pos';
			this.CoreNLP_URL = new URL(options.CoreNLP_URL);
			// https://stanfordnlp.github.io/CoreNLP/corenlp-server.html
			this.CoreNLP_URL_properties = {
				annotators: 'tokenize,ssplit,pos,depparse',
			};
			load_dictionary.call(this, '/dictionaries/CN_to_TW.CoreNLP.PoS.txt', { language: 'TW' });
			load_dictionary.call(this, '/dictionaries/TW_to_CN.CoreNLP.PoS.txt', { language: 'CN' });
		} else {
			this.KEY_PoS_tag = KEY_PoS_tag;
			load_dictionary.call(this, '/dictionaries/CN_to_TW.PoS.txt', { language: 'TW' });
			load_dictionary.call(this, '/dictionaries/TW_to_CN.PoS.txt', { language: 'CN' });
		}
	}

	/**
	 * convert to TW
	 * @param {Array}paragraphs [{String}, {String}, ...]
	 * @param {Object}[options]
	 */
	async to_TW(paragraphs, options) {
		return await convert_Chinese.call(this, await paragraphs, { convert_to_language: 'TW', ...options });
	}
	to_TW_sync(paragraphs, options) {
		return convert_Chinese.call(this, paragraphs, { convert_to_language: 'TW', ...options });
	}

	/**
	 * convert to CN
	 * @param {Array}paragraphs [{String}, {String}, ...]
	 * @param {Object}[options]
	 */
	async to_CN(paragraphs, options) {
		return await convert_Chinese.call(this, await paragraphs, { convert_to_language: 'CN', ...options });
	}
	to_CN_sync(paragraphs, options) {
		return convert_Chinese.call(this, paragraphs, { convert_to_language: 'CN', ...options });
	}

	// 自動判斷句子、段落的語境（配合維基百科專有名詞轉換）
	detect_domain(paragraphs, options) {
		// TODO
	}

	//#parse_condition = parse_condition
}

// ----------------------------------------------------------------------------

// [ condition, is target, not match, tag (PoS), word / pattern, optional ]
const PATTERN_condition = /^(?<target>~)?(?<not_match>!)?(?:(?<tag>[^:]+):)?(?<word>[\s\S]*?)(?<optional>\?)?$/;

function parse_condition(condition) {
	condition = condition.split('+');
	let target_index;
	condition = condition.map((token, index) => {
		const matched = token.match(PATTERN_condition).groups;
		const condition_data = Object.create(null);
		if (matched.target) {
			condition_data.target = true;
			if (target_index >= 0)
				CeL.warn(`${parse_condition.name}: Multiple target: ${condition.join('+')}`);
			else
				target_index = index;
		}
		if (matched.word) {
			//const replace_pattern = matched.word.match();
			condition_data[this.KEY_word] = CeL.PATTERN_RegExp.test(matched.word) || CeL.PATTERN_RegExp_replacement.test(matched.word) ? matched.word.toRegExp({ allow_replacement: true }) : matched.word;
		}
		if (matched.not_match)
			condition_data.not_match = matched.not_match;
		if (matched.tag)
			condition_data[this.KEY_PoS_tag] = matched.tag;
		if (matched.optional)
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

const KEY_tag_filter = Symbol('tag filter'), KEY_tag_pattern_filter = Symbol('tag pattern filter'), KEY_general_pattern_filter = Symbol('general pattern filter'), KEY_pattern = 'pattern';

function get_convert_to_conditions(work_data, convertion_pairs, options) {
	let convertion_set, key = work_data[this.KEY_word], pattern;
	const KEY_PoS_tag = this.KEY_PoS_tag;

	function set_tag_convertion(KEY) {
		convertion_set = convertion_pairs.get(KEY);
		if (!convertion_set[work_data[KEY_PoS_tag]]) {
			if (!options?.create)
				return;
			convertion_set[work_data[KEY_PoS_tag]] = new Map;
		}
		//console.trace(convertion_set);
		return convertion_set = convertion_set[work_data[KEY_PoS_tag]];
	}

	if (CeL.is_RegExp(key) || options?.search_pattern) {
		if (options?.try_tag && work_data[KEY_PoS_tag]) {
			if (!set_tag_convertion(KEY_tag_pattern_filter))
				return;
		} else {
			convertion_set = convertion_pairs.get(KEY_general_pattern_filter);
		}

		if (CeL.is_RegExp(key)) {
			pattern = key;
			key = key.toString().replace(/(\w)+$/, flags => flags.replace(/[g]/, ''));
		} else {
			for (const convert_to_conditions of convertion_set.values()) {
				//console.trace([key, convert_to_conditions[KEY_pattern]]);
				// assert {Array}convert_to_conditions
				if (convert_to_conditions[KEY_pattern].test(key)) {
					return convert_to_conditions;
				}
			}
		}

	} else {
		if (options?.try_tag && work_data[KEY_PoS_tag]) {
			if (!set_tag_convertion(KEY_tag_filter))
				return;
		} else {
			convertion_set = convertion_pairs;
		}
	}

	if (!convertion_set.has(key)) {
		if (!options?.create)
			return;
		// 初始化 initialization
		const convert_to_conditions = [];
		if (pattern)
			convert_to_conditions[KEY_pattern] = pattern;
		convertion_set.set(key, convert_to_conditions);
		//console.trace(convertion_set);
	}

	// {Array}
	return convertion_set.get(key);
}

function load_dictionary(file_path, options) {
	const word_list = CeL.data.pair.remove_comments(CeL.read_file(module.path + file_path)).split('\n');
	// 初始化 initialization: convertion_pairs
	const convertion_pairs = this.convertion_pairs[options.language] = new Map;
	convertion_pairs.set(KEY_tag_filter, Object.create(null));
	convertion_pairs.set(KEY_tag_pattern_filter, Object.create(null));
	convertion_pairs.set(KEY_general_pattern_filter, new Map);

	for (let conditions of word_list) {
		conditions = conditions.trim().split('\t');
		const filter = parse_condition.call(this, conditions[0]);
		if (!filter[this.KEY_word] && !filter[this.KEY_PoS_tag]) {
			if (conditions[0].trim())
				CeL.error(`Invalid word filter: ${conditions[0]}`);
			continue;
		}
		if (filter.not_match)
			throw new Error('NYI: not_match');

		const convert_to_conditions = get_convert_to_conditions.call(this, filter, convertion_pairs, { create: true, try_tag: true });
		for (let index = 1; index < conditions.length; index++) {
			const condition = parse_condition.call(this, conditions[index]);
			convert_to_conditions.push(condition);
		}
		//console.trace(convert_to_conditions);
	}
}

// ----------------------------------------------------------------------------

function not_match_single_condition(single_condition, word_data) {
	//console.trace([single_condition, word_data]);

	// 依照最佳詞性轉換。
	// ICTPOS3.0词性标记集 https://gist.github.com/luw2007/6016931 http://ictclas.nlpir.org/
	// CKIP中文斷詞系統 詞類標記列表 http://ckipsvr.iis.sinica.edu.tw/cat.htm https://github.com/ckiplab/ckiptagger/wiki/POS-Tags
	// NLPIR 词性类别: 计算所汉语词性标记集 http://103.242.175.216:197/nlpir/html/readme.htm
	if (single_condition[this.KEY_PoS_tag] && single_condition.not_match ^ !CeL.fit_filter(single_condition[this.KEY_PoS_tag], word_data[this.KEY_PoS_tag]))
		return true;
	if ((!single_condition.target || CeL.is_RegExp(single_condition))
		&& single_condition[this.KEY_word] && single_condition.not_match ^ !CeL.fit_filter(single_condition[this.KEY_word], word_data[this.KEY_word]))
		return true;
}

function match_condition(conditions, word_data, index, parent) {
	//console.trace([conditions, word_data]);
	if (!Array.isArray(conditions))
		return !not_match_single_condition.call(this, conditions, word_data) && conditions;

	const target_index = conditions.target_index || 0;

	// 檢查當前 part。
	if (not_match_single_condition.call(this, conditions[target_index], word_data))
		return;

	// 向後檢查。
	for (let index_of_condition = target_index + 1, index_of_target = index + 1; index_of_condition < conditions.length; index_of_condition++) {
		if (index_of_target >= parent.length)
			return;
		const condition = conditions[index_of_condition];
		if (not_match_single_condition.call(this, condition, parent[index_of_target])) {
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
		if (not_match_single_condition.call(this, condition, parent[index_of_target])) {
			if (!condition.optional)
				return;
			// Skip the target part.
		} else
			index_of_target--;
	}

	return conditions[target_index];
}

// ----------------------------------------------------------------------------

// POS tagging 词性标注 詞性標注
function tag_paragraph(paragraph, options) {
	return nodejieba_CN.tag(paragraph);
}

function convert_CoreNLP_result(result) {
	result = JSON.parse(result).sentences;
	const tokens = result[0].tokens;
	tokens.result = result;
	for (let index = 1; index < result.length; index++) {
		tokens.append(result[index].tokens);
	}
	return tokens;
}

// using Stanford CoreNLP
function tag_paragraph_via_CoreNLP(paragraph, options) {
	//paragraph = encodeURIComponent(paragraph);
	return new Promise((resolve, reject) => {
		this.CoreNLP_URL_properties.date = new Date;
		this.CoreNLP_URL.searchParams.set('properties', JSON.stringify(this.CoreNLP_URL_properties));
		//console.trace(this.CoreNLP_URL.toString());
		CeL.get_URL(this.CoreNLP_URL, (XMLHttp, error) => {
			if (error)
				reject(error);
			else
				resolve(convert_CoreNLP_result(XMLHttp.responseText));
		}, null, paragraph)
	});
}

// 強制轉換段落/sentence。
function forced_convert_to_TW(paragraph, index, parent, options) {
	//CeL.log(`${paragraph}→${CeL_CN_to_TW(paragraph)}`);

	// 採行 CeL.CN_to_TW() 的原因：這是經過調試，比較準確的轉換器。
	// 採用的辭典見 https://github.com/kanasimi/CeJS/blob/master/extension/zh_conversion/corrections.txt 。
	return CeL_CN_to_TW(paragraph, options);
}

function forced_convert_to_CN(paragraph, index, parent, options) {
	return CeL_TW_to_CN(paragraph, options);
}

/**
 * 轉換段落文字。
 * @param {String}paragraph 段落文字
 * @param {Object}[options]
 */
function convert_paragraph(paragraph, options) {
	const tagged_word_list = options.tagged_word_list || (this.CoreNLP_URL ? tag_paragraph_via_CoreNLP : tag_paragraph).call(this, paragraph, options);
	//console.trace(tagged_word_list);
	if (CeL.is_thenable(tagged_word_list)) {
		return tagged_word_list.then(tagged_word_list => convert_paragraph.bind(this, paragraph, { tagged_word_list, ...options }));
	}

	const convertion_pairs = this.convertion_pairs[options.convert_to_language];
	const forced_convert = (options.convert_to_language === 'TW' ? forced_convert_to_TW : forced_convert_to_CN).bind(this);
	const word_convert_mode = !options.forced_convert_mode || options.forced_convert_mode === 'word';
	const word_mode_options = { mode: 'word_first', ...options };

	let converted_text = tagged_word_list.map((word_data, index, parent) => {
		let convert_to_conditions = get_convert_to_conditions.call(this, word_data, convertion_pairs, { try_tag: true })
			|| get_convert_to_conditions.call(this, word_data, convertion_pairs)
			// TODO: 將 {Array} 之 pattern 轉成 {Regexp} 之 pattern，採用 .replace(pattern, token => match_condition(token))。
			|| get_convert_to_conditions.call(this, word_data, convertion_pairs, { try_tag: true, search_pattern: true })
			|| get_convert_to_conditions.call(this, word_data, convertion_pairs, { search_pattern: true });
		//console.trace([word_data, convert_to_conditions]);
		//console.trace(convert_to_conditions);
		if (!convert_to_conditions) {
			return word_convert_mode ? forced_convert(word_data[this.KEY_word], index, parent, word_mode_options) : word_data[this.KEY_word];
		}

		// assert: convert_to_conditions = [{ [this.KEY_word]: '詞', [this.KEY_PoS_tag]: '詞性' }, { [this.KEY_word]: '詞', [this.KEY_PoS_tag]: '詞性' }, ...]
		for (let index_of_conditions = 0; index_of_conditions < convert_to_conditions.length; index_of_conditions++) {
			const conditions = convert_to_conditions[index_of_conditions];
			const to_word_data = match_condition.call(this, conditions, word_data, index, parent);
			if (to_word_data) {
				if (to_word_data[this.KEY_word]) {
					if (to_word_data[this.KEY_word].replace_to) {
						// {RegExp}to_word_data[this.KEY_word]
						return word_data[this.KEY_word].replace(to_word_data[this.KEY_word], to_word_data[this.KEY_word].replace_to);
					}
					if (typeof to_word_data[this.KEY_word] === 'string')
						return to_word_data[this.KEY_word];
				}
				return word_data[this.KEY_word];
			}
		}

		// return the best guess.
		return convert_to_conditions[0][this.KEY_word] || (word_convert_mode ? forced_convert(word_data[this.KEY_word], index, parent, word_mode_options) : word_data[this.KEY_word]);
	}).join('');

	if (!word_convert_mode) {
		converted_text = forced_convert(converted_text);
	}
	return converted_text;
}

function convert_Chinese(paragraphs, options) {
	if (!paragraphs)
		return paragraphs === 0 ? String(paragraphs) : '';

	let converted_paragraphs;
	if (Array.isArray(options.converted_paragraphs)) {
		return return_converted_paragraphs(options, options.converted_paragraphs);
	}

	if (typeof paragraphs === 'string') {
		options.input_string = true;
		paragraphs = [paragraphs];
	}

	const domain = this.detect_domain(paragraphs, options);

	converted_paragraphs = [];
	for (const paragraph of paragraphs) {
		const converted_paragraph = convert_paragraph.call(this, paragraph, options);
		converted_paragraphs.push(converted_paragraph);

		if (CeL.is_thenable(converted_paragraph)) {
			//console.trace(`Using Promise to wait for ${converted_paragraphs.length} / ${paragraphs.length}: ${paragraph}`);
			for (let index = converted_paragraphs.length; index < paragraphs.length; index++) {
				const paragraph = paragraphs[index];
				converted_paragraphs.push(paragraph => convert_paragraph.call(this, paragraph, options));
			}
			return Promise.all(paragraphs).then(return_converted_paragraphs.bind(this, options));
		}
	}

	return return_converted_paragraphs(options, converted_paragraphs);
}

function return_converted_paragraphs(options, converted_paragraphs) {
	//console.trace(converted_paragraphs);
	if (options.input_string && Array.isArray(converted_paragraphs) && converted_paragraphs.length === 1)
		converted_paragraphs = converted_paragraphs[0];

	return converted_paragraphs;
}

// ----------------------------------------------------------------------------

Object.assign(Chinese_converter.prototype, { tag_paragraph, tag_paragraph_via_CoreNLP });

module.exports = Chinese_converter;

// export default Chinese_converter;
