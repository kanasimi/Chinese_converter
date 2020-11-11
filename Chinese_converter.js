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

const module_base_path = module.path + '/';

// Cache default convertors without CeCC.
const CeL_CN_to_TW = CeL.zh_conversion.CN_to_TW, CeL_TW_to_CN = CeL.zh_conversion.TW_to_CN;

// ----------------------------------------------------------------------------

// default
const KEY_word = 'word', KEY_PoS_tag = 'tag', KEY_filter_name = 'filter_name';

// CeCC
class Chinese_converter {
	constructor(options) {
		this.convertion_pairs = Object.create(null);
		this.KEY_word = KEY_word;
		this.KEY_PoS_tag = KEY_PoS_tag;

		if (options?.LTP_URL) {
			this.LTP_URL = options.LTP_URL;
			options.using_LTP = options.using_LTP || true;
		}

		if (options?.CoreNLP_URL) {
			// using Stanford CoreNLP
			this.KEY_PoS_tag = 'pos';
			this.CoreNLP_URL = new URL(options.CoreNLP_URL);
			// https://stanfordnlp.github.io/CoreNLP/corenlp-server.html
			this.CoreNLP_URL_properties = {
				annotators: 'tokenize,ssplit,pos,depparse',
			};
			this.dictionary_file_paths = {
				TW: 'CN_to_TW.CoreNLP.PoS.txt',
				CN: 'TW_to_CN.CoreNLP.PoS.txt'
			};
			this.tag_paragraph = tag_paragraph_via_CoreNLP;

		} else if (options?.using_LTP) {
			this.KEY_word = 'text';
			this.KEY_PoS_tag = 'pos';
			this.condition_filter = condition_filter_LTP;
			this.dictionary_file_paths = {
				TW: 'CN_to_TW.LTP.PoS.txt',
				CN: 'TW_to_CN.LTP.PoS.txt'
			};
			this.filters = {
				// CN_to_TW
				TW: require(Chinese_converter.dictionaries_directory + 'CN_to_TW.LTP.filters.js'),
				CN: require(Chinese_converter.dictionaries_directory + 'TW_to_CN.LTP.filters.js'),
			};
			this.tag_paragraph = tag_paragraph_LTP;
			// .batch_get_tag 批量查詢詞性標記之條件: 1.可接受批量{Array}。 2.單次查詢消耗太大。
			this.batch_get_tag = !this.LTP_URL;

		} else {
			// default: nodejieba
			this.nodejieba_CN = require("nodejieba");
			this.nodejieba_CN.load({ dict: Chinese_converter.dictionaries_directory + 'commons.txt' });
			this.dictionary_file_paths = {
				TW: 'CN_to_TW.jieba.PoS.txt',
				CN: 'TW_to_CN.jieba.PoS.txt'
			};
			this.tag_paragraph = tag_paragraph_jieba;
		}

		for (const language in this.dictionary_file_paths) {
			const dictionary_file_path = this.dictionary_file_paths[language] = Chinese_converter.dictionaries_directory + this.dictionary_file_paths[language];
			load_dictionary.call(this, dictionary_file_path, { language });
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

	static async has_LTP_server(options) {
		if (typeof options === 'string')
			options = { LTP_URL: options };
		else
			options = { LTP_URL: 'http://localhost:5000/', ...options };

		try {
			//console.trace(options);
			// 注意: 測試 LTP server 不可包含空白或者英數字元！
			const result = await tag_paragraph_LTP.call(options, '測試繁簡轉換伺服器');
			//console.trace(result);
			return Array.isArray(result) && options.LTP_URL;
		} catch (e) {
			//console.error(e);
		}
	}
	//#parse_condition = parse_condition
}

Chinese_converter.KEY_matched_condition = 'matched condition';
Chinese_converter.dictionaries_directory = module_base_path + 'dictionaries' + CeL.env.path_separator;

// ----------------------------------------------------------------------------

/*
conditions will be split by "+":

word
PoS:word
PoS:
// "~": 指示此 condition 為標的文字(is_target)
~PoS:word
// "!": 指示選出不符合此條件的(not_match)
!PoS:word
~!PoS:word

// 末尾的"?": 表示此條件可有可無、可以跳過(is_optional)
~!PoS:word?

// --------------------------

word:
文字
/search_pattern/flags
/search_pattern/replace_to/flags
// "~/pattern/replace_to/flags$" 表示先進行繁簡轉換再執行此處的替代，僅僅適用於標的文字(is_target)
~/pattern/replace_to/flags
文字~/pattern/replace_to/flags
/search_pattern/flags~/pattern/replace_to/flags

文字<filter_name>filter_target

*/

// [ condition, is target, not match, tag (PoS), word / pattern, is optional / repeat range ]
const PATTERN_condition = /^(?<is_target>~)?(?<not_match>!)?(?:(?<tag>[^:+<>]+):)?(?<word>.*?)(?<is_optional>\?)?$/;
// [ all, word, do_after_converting ]
const PATTERN_do_after_converting = new RegExp('^(?<word>.*?)~(?<do_after_converting>' + CeL.PATTERN_RegExp_replacement.source.slice(1, -1) + ')$');

function word_data_to_condition(word_data, options) {
	const tag = word_data[this.KEY_PoS_tag];
	return (tag ? tag + ':' : '') + (word_data[this.KEY_word] || '');
}

// parse rule
// convert {String}condition to {Object}word_data or {Object}condition
function parse_condition(condition, options) {
	condition = condition.split('+');
	let target_index;
	condition = condition.map((token, index) => {
		const matched = token.match(PATTERN_condition).groups;
		const condition_data = { condition_text: token };
		if (matched.is_target && !options?.no_target) {
			condition_data.is_target = true;
			if (target_index >= 0)
				CeL.warn(`${parse_condition.name}: Multiple target: ${condition.join('+')}`);
			else
				target_index = index;
		}

		let do_after_converting = matched.word && matched.word.match(PATTERN_do_after_converting);
		if (do_after_converting) {
			do_after_converting = do_after_converting.groups;
			matched.word = do_after_converting.word;
			condition_data.do_after_converting = do_after_converting = do_after_converting.do_after_converting.toRegExp({ allow_replacement: true });
		}
		if (matched.word) {
			let filter = matched.word.match(/^(?<word>.*?)<(?<filter_name>[^<>]+)>(?<filter_target>.*?)$/);
			if (filter) {
				if (!this.condition_filter)
					throw new Error('No .condition_filter set but set filter: ' + matched.word);
				filter = filter.groups;
				Object.assign(condition_data, {
					[this.KEY_word]: filter.word,
					[KEY_filter_name]: filter.filter_name,
					filter_target: parse_condition.call(this, filter.filter_target, { no_target: true })
				});
				//console.trace(condition_data);
			} else {
				//const replace_pattern = matched.word.match();
				condition_data[this.KEY_word] = CeL.PATTERN_RegExp.test(matched.word) || CeL.PATTERN_RegExp_replacement.test(matched.word) ? matched.word.toRegExp({ allow_replacement: true }) : matched.word;
			}
		}

		if (matched.not_match)
			condition_data.not_match = matched.not_match;
		if (matched.tag)
			condition_data[this.KEY_PoS_tag] = matched.tag;
		if (matched.is_optional)
			condition_data.is_optional = true;

		//console.trace(condition_data);
		return condition_data;
	});

	if (!(target_index >= 0) && !options?.no_target) {
		// 當僅僅只有單一 token 時，預設即為當前標的。
		condition[0].is_target = true;
	}

	if (condition.length === 1) {
		return condition[0];
	}

	if (!options?.no_target) {
		// default: set [0] as target.
		condition.target_index = target_index || 0;
	}

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

const KEY_postfix = Symbol('postfix');
function load_dictionary(file_path, options) {
	const word_list = CeL.data.pair.remove_comments(CeL.read_file(file_path)).split('\n');
	// 初始化 initialization: convertion_pairs
	const convertion_pairs = this.convertion_pairs[options.language] = new Map;
	convertion_pairs.set(KEY_tag_filter, Object.create(null));
	convertion_pairs.set(KEY_tag_pattern_filter, Object.create(null));
	convertion_pairs.set(KEY_general_pattern_filter, new Map);
	convertion_pairs.set(KEY_postfix, []);

	for (let conditions of word_list) {
		conditions = conditions.trim();
		if (!conditions)
			continue;
		conditions = conditions.split('\t');
		if (conditions.length < 2) {
			CeL.error(`${load_dictionary.name}: 未設定轉換條件: ${conditions.join('\t')}`);
			continue;
		}
		const filter = parse_condition.call(this, conditions[0]);
		if (filter.filter_name === 'postfix') {
			//console.trace(filter);
		} else if (!filter[this.KEY_word] && !filter[this.KEY_PoS_tag]) {
			if (conditions[0].trim())
				CeL.error(`Invalid word filter: ${conditions[0]}`);
			continue;
		}
		if (filter.not_match)
			throw new Error('NYI: not_match');

		const convert_to_conditions = filter.filter_name === 'postfix' ? convertion_pairs.get(KEY_postfix)
			: get_convert_to_conditions.call(this, filter, convertion_pairs, { create: true, try_tag: true });
		for (let index = 1; index < conditions.length; index++) {
			let condition = conditions[index];
			if (!condition.trim()) {
				CeL.error(`${load_dictionary.name}: Empty condition[${index}] in ${JSON.stringify(conditions)}`);
				continue;
			}
			condition = parse_condition.call(this, condition);
			// TODO: 將 {Array} 之 pattern 轉成 {Regexp} 之 pattern，採用 .replace(pattern, token => match_condition(token))。
			convert_to_conditions.push(condition);
		}
		//console.trace(convert_to_conditions);
	}
	//console.trace(this.convertion_pairs);
}

// ----------------------------------------------------------------------------

function condition_filter_LTP(single_condition, word_data, options) {
	//console.trace(options);
	if (single_condition.filter_name in this.filters[options.convert_to_language])
		return true;

	//console.trace([single_condition, word_data, options]);
	if (single_condition.filter_name === word_data.relation) {
		// 指定關係。
		//console.trace([single_condition.filter_target, options.tagged_word_list[word_data.parent]]);
		// e.g., ~只<ATT>b:/表/
		return match_single_condition.call(this, single_condition.filter_target, options.tagged_word_list[word_data.parent], options);
	}

	let matched;

	matched = single_condition.filter_name.match(/^←(.+)$/);
	if (matched) {
		// 搜尋反向關係。
		return options.tagged_word_list.some(word_data_to_test =>
			word_data_to_test.parent === word_data.id
			&& word_data_to_test.relation === matched[1]
			&& match_single_condition.call(this, single_condition.filter_target, word_data_to_test, options)
		);
	}

	matched = single_condition.filter_name.match(/(?<property_name>(?:role|parent))(?:\.(?<sub_property_name>[^:]+):(?<sub_property_value>.+))?/);
	if (matched) {
		matched = matched.groups;
		const filter_target = single_condition.filter_target;
		//console.trace([single_condition, matched, word_data]);
		// e.g., 沖<role.type:A1>/[水浴杯]/
		// 搜尋 roles / parents。
		return word_data[matched.property_name + 's'].some(token => {
			if (token.parent in options.tagged_word_list) {
				Object.assign(token, options.tagged_word_list[token.parent]);
			}
			return (!matched.sub_property_name || token[matched.sub_property_name] === matched.sub_property_value)
				&& match_single_condition.call(this, filter_target, token, options);
		});
	}
}

function match_single_condition(single_condition, word_data, options) {
	//console.trace([single_condition, word_data, options]);

	if (single_condition[KEY_filter_name]) {
		return this.condition_filter && this.condition_filter(single_condition, word_data, options);
	}

	let filter;

	// 依照最佳詞性轉換。
	// ICTPOS3.0词性标记集 https://gist.github.com/luw2007/6016931 http://ictclas.nlpir.org/
	// CKIP中文斷詞系統 詞類標記列表 http://ckipsvr.iis.sinica.edu.tw/cat.htm https://github.com/ckiplab/ckiptagger/wiki/POS-Tags
	// NLPIR 词性类别: 计算所汉语词性标记集 http://103.242.175.216:197/nlpir/html/readme.htm
	filter = single_condition[this.KEY_PoS_tag];
	if (filter
		&& !single_condition.not_match ^ CeL.fit_filter(filter, word_data[this.KEY_PoS_tag])) {
		return;
	}

	filter = single_condition[this.KEY_word];
	if (filter
		// .is_target 時， [this.KEY_word] 可能是欲改成的字串，此時不做篩選。
		&& (!single_condition.is_target || CeL.is_RegExp(filter))
		&& !single_condition.not_match ^ CeL.fit_filter(filter, word_data[this.KEY_word])) {
		//console.trace([single_condition, filter, CeL.fit_filter(filter, word_data[this.KEY_word])]);
		return;
	}

	return true;
}

function match_condition(conditions, word_data, index, tagged_word_list, options) {
	options = { ...options, conditions, word_data, index, tagged_word_list };
	//console.trace([conditions, word_data]);
	if (!Array.isArray(conditions))
		return match_single_condition.call(this, conditions, word_data, options) && conditions;

	const target_index = conditions.target_index || 0;

	// 檢查當前 part。
	if (!match_single_condition.call(this, conditions[target_index], word_data, options))
		return;

	// 向後檢查。
	for (let index_of_condition = target_index + 1, index_of_target = index + 1; index_of_condition < conditions.length; index_of_condition++) {
		if (index_of_target >= tagged_word_list.length)
			return;
		const condition = conditions[index_of_condition];
		if (match_single_condition.call(this, condition, tagged_word_list[index_of_target], options)) {
			index_of_target++;
		} else {
			if (!condition.is_optional)
				return;
			// Skip the condition, try next condition.
		}
	}

	// 向前檢查。
	for (let index_of_condition = target_index - 1, index_of_target = index - 1; index_of_condition >= 0; index_of_condition--) {
		if (index_of_target < 0)
			return;
		const condition = conditions[index_of_condition];
		if (match_single_condition.call(this, condition, tagged_word_list[index_of_target], options)) {
			index_of_target--;
		} else {
			if (!condition.is_optional)
				return;
			// Skip the condition, try next condition.
		}
	}

	return conditions[target_index];
}

function get_matched_condition(word_data, convertion_pairs, index, tagged_word_list, options) {
	let convert_to_conditions = get_convert_to_conditions.call(this, word_data, convertion_pairs, options);
	//console.trace([word_data, convert_to_conditions]);
	//console.trace(convert_to_conditions);
	if (!convert_to_conditions) {
		return;
	}

	// assert: convert_to_conditions = [{ [this.KEY_word]: '詞', [this.KEY_PoS_tag]: '詞性' }, { [this.KEY_word]: '詞', [this.KEY_PoS_tag]: '詞性' }, ...]
	for (let index_of_conditions = 0; index_of_conditions < convert_to_conditions.length; index_of_conditions++) {
		const conditions = convert_to_conditions[index_of_conditions];
		const matched_condition = match_condition.call(this, conditions, word_data, index, tagged_word_list, options);
		if (matched_condition) {
			return { matched_condition, convert_to_conditions };
		}
	}

	return { convert_to_conditions };
}

const get_all_possible_matched_condition_options = [{ try_tag: true }, , { try_tag: true, search_pattern: true }, { search_pattern: true }];
function get_all_possible_matched_condition(word_data, convertion_pairs, index, tagged_word_list, options) {
	let best_matched_data;
	for (const _options of get_all_possible_matched_condition_options) {
		// 引用 options 主要是為了 options.convert_to_language @ condition_filter_LTP()。
		const matched_data = get_matched_condition.call(this, word_data, convertion_pairs, index, tagged_word_list, { ...options, ..._options });
		if (matched_data) {
			if (matched_data.matched_condition)
				return matched_data;
			best_matched_data = best_matched_data || matched_data;
		}
	}

	return best_matched_data;
}

// ----------------------------------------------------------------------------

//const web_request_queues_count = new Map;
const web_request_queues = new Map;
// 控制流量，依照順序傳輸，別一次全部衝上去。
function add_new_web_request(host, promise) {
	if (web_request_queues.has(host)) {
		//console.log([web_request_queues_count, web_request_queues, promise]);
		//web_request_queues_count.set(host, web_request_queues_count.get(host) + 1);
		//console.log(`Set ${web_request_queues_count.get(host)} ${host}`);
		const _promise = promise;
		promise = web_request_queues.get(host)
			// clean error
			.catch(() => null)
			//.then(() => { web_request_queues_count.set(host, web_request_queues_count.get(host) - 1); console.log(`Requesting ${web_request_queues_count.get(host)} ${host}`) })
			.then(() => _promise);
		//web_request_queues_count.set(host, 0);
	}
	web_request_queues.set(host, promise);
	return promise;
}

// ----------------------------------------------

// POS tagging 词性标注 詞性標注
function tag_paragraph_jieba(paragraph, options) {
	return this.nodejieba_CN.tag(paragraph);
}

// word_data 會被寫入 cache，因此 KEY_prefix_spaces 必須為 JSON 可接受之 key（即 {String}），否則會漏失資訊！
const KEY_prefix_spaces = 'prefix spaces';
function recover_spaces(parsed, paragraph) {
	const KEY_word = this.KEY_word;
	let offset = 0;
	for (let parsed_index = 0; parsed_index < parsed.length; parsed_index++) {
		const word_data = parsed[parsed_index];
		const word = word_data[KEY_word];
		const index = paragraph.indexOf(word, offset);
		if (index === offset) {
			offset += word.length;
			continue;
		}

		if (index > offset) {
			word_data[KEY_prefix_spaces] = paragraph.slice(offset, index);
			offset = index + word.length;
			continue;
		}

		throw new Error(`Not found: ${JSON.stringify(word)} in ${paragraph}`);
	}

	if (offset < paragraph.length)
		parsed.push({ [KEY_word]: paragraph.slice(offset) });
	//console.trace(parsed);
}

// @inner 自動生成辭典用的候選條件式。
function generate_condition_LTP(configuration, options) {
	let { tagged_word_list, converted_text } = configuration;
	const should_be_text = options.should_be[options.paragraph_index];
	//console.trace([should_be_text, converted_text, tagged_word_list, options.paragraph_index]);

	let offset = 0;
	const condition_list = [];
	tagged_word_list.forEach((word_data, index) => {
		const converted_to = converted_text[index];
		const from_slice = should_be_text.substr(offset, converted_to.length);
		offset += converted_to.length;
		if (from_slice === converted_to) {
			return;
		}
		//console.trace([from_slice, word_data]);

		const condition = [word_data_to_condition.call(this, word_data)];
		if (word_data.parent >= 0) {
			condition.push(`~${from_slice.trim()}<${word_data.relation}>${word_data_to_condition.call(this, tagged_word_list[word_data.parent])}`);
		}
		word_data.roles.forEach(role => {
			condition.push(`~${from_slice.trim()}<role.type:${role.type}>${word_data_to_condition.call(this, role)}`);
		});
		word_data.parents.forEach(parent => {
			if (parent.parent >= 0) {
				condition.push(`~${from_slice.trim()}<parent.relate:${parent.relate}>${word_data_to_condition.call(this, tagged_word_list[parent.parent])}`);
			}
		});
		// 反向關係。
		tagged_word_list.forEach((_word_data, _index) => {
			if (_word_data.parent === /* word_data.id */ index) {
				condition.push(`~${from_slice.trim()}<←${_word_data.relation}>${word_data_to_condition.call(this, _word_data)}`);
			}
		});
		//CeL.info(`${generate_condition_LTP.name}: Condition for ${word_data[this.KEY_word]}→${from_slice.trim()}:`);
		Object.assign(condition, { parsed: word_data, target: from_slice.trim() });
		//CeL.log(condition.join('\t'));
		condition_list.push(condition);
	});

	return condition_list;
}

function recover_original_paragraphs(parsed, options) {
	const token_count_array = options.token_count_array;
	if (!token_count_array)
		return parsed;

	return token_count_array.map((length, index) => {
		let parsed_index = index === 0 ? 0 : token_count_array[index - 1];
		const result_token = parsed[parsed_index];
		while (++parsed_index < length) {
			result_token.append(parsed[parsed_index]);
		}
		return result_token;
	});
}

function parse_LTP_result(parsed, options) {
	if (typeof parsed === 'string')
		parsed = JSON.parse(parsed);
	//console.trace(parsed);

	let result = parsed.map((parsed_paragraph, index) => {
		const words = parsed_paragraph.words;
		if (!options.ignore_spaces && words[words.length - 1].offset + words[words.length - 1].length !== options.paragraphs_before_convert[index].length) {
			//https://github.com/HIT-SCIR/ltp/issues/201
			//https://github.com/HIT-SCIR/ltp/issues/204
			//https://github.com/HIT-SCIR/ltp/issues/408#issuecomment-686915450
			//console.trace(`Need recover spaces: ${options.paragraphs_before_convert[index]}→${words.map(word_data => word_data[this.KEY_word]).join('')}`);
			//console.trace(options.paragraphs_before_convert);
			recover_spaces.call(this, words, options.paragraphs_before_convert[index]);
		}
		return words;
	});

	result = recover_original_paragraphs(result, options);
	//console.trace(JSON.stringify(result));

	if (!options.is_Array) {
		// assert: result.length === 1
		return result[0];
	}

	return result;
}

// http://ltp.ai/docs/quickstart.html#ltp-server
function get_LTP_data(options) {
	//console.trace(options);
	const parsed_array = [];
	let promise;
	options.paragraphs_before_convert.forEach((paragraph, paragraph_index) => {
		promise = add_new_web_request(this.LTP_URL, new Promise((resolve, reject) => {
			CeL.get_URL(this.LTP_URL, (XMLHttp, error) => {
				if (error) {
					reject(error);
				} else {
					//console.log(paragraph);
					parsed_array[paragraph_index] = JSON.parse(XMLHttp.responseText);
					resolve();
				}
			}, null, { text: paragraph }, {
				headers: {
					'Content-Type': 'Content-type: application/json; charset=utf-8'
				}
			})
		}));
	});

	return promise && promise.then(parse_LTP_result.bind(this, parsed_array, options));
}

// @see resources/ltp_parse.py
const MARK_result_starts = 'Parsed JSON:';
// assert: LTP_paragraph_MAX_LENGTH <= 510
const LTP_paragraph_MAX_LENGTH = 500;

function preserve_tail(tail) {
	return tail.match(/^["'’”」：\s]*/)[0];
}

function tag_paragraph_LTP(paragraphs, options) {
	// 避免污染，重新造一個 options。
	options = { ...options, is_Array: Array.isArray(paragraphs) };
	//console.trace([this.LTP_URL, options]);

	// LTP 一次只能處理大約500字左右，因此必須適度切分。
	//https://github.com/HIT-SCIR/ltp/issues/407#issuecomment-686864300
	//bert 类的transformers都有512个最大字符长度的限制，然后我们的web demo运行的是base模型
	//https://github.com/HIT-SCIR/ltp/issues/388
	//实际上也是510，但是在输入时进行tokenize时，对于数字和英文会产生子词，所以使用字符数估计长度并不准确，另外这段话可以先进行分句操作来避免报错。
	if (!options.is_Array) {
		paragraphs = [paragraphs];
	}

	// @see https://github.com/HIT-SCIR/ltp/blob/master/ltp/utils/sent_split.py
	if (paragraphs.some(paragraph => paragraph.length > LTP_paragraph_MAX_LENGTH)) {
		const paragraphs_before_convert = options.paragraphs_before_convert = [];
		const token_count_array = options.token_count_array = [];
		paragraphs.forEach(paragraph => {
			while (paragraph.length > LTP_paragraph_MAX_LENGTH) {
				const piece = paragraph.slice(0, LTP_paragraph_MAX_LENGTH);
				let token = piece.replace(/[^。？！…]*$/, preserve_tail)
					|| piece.replace(/[^.?!，]*$/, preserve_tail)
					|| piece;
				paragraph = paragraph.slice(token.length);
				const matched = paragraph.match(/^\s+/);
				if (matched) {
					paragraph = paragraph.slice(matched[0].length);
					token += matched[0];
				}
				paragraphs_before_convert.push(token);
			}
			if (paragraph) {
				paragraphs_before_convert.push(paragraph);
			}
			token_count_array.push(paragraphs_before_convert.length);
		});
	} else {
		options.paragraphs_before_convert = paragraphs;
	}

	if (this.LTP_URL) {
		return get_LTP_data.call(this, options);
	}

	let parsed = require('child_process').execFileSync('python3', [module_base_path + 'resources/ltp_parse.py', '-j', JSON.stringify(options.paragraphs_before_convert)]);
	parsed = parsed.toString();
	//console.trace(parsed);
	parsed = parsed.between(MARK_result_starts);
	return parse_LTP_result.call(this, parsed, options);
}

function convert_CoreNLP_result(result) {
	result = JSON.parse(result).sentences;
	const tokens = result[0].tokens;
	// free
	delete result[0].tokens;
	tokens.result = result;
	for (let index = 1; index < result.length; index++) {
		tokens.append(result[index].tokens);
		// free
		delete result[index].tokens;
	}

	//console.log(tokens.map(word_data => word_data.word).join(' '));
	//"basicDependencies":[...,{"dep":"nummod","governor":8,"governorGloss":"小猫","dependent":4,"dependentGloss":"三"},...]
	//console.trace(JSON.stringify(tokens.result[0]));

	return tokens;
}

// using Stanford CoreNLP
function tag_paragraph_via_CoreNLP(paragraph, options) {
	//paragraph = encodeURIComponent(paragraph);
	return add_new_web_request(this.CoreNLP_URL, new Promise((resolve, reject) => {
		this.CoreNLP_URL_properties.date = new Date;
		this.CoreNLP_URL.searchParams.set('properties', JSON.stringify(this.CoreNLP_URL_properties));
		this.CoreNLP_URL.searchParams.set('pipelineLanguage', 'zh');
		//console.trace(this.CoreNLP_URL.toString());
		CeL.get_URL(this.CoreNLP_URL, (XMLHttp, error) => {
			if (error) {
				reject(error);
			} else {
				//console.log(paragraph);
				resolve(convert_CoreNLP_result(XMLHttp.responseText));
			}
		}, null, paragraph)
	}));
}

// --------------------------

// 強制轉換段落/sentence。
function forced_convert_to_TW(paragraph, index, tagged_word_list, options) {
	//CeL.log(`${paragraph}→${CeL_CN_to_TW(paragraph)}`);

	// 採行 CeL.CN_to_TW() 的原因：這是經過調試，比較準確的轉換器。
	// 採用的辭典見 https://github.com/kanasimi/CeJS/blob/master/extension/zh_conversion/corrections.txt 。
	return CeL_CN_to_TW(paragraph, options);
}

function forced_convert_to_CN(paragraph, index, tagged_word_list, options) {
	return CeL_TW_to_CN(paragraph, options);
}


/**
 * 轉換段落文字。
 * @param {String}paragraph 段落文字
 * @param {Object}[options]
 */
function convert_paragraph(paragraph, options) {
	let cache_directory = options.cache_directory;
	if (cache_directory) {
		if (!/[\\\/]$/.test(cache_directory))
			cache_directory += CeL.env.path_separator;

		if (!options.tagged_word_list
			// 超過此長度才 cache。
			&& (!options.min_cache_length || paragraph.length >= options.min_cache_length)
		) {
			// 避免污染，重新造一個 options。
			options = {
				...options,
				cache_file_path: cache_directory + CeL.to_file_name(paragraph.slice(0, 40) + '.' + paragraph.hashCode() + '.json')
			};
			let cache_data = CeL.read_file(options.cache_file_path);
			if (cache_data) {
				cache_data = JSON.parse(cache_data.toString());
				//console.trace(options);
				//console.trace(`Using cache file: ${options.cache_file_path}`);
				options.tagged_word_list = cache_data;
				options.tagged_word_list.is_cache = true;
			}
		}
	}

	const tagged_word_list = options.tagged_word_list || this.tag_paragraph(paragraph, options);
	//console.trace(tagged_word_list);
	if (CeL.is_thenable(tagged_word_list)) {
		return tagged_word_list.then(
			tagged_word_list => convert_paragraph.call(this, paragraph, { ...options, tagged_word_list })
		);
	}

	if (cache_directory && !options.tagged_word_list.is_cache) {
		CeL.create_directory(cache_directory);
		//console.trace(options);
		//console.trace(`Write tagged data to ${options.cache_file_path}`);
		CeL.write_file(options.cache_file_path, JSON.stringify(tagged_word_list));
	}

	// ---------------------------------------------

	const convertion_pairs = this.convertion_pairs[options.convert_to_language];
	const forced_convert = (options.convert_to_language === 'TW'
		? this.CN_to_TW || forced_convert_to_TW
		: this.TW_to_CN || forced_convert_to_CN
	).bind(this);
	const word_convert_mode = !options.forced_convert_mode || options.forced_convert_mode === 'word';
	const word_mode_options = { mode: 'word_first', ...options };

	let converted_text = tagged_word_list.map((word_data, index) => {
		const matched_condition_data = get_all_possible_matched_condition.call(this, word_data, convertion_pairs, index, tagged_word_list, options);
		if (!matched_condition_data) {
			return word_convert_mode ? forced_convert(word_data[this.KEY_word], index, tagged_word_list, word_mode_options) : word_data[this.KEY_word];
		}

		//const { convert_to_conditions, matched_condition } = matched_condition_data;
		const to_word_data = matched_condition_data.matched_condition;
		if (to_word_data) {
			if (options.generate_condition)
				word_data[Chinese_converter.KEY_matched_condition] = to_word_data;

			if (to_word_data.filter_name in this.filters[options.convert_to_language]) {
				return this.filters[options.convert_to_language][to_word_data.filter_name].call(this, { word_data, index, tagged_word_list, matched_condition_data, options });
			}

			let word = word_data[this.KEY_word], to_word = to_word_data[this.KEY_word];
			if (to_word) {
				if (to_word.replace_to) {
					// {RegExp}to_word
					word = word.replace(to_word, to_word.replace_to);
				} else if (typeof to_word === 'string') {
					word = to_word;
				} else {
					throw new Error('Invalid KEY_word: ' + to_word);
				}
			}
			const do_after_converting = to_word_data.do_after_converting;
			if (do_after_converting) {
				word = forced_convert(word, index, tagged_word_list, word_mode_options);
				word = word.replace(do_after_converting, do_after_converting.replace_to);
			}
			return word;
		}

		return word_convert_mode ? forced_convert(word_data[this.KEY_word], index, tagged_word_list, word_mode_options) : word_data[this.KEY_word];
	});
	// 維持與輸入相同格式。
	tagged_word_list.forEach((word_data, index) => {
		if (word_data[KEY_prefix_spaces])
			converted_text[index] = word_data[KEY_prefix_spaces] + converted_text[index];
	});

	// 事後轉換函數。
	//console.trace([this.convertion_pairs, options]);
	convertion_pairs.get(KEY_postfix).forEach(single_condition => {
		if (single_condition.filter_name in this.filters[options.convert_to_language]) {
			//console.trace(single_condition);
			this.filters[options.convert_to_language][single_condition.filter_name].call(this, { single_condition, converted_text, tagged_word_list, options });
		}
	});

	if (options.generate_condition && converted_text.join('') !== options.should_be[options.paragraph_index]) {
		const condition_list = generate_condition_LTP.call(this, { tagged_word_list, converted_text }, options);
		if (!options.should_be.correction_conditions)
			options.should_be.correction_conditions = [];
		options.should_be.correction_conditions[options.paragraph_index] = condition_list;
	}

	converted_text = converted_text.join('');

	if (!word_convert_mode) {
		converted_text = forced_convert(converted_text);
	}
	return converted_text;
}

function convert_Chinese(paragraphs, options) {
	if (!paragraphs)
		return paragraphs === 0 ? String(paragraphs) : '';

	if (Array.isArray(options.converted_paragraphs)) {
		return return_converted_paragraphs(options, options.converted_paragraphs);
	}

	if (typeof paragraphs === 'string') {
		options.input_string = true;
		paragraphs = [paragraphs];
	}

	const domain = this.detect_domain(paragraphs, options);

	if (this.batch_get_tag && !Array.isArray(options.tagged_word_list_of_paragraphs)) {
		// 批量取得詞性標注。
		const tagged_word_list_of_paragraphs = this.tag_paragraph(paragraphs, options);
		if (CeL.is_thenable(tagged_word_list_of_paragraphs)) {
			return options.tagged_word_list_of_paragraphs.then(tagged_word_list_of_paragraphs => {
				options.tagged_word_list_of_paragraphs = tagged_word_list_of_paragraphs;
				return execute_convert_Chinese.call(this, paragraphs, options);
			});
		}
		options.tagged_word_list_of_paragraphs = tagged_word_list_of_paragraphs;
	}

	return execute_convert_Chinese.call(this, paragraphs, options);
}

function execute_convert_Chinese(paragraphs, options) {
	let converted_paragraphs = [];
	const tagged_word_list_of_paragraphs = options.tagged_word_list_of_paragraphs;
	let some_async;
	//console.trace(paragraphs);
	for (let paragraph_index = 0; paragraph_index < paragraphs.length; paragraph_index++) {
		const paragraph = paragraphs[paragraph_index];
		let _options = options;
		if (Array.isArray(tagged_word_list_of_paragraphs)) {
			_options = { ..._options, tagged_word_list: tagged_word_list_of_paragraphs[paragraph_index] };
		}
		if (options.generate_condition) {
			_options = { ..._options, paragraph_index };
		}
		const converted_paragraph = convert_paragraph.call(this, paragraph, _options);
		//console.trace(converted_paragraph);
		converted_paragraphs.push(converted_paragraph);
		some_async = some_async || CeL.is_thenable(converted_paragraph);
	}

	if (!some_async)
		return return_converted_paragraphs(options, converted_paragraphs);

	//console.trace(`Using Promise to wait for ${converted_paragraphs.length} / ${paragraphs.length}: ${converted_paragraphs}`);
	return Promise.all(converted_paragraphs).then(
		converted_paragraphs => return_converted_paragraphs(options, converted_paragraphs)
	);
}

function return_converted_paragraphs(options, converted_paragraphs) {
	//console.trace(converted_paragraphs);
	if (options.input_string && Array.isArray(converted_paragraphs) && converted_paragraphs.length === 1)
		converted_paragraphs = converted_paragraphs[0];

	if (options.get_full_data)
		return { converted_paragraphs, tagged_word_list_of_paragraphs: options.tagged_word_list_of_paragraphs };

	// free
	//delete options.tagged_word_list_of_paragraphs;

	return converted_paragraphs;
}

// ----------------------------------------------------------------------------

// 前期轉換函數: 將網頁原始碼轉成分詞用的文字。
function normalize_HTML(html) {
	html = CeL.HTML_to_Unicode(html)
		//<br /> → "\n"
		.replace(/<br(?:\s[^<>]*)?>/ig, '\n')
		//.trim()
		//去掉 "\r"，全部轉為 "\n"。
		.replace(/\r\n?/g, '\n')
		//最多允許兩個 "\n" 以為分段。
		.replace(/\n{3,}/g, '\n\n');

	return html;
}

// ----------------------------------------------------------------------------

Object.assign(Chinese_converter.prototype, { tag_paragraph_jieba, tag_paragraph_via_CoreNLP });

module.exports = Chinese_converter;

// export { Chinese_converter };
