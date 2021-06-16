/*

TODO:

整合繁簡轉換各家辭典
簡化辭典複雜度
特設辭典


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

/** {Number}未發現之index。 const: 基本上與程式碼設計合一，僅表示名義，不可更改。(=== -1) */
const NOT_FOUND = ''.indexOf('_');

const module_base_path = CeL.append_path_separator(module.path);
const test_directory = CeL.append_path_separator(module_base_path + '_test suite');

// Cache default convertors without CeCC.
const CeL_CN_to_TW = CeL.zh_conversion.CN_to_TW, CeL_TW_to_CN = CeL.zh_conversion.TW_to_CN;

// ----------------------------------------------------------------------------

// default
const KEY_word = 'word', KEY_PoS_tag = 'tag', KEY_filter_name = 'filter_name';
const DEFAULT_TEST_FILE_EXTENSION = 'txt';

const dictionary_template = {
	TW: 'CN_to_TW.%name.%type.txt',
	CN: 'TW_to_CN.%name.%type.txt'
};
function get_dictionary_file_paths(type) {
	if (!this.parser_name)
		throw new Error('No parser name specified!');

	const dictionary_file_paths = Object.create(null);
	for (const language in dictionary_template) {
		let path = dictionary_template[language]
			.replace('%name', this.parser_name)
			.replace('%type', type || 'PoS');
		if (type === 'filters')
			path = path.replace(/[^.]+$/, 'js');
		dictionary_file_paths[language] = path;
	}

	if (!type)
		this.dictionary_file_paths = dictionary_file_paths;
	return dictionary_file_paths;
}

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
			this.parser_name = 'CoreNLP';
			// https://stanfordnlp.github.io/CoreNLP/corenlp-server.html
			this.CoreNLP_URL_properties = {
				annotators: 'tokenize,ssplit,pos,depparse',
			};
			this.tag_paragraph = tag_paragraph_via_CoreNLP;

		} else if (options?.using_LTP) {
			this.KEY_word = 'text';
			this.KEY_PoS_tag = 'pos';
			this.TAG_punctuation = 'wp';
			this.condition_filter = condition_filter_LTP;
			this.parser_name = 'LTP';
			this.filters = get_dictionary_file_paths.call(this, 'filters');
			for (const language in this.filters) {
				this.filters[language] = require(this.dictionaries_directory + this.filters[language]);
			}
			this.generate_condition = generate_condition_LTP;
			load_synonym_dictionary.call(this);
			this.tag_paragraph = tag_paragraph_LTP;
			// .batch_get_tag 批量查詢詞性標記之條件: 1.可接受批量{Array}。 2.單次查詢消耗太大。
			this.batch_get_tag = !this.LTP_URL;

		} else {
			// default: nodejieba
			this.nodejieba_CN = require("nodejieba");
			this.nodejieba_CN.load({ dict: this.dictionaries_directory + 'commons.txt' });
			this.parser_name = 'jieba';
			this.tag_paragraph = tag_paragraph_jieba;
		}

		get_dictionary_file_paths.call(this);

		for (const language in this.dictionary_file_paths) {
			const dictionary_file_path = this.dictionary_file_paths[language]
				= this.dictionaries_directory + this.dictionary_file_paths[language];
			load_dictionary.call(this, dictionary_file_path, { language });
		}

		this.load_default_text_to_check();
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
			const result = await tag_paragraph_LTP.call(options, '測試繁簡轉換伺服器是否正常運作');
			//console.trace(result);
			return Array.isArray(result) && options.LTP_URL;
		} catch (e) {
			//console.error(e);
		}
	}
	//#parse_condition = parse_condition
}

// ----------------------------------------------------------------------------

function to_converted_file_path(convert_from_text__file_name) {
	return convert_from_text__file_name.replace(/(\.\w+)$/, '.converted$1');
}

async function regenerate_converted(convert_from_text__file_path, convert_to_text__file_status, options) {
	CeL.info(`${regenerate_converted.name}: Generate a new answer file for ${options.convert_from_text__file_name || convert_from_text__file_path}...`);

	let converted_text = CeL.read_file(convert_from_text__file_path).toString();
	//console.trace(options.convert_options);
	converted_text = options.text_is_TW
		? await this.to_CN(converted_text, options.convert_options || regenerate_converted.default_convert_options)
		: await this.to_TW(converted_text, options.convert_options || regenerate_converted.default_convert_options)
		;
	//console.trace(converted_text.slice(0, 200));
	CeL.write_file(convert_to_text__file_status
		//.replace('.answer.', '.converted.')
		, converted_text, { backup: { directory_name: 'backup' } });
}

regenerate_converted.default_convert_options = {
	cache_directory: CeL.append_path_separator(test_directory + 'cache_data'),
	min_cache_length: 40,
};

function get_convert_to_text__file_status(convert_from_text__file_name, options) {
	options = CeL.setup_options(options);
	const convert_from_text__file_path = this.test_articles_directory + convert_from_text__file_name;
	const convert_from_text__file_status = CeL.fso_status(convert_from_text__file_path);

	const convert_to_text__file_path = options.convert_to_text__file_path
		|| (options.convert_to_text__file_name ? this.test_articles_directory + options.convert_to_text__file_name : Chinese_converter.to_converted_file_path(convert_from_text__file_path));
	const convert_to_text__file_status = CeL.fso_status(convert_to_text__file_path);

	const need_to_generate_new_convert_to_text__file = options.regenerate_converted || !convert_to_text__file_status || convert_from_text__file_status.mtime - convert_to_text__file_status.mtime > 0;
	return { convert_from_text__file_path, convert_from_text__file_status, convert_to_text__file_path, convert_to_text__file_status, need_to_generate_new_convert_to_text__file };
}

