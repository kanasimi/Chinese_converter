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

const nodejieba_CN = require("nodejieba");
nodejieba_CN.load({ dict: module_base_path + 'dictionaries/commons.txt' });

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
			load_dictionary.call(this, 'dictionaries/CN_to_TW.CoreNLP.PoS.txt', { language: 'TW' });
			load_dictionary.call(this, 'dictionaries/TW_to_CN.CoreNLP.PoS.txt', { language: 'CN' });
			this.tag_paragraph = tag_paragraph_via_CoreNLP;

		} else if (options?.using_LTP) {
			this.KEY_word = 'text';
			this.KEY_PoS_tag = 'pos';
			this.condition_filter = condition_filter_LTP;
			load_dictionary.call(this, 'dictionaries/CN_to_TW.LTP.PoS.txt', { language: 'TW' });
			load_dictionary.call(this, 'dictionaries/TW_to_CN.LTP.PoS.txt', { language: 'CN' });
			this.tag_paragraph = tag_paragraph_LTP;
			this.paragraphs_tag_mode = !this.LTP_URL;

		} else {
			load_dictionary.call(this, 'dictionaries/CN_to_TW.jieba.PoS.txt', { language: 'TW' });
			load_dictionary.call(this, 'dictionaries/TW_to_CN.jieba.PoS.txt', { language: 'CN' });
			this.tag_paragraph = tag_paragraph_jieba;
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
			const result = await get_LTP_data.call(options, '测试');
			return Array.isArray(result) && options.LTP_URL;
		} catch { }
	}
	//#parse_condition = parse_condition
}

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