async function not_new_article_to_check(convert_from_text__file_name, options) {
	options = CeL.setup_options(options);
	const { convert_from_text__file_path, convert_from_text__file_status, convert_to_text__file_path, convert_to_text__file_status, need_to_generate_new_convert_to_text__file } = get_convert_to_text__file_status.call(this, convert_from_text__file_name, options);
	if (need_to_generate_new_convert_to_text__file) {
		//console.trace('重新生成 .converted.* 解答檔案。');
		await this.regenerate_converted(convert_from_text__file_path, convert_to_text__file_path, { ...options, convert_from_text__file_name, });
	}

	if (options.recheck) {
		// 既然要重新檢查，即便詞典檔是舊的，依然算作有新變化。
		return;
	}

	// -----------------------------------

	// 檢查上一次測試後，是否有新詞典檔。
	const latest_test_result = options.latest_test_result && options.latest_test_result[options.test_name];
	const latest_test_result_for_file = latest_test_result && latest_test_result.test_results && latest_test_result.test_results[convert_from_text__file_name];
	const latest_test_result_date = latest_test_result_for_file?.error_count === 0 ? Date.parse(latest_test_result_for_file?.date)
		// 檢查是否有比測試檔或 .converted.* 解答檔案更新的新詞典檔。
		: convert_to_text__file_status ? Math.max(convert_from_text__file_status.mtime.getTime(), convert_to_text__file_status.mtime.getTime()) : convert_from_text__file_status.mtime.getTime();
	//console.trace(this.dictionary_file_paths);
	for (const dictionary_file_path of Object.values(this.dictionary_file_paths)) {
		const dictionary_file_status = CeL.fso_status(dictionary_file_path);
		//console.trace(dictionary_file_status);
		//console.trace([dictionary_file_status.mtime - latest_test_result_date, convert_from_text__file_status && convert_from_text__file_status.mtime - dictionary_file_status.mtime]);
		if (dictionary_file_status.mtime - latest_test_result_date > 0) {
			CeL.info(`${not_new_article_to_check.name}: ${convert_from_text__file_name}: 有新詞典檔 ${dictionary_file_path}`);
			if (latest_test_result)
				delete latest_test_result[convert_from_text__file_name];
			return;
		}
	}

	// 檢查上一次測試是否比測試檔更新。
	//console.trace(latest_test_result_date - convert_from_text__file_status.mtime);
	if (latest_test_result_date - convert_from_text__file_status.mtime > 0) {
		//console.trace(!convert_from_text__file_status || latest_test_result_date > convert_from_text__file_status.mtime);
		return !convert_to_text__file_status || latest_test_result_date > convert_to_text__file_status.mtime;
	}
}


const KEY_files_loaded = Symbol('files loaded');

function load_text_to_check(should_be_text__file_name, options) {
	if (CeL.is_Object(should_be_text__file_name)) {
		if (should_be_text__file_name.all) {
			CeL.read_directory(this.test_articles_directory).forEach(from_file_name => {
				const matched = from_file_name.match(/watch_target\.(?<work_title>[^.]+)\.(?<to_language>TW|CN)\.\w+$/);
				if (matched) {
					this.load_text_to_check(from_file_name, {
						export: { work_title: matched.groups.work_title }
					});
				}
			});
			return;
		}

		if (should_be_text__file_name.work_title) {
			options = CeL.setup_options(options);
			if (!options.export)
				options.export = Object.create(null);
			if (!options.export.work_title)
				options.export.work_title = should_be_text__file_name.work_title;
			//e.g., "watch_target.第一序列.TW.txt"
			should_be_text__file_name = `watch_target.${should_be_text__file_name.work_title}.${should_be_text__file_name.convert_to_language}.${DEFAULT_TEST_FILE_EXTENSION}`;
			//console.trace(should_be_text__file_name);
		} else {
			throw new Error(`${load_text_to_check.name}: Invalid should_be_text__file_name: ${JSON.stringify(should_be_text__file_name)}`);
		}
	}

	let check_language = should_be_text__file_name.match(/\.(TW|CN)\.\w+$/);
	//console.trace([should_be_text__file_name, check_language]);
	if (!check_language) {
		CeL.error(`無法判別檔案之語言: ${should_be_text__file_name}`);
		return;
	}

	check_language = check_language[1];

	const convert_to_text__data = get_convert_to_text__file_status.call(this, should_be_text__file_name, options);
	const should_be_text__file_path = convert_to_text__data.convert_from_text__file_path;
	if (!this.generate_condition_for_language
		|| options?.reset && !this.generate_condition_for_language.only_default) {
		//console.trace('初始化。');
		this.generate_condition_for_language = { [KEY_files_loaded]: [], only_default: true };
		if (!options?.is_default)
			this.load_default_text_to_check();
	}
	if (this.generate_condition_for_language[KEY_files_loaded].includes(should_be_text__file_path)) {
		CeL.log(`${load_text_to_check.name}: The file is already loaded, skip ${should_be_text__file_path}`);
		return;
	}
	if (!options?.is_default)
		delete this.generate_condition_for_language.only_default;
	this.generate_condition_for_language[KEY_files_loaded].push(should_be_text__file_path);
	const should_be_texts = get_paragraphs_of_file(should_be_text__file_path);
	if (!should_be_texts)
		return;

	const source_text__file_path = convert_to_text__data.convert_to_text__file_path;
	if (convert_to_text__data.need_to_generate_new_convert_to_text__file) {
		//console.trace('重新生成 .converted.* 解答檔案。');
		return this.regenerate_converted(should_be_text__file_path, source_text__file_path, {
			...options,
			convert_from_text__file_name: should_be_text__file_name, text_is_TW: check_language === 'TW',
			convert_options: {
				...regenerate_converted.default_convert_options,
				cache_directory: CeL.append_path_separator(regenerate_converted.default_convert_options.cache_directory + should_be_text__file_name)
			}
		}).then(setup_generate_condition_for.bind(this));

	} else {
		return setup_generate_condition_for.call(this);
	}

	function setup_generate_condition_for() {
		// should_be_text__file_path: .TW.* 為轉換之答案/標的，因此檢查的是相反語言。 .converted 才是原文！
		const source_texts = get_paragraphs_of_file(source_text__file_path);
		if (!source_texts)
			return;
		if (should_be_texts.length !== source_texts.length) {
			CeL.error(`${should_be_text__file_name} 與 ${should_be_text__file_path} 含有不同數量之字串！此${CeL.gettext.get_alias(check_language)}之標的檔與欲測試之項目數不符，將不採用解答！若檔案為自動生成，您可以刪除舊檔後，重新生成轉換標的檔案。`);
			return;
		}

		//console.log(this.generate_condition_for_language);
		// this.generate_condition_for_language[convert_to_language] = { convert_from_text: should_convert_to_text, ... }
		const generate_condition_for = this.generate_condition_for_language[check_language]
			|| (this.generate_condition_for_language[check_language] = Object.create(null));
		should_be_texts.forEach((should_convert_to_text, index) => {
			generate_condition_for[source_texts[index]] = { should_convert_to_text, ...options?.export };
		});
		const totle_count = Object.keys(generate_condition_for).length;
		CeL.info(`${load_text_to_check.name}: 自動檢核 ${should_be_texts.length}個${options?.export?.work_title ? `《${options.export.work_title}》` : '通用 '
			}${CeL.gettext.get_alias(check_language === 'TW' ? 'CN' : 'TW')}→${CeL.gettext.get_alias(check_language)
			} 之字串。${totle_count === should_be_texts.length ? '' : `總共檢核 ${totle_count}個。`}`);
		//console.trace(this.generate_condition_for_language);
		return this.generate_condition_for_language;
	}
}

// 會在每次轉換都測試是否有相符之文字。
function load_default_text_to_check() {
	this.text_to_check_files.forEach(from_file_name => this.load_text_to_check(from_file_name, { is_default: true }));
}

// 顯示用函數。
function report_text_to_check(options) {
	if (!this.generate_condition_for_language)
		return;

	const SGR_style = CeL.interact.console.SGR_style;
	const normal_style = (new SGR_style('fg=green;bg=black')).toString(), NG_style = (new SGR_style('fg=red;bg=white')).toString(), reset_style = (new SGR_style({ reset: true })).toString();

	const generate_condition_for = this.generate_condition_for_language[options.convert_to_language];
	//console.trace(generate_condition_for);
	// lost_texts: 用來記錄、顯示還有哪些尚未處理。
	const lost_texts = [], multi_matched = Object.create(null);
	let OK_count = 0, NG_count = 0;
	for (const convert_from in generate_condition_for) {
		const convert_data = generate_condition_for[convert_from];
		if (!convert_data.work_title) {
			// e.g., 常出錯詞語 @ this.text_to_check_files
			continue;
		}
		const { check_result } = convert_data;
		if (!check_result) {
			lost_texts.push(convert_data.should_convert_to_text);
			continue;
		}
		if (check_result.NG.length > 0 || check_result.OK.length /* + check_result.NG.length */ > 1) {
			multi_matched[convert_from] = check_result.OK.length;
			if (check_result.NG.length > 0)
				multi_matched[convert_from] += ` + ${NG_style}${check_result.NG.length} NG${normal_style}`;
		}
		if (check_result.NG.length > 0)
			NG_count++;
		else
			OK_count++;
	}

	const message = `${report_text_to_check.name}: ${OK_count} OK, ${NG_count
		} NG.${lost_texts.length > 0 ? ` ${lost_texts.length} lost:\n\t${lost_texts.join('\n\t')}` : ''}`;
	if (NG_count > 0) {
		CeL.error(message);
	} else {
		CeL.log(message);
	}
	const multi_matched_keys = Object.keys(multi_matched);
	if (multi_matched_keys.length > 0) {
		// 這裡可以計算某個值出現幾次。
		CeL.log(`multi matched counts:\n${normal_style
			}${multi_matched_keys.map(convert_from => `\t${convert_from}: \t${multi_matched[convert_from]}`).join('\n')
			}${reset_style}`);
	}
	return { lost_texts, OK_count, NG_count };
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

// JSON.stringify(): for "\n"
function stringify_condition(condition_text) {
	// .replace(/\r/g, '\\r').replace(/\n/g, '\\n')
	return JSON.stringify(condition_text).slice(1, -1);
}

function word_data_to_condition(word_data, options) {
	const tag = word_data[this.KEY_PoS_tag];
	return (tag ? tag + ':' : '')
		+ (options?.including_prefix_spaces && word_data[KEY_prefix_spaces] ? stringify_condition(word_data[KEY_prefix_spaces]) : '')
		+ (typeof word_data[this.KEY_word] === 'string' &&
			stringify_condition(word_data[this.KEY_word]) || word_data[this.KEY_word] || '');
}

// parse rule
// convert {String}full_condition_text to {Object}word_data or {Object}condition
function parse_condition(full_condition_text, options) {
	let target_index;

	function set_as_target(condition_data) {
		condition_data.is_target = true;
		condition_data.full_condition_text = full_condition_text;
		if (options?.matched_condition)
			condition_data.matched_condition = options.matched_condition;
	}

	const condition = full_condition_text.split('+').map((token, index) => {
		const matched = token.match(PATTERN_condition).groups;
		const condition_data = { condition_text: token };
		if (matched.is_target && !options?.no_target) {
			set_as_target(condition_data);
			if (target_index >= 0)
				CeL.warn(`${parse_condition.name}: Multiple target: ${full_condition_text}`);
			else
				target_index = index;
		}

		let do_after_converting = matched.word && matched.word.match(PATTERN_do_after_converting);
		if (do_after_converting) {
			do_after_converting = do_after_converting.groups;
			matched.word = do_after_converting.word;
			do_after_converting = do_after_converting.do_after_converting.to_RegExp({ allow_replacement: true });
			condition_data.do_after_converting = do_after_converting;
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
				condition_data[this.KEY_word] = CeL.PATTERN_RegExp.test(matched.word) || CeL.PATTERN_RegExp_replacement.test(matched.word)
					? matched.word.to_RegExp({ allow_replacement: true })
					// allow '\n' in filter.
					: matched.word.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
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
		set_as_target(condition[0]);
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

// ------------------------------------------------------------------
// 顯示用函數。

const KEY_matched_condition = 'matched condition';
function print_correction_condition(correction_condition) {
	//console.trace(correction_condition);
	const to_word_data = correction_condition.parsed[KEY_matched_condition];
	if (to_word_data) {
		//console.log(correction_condition);
		//console.log(correction_condition.parsed.parents);
		//console.trace(to_word_data);
		CeL.warn(`Matched condition 匹配的條件式: ${to_word_data.matched_condition ? `${to_word_data.matched_condition} → ` : ''}${to_word_data.full_condition_text}`);
	}
	// 自動提供可符合答案之候選條件式。
	CeL.info(`Candidate correction for ${JSON.stringify(correction_condition.parsed.text)}→${JSON.stringify(correction_condition.target)} (錯誤轉換為 ${JSON.stringify(correction_condition.error_converted_to)
		}):\n${correction_condition.join('\t')}`);
}

// 展示有問題的項目。
function print_section_report(configuration, options) {
	const { tagged_word_list, condition_list, convert_from_text, convert_to_text, should_convert_to_text, show_tagged_word_list,
		start_index, end_index } = configuration;
	const { index_hash } = condition_list;

	const SGR_style = CeL.interact.console.SGR_style;
	const normal_style_tagged = (new SGR_style('fg=blue;bg=cyan')).toString(), marked_style_row = 'fg=red;bg=white', marked_style = (new SGR_style(marked_style_row)).toString(), reset_style = (new SGR_style({ reset: true })).toString();
	const normal_style_converted_CN_row = 'fg=green;bg=black';
	const ansi_converted_CN = new CeL.interact.console.SGR(convert_from_text);

	let backward = 0, forward = 0;
	if (start_index >= 0 && should_convert_to_text.chars().length <= 4) {
		// 當截取的詞彙太短，自動擴張成一整句。
		// assert: 0 <= start_index < end_index
		let index = start_index;
		// 向前找尋標點符號。
		while (index > 0) {
			const word_data = tagged_word_list[--index];
			if (word_data[this.KEY_PoS_tag] === this.TAG_punctuation) {
				if (index < start_index && /[，；：。？！…]$/.test(word_data[this.KEY_word]))
					index++;
				break;
			}
		}
		backward = start_index - index;
		// assert: 0 <= backward <= start_index

		// start from next tagged_word_list[], at least move 1 step.
		// 向後找尋標點符號。
		index = end_index;
		while (index < tagged_word_list.length) {
			const word_data = tagged_word_list[index++];
			if (word_data[this.KEY_PoS_tag] === this.TAG_punctuation) {
				break;
			}
		}
		forward = index - end_index;
		// console.trace([start_index, backward, end_index, forward]);
	}

	const tagged_word_list_pieces = start_index >= 0 ? tagged_word_list.slice(start_index - backward, end_index + forward) : tagged_word_list;

	let offset = convert_from_text.match(/^\s*/)[0].length;
	CeL.log(`${normal_style_tagged
		}${CeL.gettext.get_alias(options.convert_to_language === 'TW' ? 'CN' : 'TW').slice(0, 1)
		}\t${tagged_word_list_pieces.map((word_data, index) => {
			const prefix_spaces = index > 0 && word_data[KEY_prefix_spaces] || '';
			if (prefix_spaces)
				offset += prefix_spaces.length;
			const start_offset = offset;
			offset += word_data[this.KEY_word].length;
			// condition filter 預設會排除 prefix spaces，因此將 prefix_spaces 另外列出。
			// @see match_single_condition()
			const text = stringify_condition(prefix_spaces) + word_data_to_condition.call(this, word_data);
			if (backward && (index -= backward) < 0) {
				return text;
			}
			if (!index_hash[start_index >= 0 ? start_index + index : index])
				return text;
			//console.log([word_data, index_hash[index]]);
			ansi_converted_CN.style_at(start_offset, marked_style_row);
			ansi_converted_CN.style_at(offset, normal_style_converted_CN_row);
			//console.trace([start_offset, offset, convert_from_text.slice(word_data.offset, word_data.offset + word_data[this.KEY_word].length)]);
			return marked_style + text + normal_style_tagged;
		}).join('+')
		}${reset_style}`);

	//console.log(ansi_converted_CN);
	//CeL.log(`\t${JSON.stringify(convert_from_text)}`);
	CeL.log(`${(new SGR_style(normal_style_converted_CN_row)).toString()
		}\t ${ansi_converted_CN.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n')}${reset_style}`);

	// 為轉換前後的差異文字著色。
	CeL.coloring_diff(JSON.stringify(convert_to_text), JSON.stringify(should_convert_to_text), {
		headers: [
			`→ ${CeL.gettext.get_alias(options.convert_to_language).slice(0, 1)}\t`,
			` ${options.message_should_be || '應為'}\t`
		],
		header_style: { fg: 'cyan' }, print: true
	});
	condition_list.forEach(print_correction_condition);
	if (show_tagged_word_list) {
		CeL.debug(beautify_tagged_word_list(tagged_word_list_pieces), 1);
	}
}

function convert_to_different_length(converted_text_String, should_be_text) {
	if (converted_text_String.chars().length !== should_be_text.chars().length) {
		// 轉換前後。
		CeL.error('預設解答與轉換後之文字長度不符，跳過此項！');
		// 為差異文字著色。
		CeL.coloring_diff(converted_text_String, should_be_text, {
			headers: [
				`轉換後:\t`,
				`解答:\t`,
			],
			header_style: { fg: 'yellow' }, print: true
		});
		return true;
	}
}

// ------------------------------------------------------------------

const KEY_tag_filter = Symbol('tag filter'), KEY_tag_pattern_filter = Symbol('tag pattern filter'), KEY_general_pattern_filter = Symbol('general pattern filter'), KEY_pattern = 'pattern';

function get_convert_to_conditions(options) {
	const { word_data, convertion_pairs }
		// incase "Variable 'options' is null checked here, but its property is accessed without null check prior"
		= options === null ? Object.create(null) : options;
	let convertion_set, key = word_data[this.KEY_word], pattern;
	const KEY_PoS_tag = this.KEY_PoS_tag;

	function set_tag_convertion(KEY) {
		convertion_set = convertion_pairs.get(KEY);
		if (!convertion_set[word_data[KEY_PoS_tag]]) {
			if (!options?.create)
				return;
			convertion_set[word_data[KEY_PoS_tag]] = new Map;
		}
		//console.trace(convertion_set);
		return convertion_set = convertion_set[word_data[KEY_PoS_tag]];
	}

	if (CeL.is_RegExp(key) || options?.search_pattern) {
		if (options?.try_tag && word_data[KEY_PoS_tag]) {
			if (!set_tag_convertion(KEY_tag_pattern_filter))
				return;
		} else {
			convertion_set = convertion_pairs.get(KEY_general_pattern_filter);
		}

		if (CeL.is_RegExp(key)) {
			pattern = key;
			key = key.toString().replace(/(\w)+$/, flags => flags.replace(/[g]/, ''));
		} else {
			const all_matched_conditions = [];
			for (const convert_to_conditions of convertion_set.values()) {
				//console.trace([key, convert_to_conditions[KEY_pattern]]);
				// assert {Array}convert_to_conditions
				if (convert_to_conditions[KEY_pattern].test(key)) {
					if (!options.get_all_matched_conditions)
						return convert_to_conditions;
					all_matched_conditions.push(convert_to_conditions);
				}
			}
			if (all_matched_conditions.length > 0) {
				if (all_matched_conditions.length > 1) {
					//console.trace(all_matched_conditions);
				}
				return all_matched_conditions;
			}
		}

	} else {
		if (options?.try_tag && word_data[KEY_PoS_tag]) {
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

	const convert_to_conditions = convertion_set.get(key);
	// assert: {Array}convert_to_conditions
	return options.get_all_matched_conditions ? [convert_to_conditions] : convert_to_conditions;
}

const KEY_postfix = Symbol('postfix');
function load_dictionary(file_path, options) {
	const word_list = get_paragraphs_of_file(file_path);
	// 初始化 initialization: convertion_pairs
	const convertion_pairs = this.convertion_pairs[options.language] = new Map;
	convertion_pairs.set(KEY_tag_filter, Object.create(null));
	convertion_pairs.set(KEY_tag_pattern_filter, Object.create(null));
	convertion_pairs.set(KEY_general_pattern_filter, new Map);
	convertion_pairs.set(KEY_postfix, []);

	for (let conditions of word_list) {
		conditions = conditions.split('\t');
		const matched_condition = conditions[0].trim();
		if (conditions.length < 2 || !matched_condition) {
			CeL.error(`${load_dictionary.name}: 未設定轉換條件: ${conditions.join('\t')}`);
			continue;
		}
		const filter = parse_condition.call(this, matched_condition);
		if (filter.filter_name === 'postfix') {
			//console.trace(filter);
		} else if (!filter[this.KEY_word] && !filter[this.KEY_PoS_tag]) {
			// assert: !!matched_condition === true
			CeL.error(`Invalid word filter: ${matched_condition}`);
			continue;
		}
		if (filter.not_match)
			throw new Error('NYI: not_match');

		const convert_to_conditions = filter.filter_name === 'postfix' ? convertion_pairs.get(KEY_postfix)
			: get_convert_to_conditions.call(this, { word_data: filter, convertion_pairs, create: true, try_tag: true });
		for (let index = 1; index < conditions.length; index++) {
			let condition = conditions[index];
			if (!condition.trim()) {
				CeL.error(`${load_dictionary.name}: Empty condition[${index}] in ${JSON.stringify(conditions)}`);
				continue;
			}
			condition = parse_condition.call(this, condition, { matched_condition });
			if (condition.do_after_converting || convert_to_conditions.length === 0 || !convert_to_conditions[convert_to_conditions.length - 1].do_after_converting) {
				// TODO: 將 {Array} 之 pattern 轉成 {Regexp} 之 pattern，採用 .replace(pattern, token => match_condition(token))。
				convert_to_conditions.push(condition);
			} else {
				// 應該將有 .do_after_converting 的擺到後面。
				let index = convert_to_conditions.length - 1;
				while (index > 0 && convert_to_conditions[index - 1].do_after_converting)
					index--;
				// assert: !convert_to_conditions[index - 1].do_after_converting && convert_to_conditions[index].do_after_converting
				// 將沒有 .do_after_converting 的插入到有 .do_after_converting 的之前。
				convert_to_conditions.splice(index, 0, condition);
			}
		}
		//console.trace(convert_to_conditions);
	}

	//console.trace(this.convertion_pairs);
}

const KEY_synonym_pattern = Symbol('synonym pattern');

function load_synonym_dictionary() {
	// this.synonyms_of_language['TW'] = {Map} { '台灣' => [ '臺灣' ] }
	if (!this.synonyms_of_language)
		this.synonyms_of_language = Object.create(null);

	const file_paths = Object.create(null);
	for (const language in dictionary_template) {
		if (!this.synonyms_of_language[language]) {
			// initialization
			this.synonyms_of_language[language] = new Map;
			this.synonyms_of_language[language][KEY_synonym_pattern] = [];
		}
		const synonyms_Map = this.synonyms_of_language[language];
		let synonym_data = CeL.read_file(this.dictionaries_directory + `synonym.${language}.txt`);
		if (!synonym_data)
			continue;

		synonym_data = CeL.data.pair.remove_comments(synonym_data.toString().replace(/\r/g, ''));
		synonym_data.split('\n').forEach(line => {
			if (!line)
				return;
			const synonyms = line.split('\t');
			const 正字正詞 = synonyms.shift();
			if (synonyms.length === 0) {
				if (CeL.PATTERN_RegExp_replacement.test(正字正詞)) {
					// {RegExp}同義詞pattern
					synonyms_Map[KEY_synonym_pattern].push(正字正詞.to_RegExp({ allow_replacement: true }));
				} else {
					CeL.error(`${load_synonym_dictionary.name}: No synonym settle: ${正字正詞}`)
				}
				return;
			}

			// 有設定`正字正詞`時，僅允許轉換成`正字正詞`，不可轉換為俗寫。
			const allowed_synonyms = 正字正詞 ? [正字正詞] : synonyms;
			synonyms.forEach(synonym => {
				if (!synonym)
					return;
				if (synonyms_Map.has(synonym))
					CeL.error(`${load_synonym_dictionary.name}: 重複設定: ${JSON.stringify(synonym)}`);
				synonyms_Map.set(synonym, allowed_synonyms);
			});
		});
	}

	//console.log(this.synonyms_of_language);
}

// ----------------------------------------------------------------------------

// @inner 須配合 generate_condition_LTP()。
function condition_filter_LTP(single_condition, word_data, options) {
	//console.trace(options);
	if (single_condition.filter_name in this.filters[options.convert_to_language])
		return true;

	//console.trace([single_condition, word_data, options]);

	const { tagged_word_list } = options;
	// assert: word_data === tagged_word_list[options.index_of_tagged_word_list]
	const tagged_word_list_index_offset = options.index_of_tagged_word_list - word_data.id;

	if (single_condition.filter_name === word_data.relation) {
		// 指定關係。
		//console.trace([single_condition.filter_target, tagged_word_list[word_data.parent]]);
		// e.g., ~只<ATT>b:/表/
		return match_single_condition.call(this, single_condition.filter_target, tagged_word_list[tagged_word_list_index_offset + word_data.parent], options);
	}

	let matched;

	matched = single_condition.filter_name.match(/^←(.+)$/);
	if (matched) {
		matched = matched[1];
		// 搜尋反向關係。
		for (let index = tagged_word_list_index_offset, latest_id = -1; index < tagged_word_list.length; index++) {
			const word_data_to_test = tagged_word_list[index];
			if (latest_id >= word_data_to_test.id) {
				// tagged_word_list 可能是 recover_original_paragraphs() 多次查詢拼合起來的。當 (latest_id > word_data_to_test.id) 的時候，已經超越本次查詢的範圍。
				// assert: word_data_to_test.id === 0
				return;
			}
			// assert: word_data_to_test.id === latest_id + 1
			latest_id = word_data_to_test.id;
			if (word_data_to_test.parent === word_data.id
				&& word_data_to_test.relation === matched
				&& match_single_condition.call(this, single_condition.filter_target, word_data_to_test, options)
			) {
				return true;
			}
		}
	}

	matched = single_condition.filter_name.match(/(?<property_name>(?:role|parent))(?:\.(?<sub_property_name>[^:]+):(?<sub_property_value>.+))?/);
	if (matched) {
		matched = matched.groups;
		const filter_target = single_condition.filter_target;
		//console.trace([single_condition, matched, word_data]);
		// e.g., 沖<role.type:A1>/[水浴杯]/
		// 搜尋 roles / parents。
		return word_data[matched.property_name + 's'].some(token => {
			const parent_index = tagged_word_list_index_offset + token.parent;
			if (parent_index in tagged_word_list) {
				Object.assign(token, tagged_word_list[parent_index]);
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
		&& !single_condition.not_match ^ (CeL.fit_filter(filter, word_data[this.KEY_word])
			// 接受 condition filter 包含 prefix spaces 的情況。
			//|| word_data[KEY_prefix_spaces] && typeof word_data[this.KEY_word] === 'string' && CeL.fit_filter(filter, word_data[KEY_prefix_spaces] + word_data[this.KEY_word])
		)
	) {
		//console.trace([single_condition, filter, CeL.fit_filter(filter, word_data[this.KEY_word])]);
		return;
	}

	return true;
}

function match_condition(options) {
	const { conditions, word_data, tagged_word_list } = options;
	//console.trace([conditions, word_data]);
	if (!Array.isArray(conditions))
		return match_single_condition.call(this, conditions, word_data, options) && conditions;

	const target_index = conditions.target_index || 0;

	// 檢查當前 part。
	if (!match_single_condition.call(this, conditions[target_index], word_data, options))
		return;

	// 向後檢查。
	for (let index_of_condition = target_index + 1, index_of_target = options.index_of_tagged_word_list + 1; index_of_condition < conditions.length; index_of_condition++) {
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
	for (let index_of_condition = target_index - 1, index_of_target = options.index_of_tagged_word_list - 1; index_of_condition >= 0; index_of_condition--) {
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

function get_matched_condition(options) {
	let all_convert_to_conditions = get_convert_to_conditions.call(this, { ...options, get_all_matched_conditions: true });
	//console.trace([word_data, all_convert_to_conditions]);
	//console.trace(all_convert_to_conditions);
	if (!all_convert_to_conditions) {
		return;
	}

	const all_matched_conditions = [];
	all_convert_to_conditions.forEach(convert_to_conditions => {
		// assert: convert_to_conditions = [{ [this.KEY_word]: '詞', [this.KEY_PoS_tag]: '詞性' }, { [this.KEY_word]: '詞', [this.KEY_PoS_tag]: '詞性' }, ...]
		for (let index_of_conditions = 0; index_of_conditions < convert_to_conditions.length; index_of_conditions++) {
			const conditions = convert_to_conditions[index_of_conditions];
			const matched_condition = match_condition.call(this, { ...options, conditions });
			if (matched_condition) {
				//console.trace([matched_condition, convert_to_conditions, convert_to_conditions.pattern]);
				all_matched_conditions.push(matched_condition);
				if (!convert_to_conditions.pattern) {
					// 對於非 pattern，僅取第一個 matched 的。
					return;
				}
			}
		}
	});
	if (all_matched_conditions.length > 0) {
		//console.trace([all_matched_conditions, all_convert_to_conditions]);
		return { all_matched_conditions, all_convert_to_conditions };
	}

	return { all_convert_to_conditions };
}

// 先測試整個詞相同的情況，再測試 {RegExp}。先測試包含詞性標注的條件式，再測試泛用情況（不論詞性）。
const get_all_possible_matched_condition_options = [
	{ try_tag: true },
	,
	{ try_tag: true, search_pattern: true },
	{ search_pattern: true }
];
function get_all_possible_matched_condition(options) {
	let best_matched_data;
	for (const _options of get_all_possible_matched_condition_options) {
		// 引用 options 主要是為了 options.convert_to_language @ condition_filter_LTP()。
		const matched_data = get_matched_condition.call(this, { ...options, ..._options });
		if (matched_data) {
			if (matched_data.all_matched_conditions)
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

		console.log(parsed);
		console.log([parsed_index, word_data]);
		throw new Error(`Not found: ${JSON.stringify(word)} in ${JSON.stringify(paragraph)}`);
	}

	//assert: offset <= paragraph.length
	if (offset < paragraph.length) {
		// append tail spaces
		const tail = paragraph.slice(offset).match(/^(\s*)([\s\S]*?)$/);
		// assert: tail[2] === ''
		const word_data = { [KEY_prefix_spaces]: tail[1], [KEY_word]: tail[2] };
		//console.trace([offset, paragraph.length, word_data]);
		parsed.push(word_data);
	}
	//console.trace(parsed);
}

// @inner 自動生成辭典用的候選條件式。須配合 condition_filter_LTP()。
function generate_condition_LTP(configuration, options) {
	const synonyms_Map = this.synonyms_of_language[options.convert_to_language];
	const { tagged_word_list, converted_text, should_be_text } = configuration;
	const start_index = configuration.start_index >= 0 ? configuration.start_index : 0;
	const end_index = isNaN(configuration.end_index) ? tagged_word_list.length : Math.min(tagged_word_list.length, configuration.end_index);
	//console.trace([configuration, options.paragraph_index, start_index, end_index]);
	const tagged_word_list_index_offset = start_index - tagged_word_list[start_index].id;
	//assert: tagged_word_list[tagged_word_list_index_offset].id === 0

	let offset = 0;
	const condition_list = [], index_hash = Object.create(null);
	condition_list.index_hash = index_hash;
	for (let index = start_index; index < end_index; index++) {
		const word_data = tagged_word_list[index];
		const converted_to = converted_text[index];
		//const index_of_should_be_slice = offset;
		const should_be_slice = should_be_text.substr(offset, converted_to.length);
		offset += converted_to.length;
		//console.trace([should_be_slice, word_data]);
		if (should_be_slice === converted_to) {
			continue;
		}
		//console.trace([should_be_slice, word_data]);
		const target = should_be_slice.trim();
		if (synonyms_Map.has(target) && synonyms_Map.get(target).includes(converted_to.trimStart())) {
			// 為可接受之同義詞，可跳過。
			continue;
		}

		const synonym_pattern_list = synonyms_Map[KEY_synonym_pattern];
		if (synonym_pattern_list.some(synonym_pattern => {
			if (synonym_pattern.test(target)
				// assert: pattern has .replace_to
				&& synonym_pattern.replace(target) === converted_to.trimStart())
				return true;
		})) {
			// 為可接受之同義詞，可跳過。
			continue;
		}

		const condition = [word_data_to_condition.call(this, word_data)];
		const stringified_target = stringify_condition(target);
		word_data.condition = condition;
		if (word_data.parent >= 0) {
			condition.push(`~${stringified_target}<${word_data.relation}>${word_data_to_condition.call(this, tagged_word_list[tagged_word_list_index_offset + word_data.parent])}`);
		}
		word_data.roles.forEach(role => {
			condition.push(`~${stringified_target}<role.type:${role.type}>${word_data_to_condition.call(this, role)}`);
		});
		word_data.parents.forEach(parent => {
			const parent_condition = word_data_to_condition.call(this, parent);
			if (parent_condition) {
				// assert: parent === tagged_word_list[tagged_word_list_index_offset + parent.id]
				condition.push(`~${stringified_target}<parent.relate:${parent.relate}>${parent_condition}`);
				//console.log(word_data);
				//console.trace(parent);
			} else {
				// 可能有 `{ parent: 103, relate: 'eSUCC' }` 之類。
				//console.trace(parent);
			}
		});
		// 反向關係。
		for (let _index = tagged_word_list_index_offset, latest_id = -1; _index < tagged_word_list.length; _index++) {
			const word_data_to_test = tagged_word_list[_index];
			if (latest_id >= word_data_to_test.id) {
				// tagged_word_list 可能是 recover_original_paragraphs() 多次查詢拼合起來的。當 (latest_id > word_data_to_test.id) 的時候，已經超越本次查詢的範圍。
				// assert: word_data_to_test.id === 0
				break;
			}
			// assert: word_data_to_test.id === latest_id + 1
			latest_id = word_data_to_test.id;
			// tagged_word_list 可能是 recover_original_paragraphs() 多次查詢拼合起來的。`word_data_to_test.parent` 實際指向的應該是 `word_data`。
			if (word_data_to_test.parent === word_data.id) {
				//console.trace(word_data_to_test);
				condition.push(`~${stringified_target}<←${word_data_to_test.relation}>${word_data_to_condition.call(this, word_data_to_test)}`);
			}
		}
		//CeL.info(`${generate_condition_LTP.name}: Condition for ${word_data[this.KEY_word]}→${stringified_target}:`);
		Object.assign(condition, {
			parsed: word_data, target, error_converted_to: converted_to,
			//should_be_slice, index_of_should_be_slice
		});
		//CeL.log(condition.join('\t'));
		condition_list.push(condition);
		index_hash[index] = condition;
	}

	return condition_list;
}

function recover_original_paragraphs(parsed, options) {
	const { token_count_array } = options;
	if (!token_count_array)
		return parsed;

	// 警告: 這種合併 merge / combine 可能造成不可靠的 .id, .offset, .parent 等！在 condition_filter_LTP() 中以 tagged_word_list_index_offset 處理此問題。
	return token_count_array.map((length, index) => {
		let parsed_index = index === 0 ? 0 : token_count_array[index - 1];
		const result_token = parsed[parsed_index];
		//Object.freeze(result_token.parents);
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
				error_retry: 4,
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
		}, null, paragraph, {
			error_retry: 4
		})
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

// 詞性標注結果換行，方便查詢檢視。
function beautify_tagged_word_list(tagged_word_list) {
	return JSON.stringify(tagged_word_list).replace(/,{"id":/g, ',\n{"id":');
}

function load_general_word_list_cache_file(/*cache_file_for_short_sentences*/cache_file_path, options) {
	if (!this.general_word_list_cache)
		this.general_word_list_cache = Object.create(null);
	if (!this.general_word_list_cache_files_loaded)
		this.general_word_list_cache_files_loaded = [];

	if (this.general_word_list_cache_files_loaded.includes(cache_file_path))
		return;

	let cache_data = CeL.read_file(cache_file_path);
	if (!cache_data)
		return;

	CeL.info(`${load_general_word_list_cache_file.name}: ${cache_file_path}`);
	cache_data = JSON.parse(cache_data.toString());
	// assert: cache_data = { paragraph: {Object}tagged_word_list, ...};
	Object.assign(this.general_word_list_cache, cache_data);
	//console.trace(this.general_word_list_cache);
	this.general_word_list_cache_files_loaded.push(cache_file_path);
}

/**
 * 轉換段落文字。
 * @param {String}paragraph 段落文字
 * @param {Object}[options]
 */
function convert_paragraph(paragraph, options) {
	let { cache_directory } = options;
	if (cache_directory) {
		cache_directory = CeL.append_path_separator(cache_directory);
		//console.trace(cache_directory);

		if (options.cache_file_for_short_sentences) {
			if (options.cache_file_for_short_sentences === true)
				options.cache_file_for_short_sentences = '!short_sentences_word_list.json';
			load_general_word_list_cache_file.call(this, cache_directory + options.cache_file_for_short_sentences, options);
		}

		if (this.general_word_list_cache && this.general_word_list_cache[paragraph]) {
			// 重新造一個 options 以避免污染。
			options = {
				...options,
				tagged_word_list: this.general_word_list_cache[paragraph]
			};
			//options.tagged_word_list.is_cache = true;

		} else if (!options.tagged_word_list
			// 超過此長度才 cache。
			&& (!options.min_cache_length || paragraph.length >= options.min_cache_length)
		) {
			// 重新造一個 options 以避免污染。
			options = {
				...options,
				cache_file_path: cache_directory + CeL.to_file_name(paragraph.slice(0, 40) + '.' + paragraph.hashCode() + '.json')
			};
			let cache_data = CeL.read_file(options.cache_file_path);
			if (cache_data) {
				try {
					cache_data = JSON.parse(cache_data.toString());
					//console.trace(options);
					//console.trace(`Using cache file: ${options.cache_file_path}`);
					options.tagged_word_list = cache_data;
					options.tagged_word_list.is_cache = true;
				} catch (e) {
					CeL.error(`${convert_paragraph.name}: Skip ${options.cache_file_path}: ${e}`);
				}
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

	// ---------------------------------------------
	// Write cache to file

	// options.cache_file_path maybe undefined!
	if (cache_directory) {
		if (options.cache_file_path) {
			if (!options.tagged_word_list.is_cache) {
				CeL.create_directory(cache_directory);
				//console.trace(options);
				//console.trace(`Write tagged data to ${options.cache_file_path}`);
				CeL.write_file(options.cache_file_path, beautify_tagged_word_list(tagged_word_list));
			}

		} else if (options.cache_file_for_short_sentences) {
			if (!this.general_word_list_cache[paragraph]) {
				this.general_word_list_cache[paragraph] = tagged_word_list;
				try {
					CeL.write_file(cache_directory + options.cache_file_for_short_sentences, this.general_word_list_cache);
				} catch (e) {
					for (const [key, value] of Object.entries(this.general_word_list_cache)) {
						try {
							JSON.stringify(value);
						} catch (e) {
							console.error(e);
							console.log([key, value]);
						}
					}
					throw e;
				}
			}
		}
	}

	// ---------------------------------------------

	const convertion_pairs = this.convertion_pairs[options.convert_to_language];
	const forced_convert = (options.convert_to_language === 'TW'
		? this.CN_to_TW || forced_convert_to_TW
		: this.TW_to_CN || forced_convert_to_CN
	).bind(this);
	const word_convert_mode = !options.forced_convert_mode || options.forced_convert_mode === 'word';
	const word_mode_options = { mode: 'word_first', ...options };

	const generate_condition_for = options.generate_condition_for || this.generate_condition_for_language && this.generate_condition_for_language[options.convert_to_language];

	let converted_text = tagged_word_list.map((word_data, index_of_tagged_word_list) => {
		// assert: word_data === tagged_word_list[index_of_tagged_word_list]
		const matched_condition_data = get_all_possible_matched_condition.call(this, { ...options, word_data, convertion_pairs, index_of_tagged_word_list, tagged_word_list });
		if (!matched_condition_data) {
			return word_convert_mode ? forced_convert(word_data[this.KEY_word], index_of_tagged_word_list, tagged_word_list, word_mode_options) : word_data[this.KEY_word];
		}

		const { all_matched_conditions } = matched_condition_data;
		if (all_matched_conditions) {
			if (all_matched_conditions.length > 1) {
				//console.trace(all_matched_conditions);
			}
			let word = word_data[this.KEY_word], had_forced_converted;
			all_matched_conditions.forEach(/*matched_condition*/to_word_data => {
				if (options.generate_condition || generate_condition_for) {
					//console.trace(to_word_data);
					word_data[KEY_matched_condition] = to_word_data;
				}

				if (to_word_data.filter_name in this.filters[options.convert_to_language]) {
					return this.filters[options.convert_to_language][to_word_data.filter_name].call(this, { word_data, index_of_tagged_word_list, tagged_word_list, matched_condition_data, options });
				}

				const to_word = to_word_data[this.KEY_word];
				if (to_word) {
					if (to_word.replace_to) {
						// {RegExp}to_word
						word = to_word.replace(word);
					} else if (typeof to_word === 'string') {
						word = to_word;
					} else {
						throw new Error('Invalid KEY_word: ' + to_word);
					}
				}
				const do_after_converting = to_word_data.do_after_converting;
				if (do_after_converting) {
					if (!had_forced_converted) {
						had_forced_converted = true;
						word = forced_convert(word, index_of_tagged_word_list, tagged_word_list, word_mode_options);
					}
					// assert: pattern has .replace_to
					word = do_after_converting.replace(word);
				}
			});

			return word;
		}

		return word_convert_mode ? forced_convert(word_data[this.KEY_word], index_of_tagged_word_list, tagged_word_list, word_mode_options) : word_data[this.KEY_word];
	});
	// 維持與輸入相同格式: 補全失落的空白字元。
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

	// ---------------------------------------------

	if (generate_condition_for && this.generate_condition) {
		// 長度累加紀錄。
		let tagged_word_list_length_accumulation, converted_text_length_accumulation;
		for (let [convert_from_text, should_convert_to] of Object.entries(generate_condition_for)) {
			const should_convert_to_text = CeL.is_Object(should_convert_to) ? should_convert_to.should_convert_to_text : should_convert_to;
			// 勣 → '𪟝'.length === 2
			if (convert_from_text.chars().length !== should_convert_to_text.chars().length) {
				CeL.error(`預設解答與轉換前之文字長度不符，刪除解答:\n\t${convert_from_text}\n→\t${should_convert_to_text}`);
				delete generate_condition_for[convert_from_text];
				continue;
			}

			// 遍歷所有相符的。例如對於主要角色人名、專有名詞、成語成句就需要此種操作。
			for (let offset = 0; (offset = paragraph.indexOf(convert_from_text, offset)) !== NOT_FOUND;
				// 避免下次從原處開始搜尋。
				offset += convert_from_text.length) {
				//console.log([paragraph, convert_from_text, offset]);
				if (!tagged_word_list_length_accumulation) {
					let length = 0;
					// 初始化。
					tagged_word_list_length_accumulation = [length];
					tagged_word_list.forEach(word_data => { tagged_word_list_length_accumulation.push(length += (word_data[KEY_prefix_spaces] ? word_data[KEY_prefix_spaces].length : 0) + word_data[this.KEY_word].length); });
				}
				if (!converted_text_length_accumulation) {
					let length = 0;
					// 初始化。
					converted_text_length_accumulation = [length];
					converted_text.forEach(token => { converted_text_length_accumulation.push(length += token.length); });
				}

				// 找出轉換後文字對應的位置。

				/** {Number}start index of converted_text */
				let start_index = offset;
				tagged_word_list_length_accumulation.search_sorted(offset, {
					found(index, is_near) {
						// 轉換前後字數可能不同。 the diff is usually +0.
						start_index += converted_text_length_accumulation[index] - tagged_word_list_length_accumulation[index];
						// for (paragraph === '李世𪟝正式吹响了出征高句丽的号角。' && convert_from_text === '出征'),
						// start_index += -1: '𪟝'.length === 2
					}
				});

				//console.assert(converted_text.join('').slice(start_index).startsWith(should_convert_to_text));

				let should_be_text = should_convert_to_text, end_index;
				converted_text_length_accumulation.search_sorted(start_index + should_be_text.length, {
					found(index, is_near) {
						//console.log(paragraph);
						//console.log([start_index, should_be_text.length, converted_text_length_accumulation]);
						//console.log([is_near, index, converted_text]);
						if (is_near) {
							should_be_text += converted_text[index].slice(start_index + should_be_text.length - converted_text_length_accumulation[index]);
							end_index = index + 1;
						} else {
							end_index = index;
						}
					}
				});
				let header_move_front = 0;
				converted_text_length_accumulation.search_sorted(start_index, {
					found(index, is_near) {
						if (is_near) {
							header_move_front = start_index - converted_text_length_accumulation[index];
							should_be_text = converted_text[index].slice(0, header_move_front) + should_be_text;
						}
						// assert: should_be_text.startsWith(converted_text[index]);
						start_index = index;
					}
				});
				const converted_text_String = converted_text.slice(start_index, end_index).join('');
				if (convert_to_different_length(converted_text_String, should_be_text)) {
					continue;
				}

				if (!CeL.is_Object(should_convert_to)) {
					// 初始化。
					generate_condition_for[convert_from_text] = should_convert_to = { should_convert_to_text };
				}
				if (!should_convert_to.check_result) {
					// 初始化。
					should_convert_to.check_result = { OK: [], NG: [] };
				}
				if (converted_text_String === should_be_text) {
					//console.trace('紀錄已處理過的項目。');
					should_convert_to.check_result.OK.push(true);
					continue;
				}

				//CeL.info(`檢查: ${convert_from_text}→${should_be_text}`);
				//console.trace({ tagged_word_list, converted_text, should_be_text, start_index, end_index });
				const condition_list = this.generate_condition({ tagged_word_list, converted_text, should_be_text, start_index, end_index }, options);
				//console.trace(condition_list);
				if (condition_list.length === 0) {
					//console.trace('只有同義詞。');
					should_convert_to.check_result.OK.push(true);
					continue;
				}

				should_convert_to.check_result.NG.push(true);
				this.print_section_report({
					tagged_word_list,
					condition_list,
					convert_from_text,
					convert_to_text: converted_text_String.slice(header_move_front)
						// remove word_data[KEY_prefix_spaces]
						.trimStart(),
					should_convert_to_text,
					start_index, end_index
				}, options);
			}

		}

	}

	if (options.generate_condition && this.generate_condition) {
		if (options.should_be) {
			//should_be_text: should_convert_to_text
			const should_be_text = options.should_be[options.paragraph_index];
			const converted_text_String = converted_text.join('');
			if (convert_to_different_length(converted_text_String, should_be_text)) {
				;

			} else if (converted_text_String !== should_be_text) {
				const condition_list = this.generate_condition({ tagged_word_list, converted_text, should_be_text }, options);
				if (condition_list.length > 0) {
					if (!options.should_be.correction_conditions)
						options.should_be.correction_conditions = [];
					options.should_be.correction_conditions[options.paragraph_index] = condition_list;
				} else {
					// 只有同義詞。
				}

			}

		} else {
			CeL.error(`未設定 options.should_be！`);
		}
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
	const { tagged_word_list_of_paragraphs } = options;
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

// 注意：LTP 於末尾有無句號、數個句子是合併或拆分解析，會有不同解析結果。
// (?:[。？！]|……)[\r\n]*|
function get_paragraphs_of_text(text) {
	if (!text)
		return;

	const paragraphs = CeL.data.pair.remove_comments(text.toString())
		.split('\n')
		.map(text => text.trim()).filter(text => !!text);

	if (paragraphs.length > 0)
		return paragraphs;
	return;
}

function get_paragraphs_of_file(file_name) {
	return get_paragraphs_of_text(CeL.read_file(file_name));
}

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

Object.assign(Chinese_converter, {
	//KEY_matched_condition,
	//KEY_prefix_spaces,
	//print_correction_condition,

	get_paragraphs_of_text, get_paragraphs_of_file,
	beautify_tagged_word_list,
	to_converted_file_path,
});

Object.assign(Chinese_converter.prototype, {
	tag_paragraph_jieba, tag_paragraph_via_CoreNLP,

	dictionaries_directory: CeL.append_path_separator(module_base_path + 'dictionaries'),

	test_articles_directory: CeL.append_path_separator(test_directory + 'articles'),
	// 這些是特別的檔案: 會自動檢核。
	text_to_check_files: ['watch_target.TW.txt', 'watch_target.CN.txt'],

	print_section_report,

	regenerate_converted, not_new_article_to_check,
	load_text_to_check, load_default_text_to_check, report_text_to_check,
});

module.exports = Chinese_converter;

// export { Chinese_converter };