// convert {String}condition to {Object}word_data or {Object}condition
function parse_condition(condition) {
	condition = condition.split('+');
	let target_index;
	condition = condition.map((token, index) => {
		const matched = token.match(PATTERN_condition).groups;
		const condition_data = Object.create(null);
		if (matched.is_target) {
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
			let filter = matched.word.match(/^(?<word>.+?)<(?<filter_name>[^<>]+)>(?<filter_target>.+?)$/);
			if (filter) {
				if (!this.condition_filter)
					throw new Error('No .condition_filter set but set filter: ' + matched.word);
				filter = filter.groups;
				Object.assign(condition_data, {
					[this.KEY_word]: filter.word,
					[KEY_filter_name]: filter.filter_name,
					filter_target: parse_condition.call(this, filter.filter_target)
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
	const word_list = CeL.data.pair.remove_comments(CeL.read_file(module_base_path + file_path)).split('\n');
	// 初始化 initialization: convertion_pairs
	const convertion_pairs = this.convertion_pairs[options.language] = new Map;
	convertion_pairs.set(KEY_tag_filter, Object.create(null));
	convertion_pairs.set(KEY_tag_pattern_filter, Object.create(null));
	convertion_pairs.set(KEY_general_pattern_filter, new Map);

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
			// TODO: 將 {Array} 之 pattern 轉成 {Regexp} 之 pattern，採用 .replace(pattern, token => match_condition(token))。
			convert_to_conditions.push(condition);
		}
		//console.trace(convert_to_conditions);
	}
}

// ----------------------------------------------------------------------------

function condition_filter_LTP(single_condition, word_data, options) {
	//console.trace([single_condition, word_data, options]);
	if (single_condition.filter_name === word_data.relation) {
		//console.trace([single_condition.filter_target, options.tagged_word_list[word_data.parent]]);
		// e.g., ~只<ATT>b:/表/
		return match_single_condition.call(this, single_condition.filter_target, options.tagged_word_list[word_data.parent], options);
	}

	let matched = single_condition.filter_name.match(/role(?:\.(type))?/);
	if (matched) {
		const test_type = matched[1], filter_target = single_condition.filter_target;
		//console.trace([single_condition, word_data.roles]);
		return word_data.roles.some(role => test_type ? role[test_type] === filter_target[this.KEY_word]
			: match_single_condition.call(this, filter_target, role, options)
		);
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

function match_condition(conditions, word_data, index, tagged_word_list) {
	let options = { conditions, word_data, index, tagged_word_list };
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
		const matched_condition = match_condition.call(this, conditions, word_data, index, tagged_word_list);
		if (matched_condition) {
			return { matched_condition, convert_to_conditions };
		}
	}

	return { convert_to_conditions };
}

const get_all_possible_matched_condition_options = [{ try_tag: true }, , { try_tag: true, search_pattern: true }, { search_pattern: true }];
function get_all_possible_matched_condition(word_data, convertion_pairs, index, tagged_word_list) {
	let best_matched_data;
	for (const options of get_all_possible_matched_condition_options) {
		const matched_data = get_matched_condition.call(this, word_data, convertion_pairs, index, tagged_word_list, options);
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
	return nodejieba_CN.tag(paragraph);
}

const KEY_prefix_spaces = Symbol('prefix spaces');
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
			word_data[KEY_prefix_spaces] = paragraph.substring(offset, index);
			offset = index + word.length;
			continue;
		}

		throw new Error(`Not found: ${JSON.stringify(word)} in ${paragraph}`);
	}

	if (offset < paragraph.length)
		parsed.push({ [KEY_word]: paragraph.slice(offset) });
	//console.trace(parsed);
}

function parse_LTP_result(parsed, options) {
	parsed = JSON.parse(parsed);
	//console.trace(parsed);
	if (!Array.isArray(parsed))
		parsed = [parsed];

	const result = parsed.map((parsed_paragraph, index) => {
		const words = parsed_paragraph.words;
		if (!options.ignore_spaces && words[words.length - 1].offset + words[words.length - 1].length !== options.original_paragraphs[index].length) {
			//https://github.com/HIT-SCIR/ltp/issues/201
			//https://github.com/HIT-SCIR/ltp/issues/204
			//https://github.com/HIT-SCIR/ltp/issues/408#issuecomment-686915450
			//console.trace(`Need recover spaces: ${options.original_paragraphs[index]}→${words.map(word_data => word_data[this.KEY_word]).join('')}`);
			recover_spaces.call(this, words, options.original_paragraphs[index]);
		}
		return words;
	});
	//console.trace(JSON.stringify(result));
	return result;
}

// http://ltp.ai/docs/quickstart.html#ltp-server
function get_LTP_data(paragraphs, options) {
	return add_new_web_request(this.LTP_URL, new Promise((resolve, reject) => {
		CeL.get_URL(this.LTP_URL, (XMLHttp, error) => {
			if (error) {
				reject(error);
			} else {
				//console.log(paragraph);
				options = { ...options, original_paragraphs: [paragraphs] };
				resolve(parse_LTP_result.call(this, XMLHttp.responseText, options)[0]);
			}
		}, null, { text: paragraphs }, {
			headers: {
				'Content-Type': 'Content-type: application/json; charset=utf-8'
			}
		})
	}));
}

// @see ltp_parse.py
const MARK_result_starts = 'Parsed JSON:';

function tag_paragraph_LTP(paragraphs, options) {
	const is_Array = Array.isArray(paragraphs);
	//console.trace([is_Array, this.LTP_URL]);
	if (is_Array || !this.LTP_URL) {
		if (!is_Array)
			paragraphs = [paragraphs];

		let parsed = require('child_process').execFileSync('python3', [module_base_path + 'resources/ltp_parse.py', '-j', JSON.stringify(paragraphs)]);
		parsed = parsed.toString();
		//console.trace(parsed);
		parsed = parsed.between(MARK_result_starts);
		options = { ...options, original_paragraphs: paragraphs };
		const result = parse_LTP_result.call(this, parsed, options);
		if (!is_Array) {
			// assert: result.length === 1
			return result[0];
		}

		return result;
	}

	return get_LTP_data.call(this, paragraphs, options);
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
	const tagged_word_list = options.tagged_word_list || this.tag_paragraph(paragraph, options);
	//console.trace(tagged_word_list);
	if (CeL.is_thenable(tagged_word_list)) {
		return tagged_word_list.then(
			tagged_word_list => convert_paragraph.call(this, paragraph, { ...options, tagged_word_list })
		);
	}

	const convertion_pairs = this.convertion_pairs[options.convert_to_language];
	const forced_convert = (options.convert_to_language === 'TW'
		? this.CN_to_TW || forced_convert_to_TW
		: this.TW_to_CN || forced_convert_to_CN
	).bind(this);
	const word_convert_mode = !options.forced_convert_mode || options.forced_convert_mode === 'word';
	const word_mode_options = { mode: 'word_first', ...options };

	let converted_text = tagged_word_list.map((word_data, index) => {
		const best_matched_data = get_all_possible_matched_condition.call(this, word_data, convertion_pairs, index, tagged_word_list);
		if (!best_matched_data) {
			return word_convert_mode ? forced_convert(word_data[this.KEY_word], index, tagged_word_list, word_mode_options) : word_data[this.KEY_word];
		}

		//const { convert_to_conditions, matched_condition } = best_matched_data;
		const to_word_data = best_matched_data.matched_condition;
		if (to_word_data) {
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

		if (!best_matched_data.convert_to_conditions[0])
			console.trace(best_matched_data)
		// return the best guess.
		const best_guess_word = best_matched_data.convert_to_conditions[0][this.KEY_word];
		if (best_guess_word && typeof best_guess_word === 'string')
			return best_guess_word;

		return word_convert_mode ? forced_convert(word_data[this.KEY_word], index, tagged_word_list, word_mode_options) : word_data[this.KEY_word];
	});
	// 維持與輸入相同格式。
	tagged_word_list.forEach((word_data, index) => {
		if (word_data[KEY_prefix_spaces])
			converted_text[index] = word_data[KEY_prefix_spaces] + converted_text[index];
	});
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

	if (this.paragraphs_tag_mode && !Array.isArray(options.tagged_word_list_of_paragraphs)) {
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
	for (let index = 0; index < paragraphs.length; index++) {
		const paragraph = paragraphs[index];
		let _options = options;
		if (Array.isArray(tagged_word_list_of_paragraphs))
			_options = { ...options, tagged_word_list: tagged_word_list_of_paragraphs[index] };
		const converted_paragraph = convert_paragraph.call(this, paragraph, _options);
		converted_paragraphs.push(converted_paragraph);
		some_async = some_async || CeL.is_thenable(converted_paragraph);
	}

	if (!some_async)
		return return_converted_paragraphs(options, converted_paragraphs);

	//console.trace(`Using Promise to wait for ${converted_paragraphs.length} / ${paragraphs.length}: ${paragraph}`);
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

Object.assign(Chinese_converter.prototype, { tag_paragraph_jieba, tag_paragraph_via_CoreNLP });

module.exports = Chinese_converter;

// export default Chinese_converter;
