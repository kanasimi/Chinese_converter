/*

reset && npm test nowiki

// the 2>&1 instructs that the STDERR to be redirected to STDOUT
npm test nowiki > "test_report.txt" 2>&1

reset && cat "test_report.txt"


歸檔 general.TW.txt → general.archived.TW.txt
reset && npm test nowiki merge_new_general_test_text_to_archived remove_duplicate_lines_in_test_text_file
若為修改錯字，應在除欲修改的語句外**無其他轉換錯誤的情況下**執行完上述指令後才修改 `general.archived.TW.txt` 的錯別字。

*/

'use strict';

const Chinese_converter = require('../Chinese_converter.js');
// load module
const CeCC = require('../Chinese_converter.js');
const Fanhuaji = require('../Fanhuaji.js');

// --------------------------

const CeL = globalThis.CeL;
CeL.info('Using CeJS version: ' + CeL.version);

// load modules for test
CeL.run(['application.debug.log',
	// gettext(), and for .detect_HTML_language(), .time_zone_of_language()
	'application.locale.gettext',
]);

// ============================================================================

/** {ℕ⁰:Natural+0}count of all errors (failed + fatal) */
let all_error_count = 0;
/** {ℕ⁰:Natural+0}all tests count */
let all_tests = 0;
/** {ℕ⁰:Natural+0}tests done */
let test_done = 0;
/** {ℕ⁰:Natural}test start time value */
const test_start_time = Date.now();

// TODO: https://nodejs.org/dist/latest/docs/api/test.html
function check_tests(recorder, error_count) {
	all_error_count += error_count;
	++test_done;
	//console.trace([test_done, all_tests]);
	if (test_done < all_tests) {
		return;
	}

	// finish_test

	// 耗時，經過時間
	const elapsed_message = ' Elapsed time: '
		+ Math.round((Date.now() - test_start_time) / 1000) + ' s.';

	if (all_error_count === 0) {
		CeL.info(`check_tests: All ${all_tests} test group(s) done.${elapsed_message}`);
		// normal done. No error.
		return;
	}

	CeL.gettext.conversion['error'] = ['no %n', '1 %n', '%d %ns'];
	const error_message = CeL.gettext('All %error@1.', all_error_count) + elapsed_message;
	throw new Error(error_message);
}

function add_test(test_name, conditions) {
	if (!conditions) {
		// shift arguments: 跳過 test_name。
		conditions = test_name;
		test_name = null;
	}

	all_tests++;
	//console.trace([all_tests, test_name]);
	return CeL.test(test_name, conditions, check_tests);
}

// ============================================================================

function new_cecc() {
	const cecc = new CeCC({
		// using LTP
		using_LTP: true,
		LTP_URL: 'http://localhost:5000/',

		// using Stanford CoreNLP
		//CoreNLP_URL: 'http://localhost:9000/',
		//CoreNLP_URL: 'https://corenlp.run/',
	});

	return cecc;
}

const cecc = new_cecc();

const module_base_path = CeL.append_path_separator(module.path);
const articles_directory = CeL.append_path_separator(module_base_path + 'articles');

const default_general_test_file = `${articles_directory}general.TW.txt`;
const default_archived_general_test_file = `${articles_directory}general.archived.TW.txt`;

// ------------------------------------------------------------------

async function get_zhwiki_session() {
	CeL.run([
		// 載入操作維基百科的主要功能。
		'application.net.wiki',
		'application.net.wiki.template_functions',
	]);

	let Wikiapi;

	try {
		// Load wikiapi module.
		Wikiapi = require('../../wikiapi/wikiapi.js');
	} catch (e) {
		try {
			// Load wikiapi module.
			Wikiapi = require('wikiapi');
		} catch (e) {
			// TODO: handle exception
		}
	}

	// --------------------------

	/** {Object}wiki operator 操作子. */
	const wiki_session = new Wikiapi('zh');

	// 注意: new wiki_API() 後之操作，應該採 wiki_session.run()
	// 的方式，確保此時已經執行過 pre-loading functions @ function wiki_API():
	// wiki_session.siteinfo(), wiki_session.adapt_task_configurations()
	return new Promise(/* executor */ function (resolve, reject) {
		wiki_session.append_session_to_options().session.run(() => resolve(wiki_session));
	});
}

// ------------------------------------------------------------------

const default_convert_options = cecc.regenerate_converted.default_convert_options;

const latest_test_result_file = default_convert_options.cache_directory + 'latest_test_result.json';
let latest_test_result = CeL.read_file(latest_test_result_file);
if (latest_test_result)
	latest_test_result = JSON.parse(latest_test_result.toString());
else
	latest_test_result = Object.create(null);

async function test_paragraphs(converte_from_paragraphs, should_be, test_configuration, options) {
	const { assert, test_title } = test_configuration;
	const { tagged_word_list_of_paragraphs, converted_paragraphs }
		= await cecc[options.convert_to_language === 'TW' ? 'to_TW' : 'to_CN'](converte_from_paragraphs, { ...test_configuration.convert_options, get_full_data: true, generate_condition: true, should_be, delay_save_file: true });
	//console.trace([tagged_word_list_of_paragraphs, test_configuration, converte_from_paragraphs]);
	//const converted_paragraphs_auxiliary = await Fanhuaji[options.convert_to_language === 'TW' ? 'to_TW' : 'to_CN'](converte_from_paragraphs);
	const test_postfix = options.test_postfix ? ' ' + options.test_postfix : '';

	if (!should_be) {
		CeL.warn(`${test_title}${test_postfix ? ' -' + test_postfix : test_postfix}: No "should_be" setted!`);
		//console.trace([test_title, test_postfix]);
		return;
	}

	if (!test_configuration.test_results[test_title]) {
		test_configuration.test_results[test_title] = {
			error_count: 0,
		};
	}
	const test_results = test_configuration.test_results[test_title];
	const test_length = should_be.length;

	if (test_length !== converte_from_paragraphs.length) {
		// 含有不同數量之字串！
		CeL.warn(`${test_title}${test_postfix ? ' -' + test_postfix : test_postfix}: 預設解答與欲測試之項目數不符，將不採用解答！若檔案為自動生成，您可以刪除舊檔後，重新生成轉換標的檔案。`);
		test_results.error_count++;

	} else if (should_be.correction_conditions) {
		for (let index = 0; index < test_length; index++) {
			const condition_list = should_be.correction_conditions[index];
			if (!condition_list)
				continue;
			const configuration = converte_from_paragraphs.configurations && converte_from_paragraphs.configurations[converte_from_paragraphs[index]];
			const original_text = configuration?.原文;
			const should_convert_to_text = original_text || should_be[index];
			//if (converte_from_paragraphs.configurations) console.trace([converte_from_paragraphs.configurations, converte_from_paragraphs[index], configuration]);
			if (original_text) {
				//console.trace([converted_paragraphs[index], should_convert_to_text, configuration]);
				if (converted_paragraphs[index] !== should_convert_to_text)
					CeL.debug(`跳過測試: ${JSON.stringify(converte_from_paragraphs[index])} 轉換成→${JSON.stringify(converted_paragraphs[index])}。但已設定原文=${JSON.stringify(original_text)}。`, 1, test_paragraphs.name);
				converted_paragraphs[index] = original_text;
				continue;
			}
			if (!assert([converted_paragraphs[index], should_convert_to_text], test_title + ` #${index + 1}/${test_length}${test_postfix}`)) {
				test_results.error_count++;
				//CeL.log(`　 繁\t${JSON.stringify(should_convert_to_text)}`);
				const convert_from_text = converte_from_paragraphs[index];
				//console.trace(convert_from_text);
				//console.trace(should_be.configurations && should_be.configurations[should_convert_to_text]);
				//console.trace(should_be.correction_conditions);
				//console.trace(should_be.correction_conditions[index]);
				//console.trace(converte_from_paragraphs.configurations);
				//console.trace(tagged_word_list_of_paragraphs);
				cecc.print_section_report({
					test_title,
					// 警告: 採用 cache 會無法取得 word_data[KEY_matched_condition]，有些符合的無法顯示。
					tagged_word_list: tagged_word_list_of_paragraphs ? tagged_word_list_of_paragraphs[index] : await cecc.tag_paragraph(convert_from_text, test_configuration.convert_options),
					condition_list,
					convert_from_text,
					convert_to_text: converted_paragraphs[index],
					should_convert_to_text,
					show_tagged_word_list: test_configuration.error_count++ < test_configuration.max_error_tags_showing && test_configuration.max_error_tags_showing,
				}, options);
			} else if (false && converted_paragraphs_auxiliary[index] !== should_convert_to_text) {
				// 檢查正確性備用檢核結果。
				const convert_from_text = converte_from_paragraphs[index];
				CeL.warn('正確性備用檢核 - 繁化姬: ' + test_title);
				// 為轉換前後的差異文字著色。
				CeL.coloring_diff(should_convert_to_text, converted_paragraphs_auxiliary[index], {
					headers: [
						`解答\t`,
						`繁化姬\t`
					],
					header_style: { fg: 'cyan' }, print: true
				});
			}
		}
	}

	test_results.date = new Date;

	return converted_paragraphs;
}

async function for_each_test_set(test_configuration) {
	const { setup_test, finish_test,
		test_title, text_is_TW,
		content_paragraphs, answer_paragraphs } = test_configuration;

	const test_name = `${text_is_TW ? '' : '简→'}繁→简→繁：${test_title}`;
	setup_test(test_name);

	let TW_paragraphs, converted_CN;
	if (text_is_TW) {
		TW_paragraphs = content_paragraphs;
		converted_CN = await test_paragraphs(content_paragraphs, answer_paragraphs, test_configuration, { convert_to_language: 'CN', test_postfix: 'TW answer' });

	} else {
		TW_paragraphs = await test_paragraphs(content_paragraphs, answer_paragraphs, test_configuration, { convert_to_language: 'TW', test_postfix: 'CN answer' });
		converted_CN = await test_paragraphs(TW_paragraphs, content_paragraphs, test_configuration, { convert_to_language: 'CN', test_postfix: 'CN', message_should_be: '原简' });
	}

	await test_paragraphs(converted_CN, TW_paragraphs, test_configuration, { convert_to_language: 'TW', message_should_be: '原繁' });

	if (cecc.save_cache_file_for_short_sentences) {
		// 延遲儲存檔案。 Must save the file yourself!
		cecc.save_cache_file_for_short_sentences();
	}

	finish_test(test_name);
}

function record_test(test_configuration, options) {
	if (!latest_test_result[options.test_name])
		latest_test_result[options.test_name] = Object.create(null);
	const test_result = latest_test_result[options.test_name];
	if (!test_result.test_results)
		test_result.test_results = Object.create(null);
	Object.assign(test_result.test_results, test_configuration.test_results);
	Object.assign(test_result, {
		date: new Date,
		error_count: test_configuration.error_count,
	});

	CeL.write_file(latest_test_result_file, JSON.stringify(latest_test_result));
}

// ============================================================================

const default_write_file_options = { changed_only: true, backup: { directory_name: 'backup' } };

// /[^\n]+\n/ or /.*[\r\n]+/: /./.test('\r') === false
const PATTERN_insert_mark = new RegExp(`[\\r\\n]+\\/\\/.*?${insert_watch_target_to_general_test_text.name}.*([\r\n]+)`);

const 簡繁轉換一對多_word_mapper_hash = Object.create(null);
async function get_簡繁轉換一對多_word_mapper(options) {
	const KEY_id_list = options.text_is_TW ? '简words' : '繁words';
	if (簡繁轉換一對多_word_mapper_hash[KEY_id_list])
		return 簡繁轉換一對多_word_mapper_hash[KEY_id_list];

	const 簡繁轉換一對多_word_mapper = 簡繁轉換一對多_word_mapper_hash[KEY_id_list] = new Map;

	簡繁轉換一對多_word_mapper.KEY_id_list = KEY_id_list;

	/** {Object}wiki operator 操作子. */
	const zhwiki = await get_zhwiki_session();
	//console.trace(zhwiki.append_session_to_options());
	const page_title = 簡繁轉換一對多_word_mapper.page_title = options.text_is_TW ? '簡繁轉換一對多列表' : '繁簡轉換一對多列表';
	//console.trace(page_title);
	const page_data = await zhwiki.page(page_title, { redirects: 1 });
	//console.trace(page_data.parse());
	//console.trace(page_data);
	page_data.parse().each('Template:簡繁轉換', token => {
		//console.log(token);
		//console.trace(CeL.application.net.wiki.template_functions);
		if (token.简 === token.繁) {
			// e.g., '𥁕'
			return;
		}

		//CeL.log(`${get_簡繁轉換一對多_word_mapper.name}: ${token.简} ⇄ ${token.繁}`);
		const 繁words = token.繁.chars().unique();
		const 简words = token.简.chars().unique();
		const word_data = {
			简words, 繁words,
			title: `${简words.join(' ')} → ${繁words.join(' ')} 。`,
			pattern: new RegExp(`[${简words.join('')}${繁words.join('')}]`),
		};
		//console.log(word_data);

		//function register_word(word)
		简words.concat(繁words).unique().forEach(word => {
			if (簡繁轉換一對多_word_mapper.has(word)) {
				if (簡繁轉換一對多_word_mapper.get(word).title === word_data.title) {
					// 跳過完全相同的。
					return;
				}
				if (!简words.includes(word))
					return;
				if (簡繁轉換一對多_word_mapper.get(word)[KEY_id_list].includes(word)) {
					if (簡繁轉換一對多_word_mapper.get(word).title.length > word_data.title.length) {
						// TODO: 應該合併。
						return;
					}
					if (CeL.is_debug())
						CeL.warn(`${get_簡繁轉換一對多_word_mapper.name}: ${CeL.wiki.title_link_of(page_title)}包含重複字元:\n\t${簡繁轉換一對多_word_mapper.get(word).title}\n\t${word_data.title}`);
				}
			}
			簡繁轉換一對多_word_mapper.set(word, word_data);
		});
	});

	簡繁轉換一對多_word_mapper.pattern = new RegExp(Array.from(簡繁轉換一對多_word_mapper.keys()).join('|'));
	return 簡繁轉換一對多_word_mapper;
}


function word_block_toString() {
	let text = this.join('\n');
	if (text) text += '\n';
	// ↓ 正規化起始標記。
	return `// ↓ ${this.word_data.title}
${text}// ↑ ${this.word_data.title}`;
	// ↑ 正規化結束標記。
}

function block_append_line(line) {
	if (Array.isArray(line))
		line.forEach(_line => this.append_line(_line));
	else if (!PATTERN_block_mark.test(line))
		this.push(line);
}

function trim_block() {
	const block = this;
	while (block.length > 0 && !block.at(-1)) {
		// 去掉末尾的空行。
		block.pop();
	}
}

const PATTERN_block_mark = /^\/\/\s*(?<mark>[↑↓])\s*(?<words>.+)/;
/**
 * 創建新區塊。
 * @param {Object} word_data	- 要增添的區塊之文字資料。
 * @param {String} line			- 要增加的行文字。
 */
function append_new_block(word_data, line) {
	const general_test_text = this;
	// 初始化 last_block。
	const last_block = general_test_text.last_block = Object.assign([], {
		toString: word_block_toString,
		append_line: block_append_line,
		word_data,
		trim: trim_block,
		lines_Set: new Set,
	});

	last_block.append_line(line);

	if (!general_test_text.initialized) {
		general_test_text.push(last_block);
	} else if (general_test_text.insert_block_index >= 0) {
		general_test_text.splice(general_test_text.insert_block_index, 0, last_block, '', '');
		// 3: last_block, '', ''
		general_test_text.insert_block_index += 3;
	} else {
		general_test_text.push(last_block, '', '');
	}

	const KEY_id_list = general_test_text.簡繁轉換一對多_word_mapper.KEY_id_list;
	// 登記區塊。
	word_data.简words.concat(word_data.繁words).unique().forEach(word => {
		if (general_test_text.word_block_mapper.has(word)) {
			if (general_test_text.word_block_mapper.get(word).word_data === word_data || !word_data[KEY_id_list].includes(word))
				return;
			if (general_test_text.word_block_mapper.get(word).word_data[KEY_id_list].includes(word))
				CeL.warn(`${append_new_block.name}: 一般性測試集包含重複區塊 for ${word
					}:\n\t${general_test_text.word_block_mapper.get(word).word_data.title}\t${general_test_text.word_block_mapper.get(word).line
					}\n→\t${word_data.title}\t${line}`);
		}
		general_test_text.word_block_mapper.set(word, last_block);
	});
}

function add_line_to_block(word, line) {
	const general_test_text = this;

	if (general_test_text.word_block_mapper.has(word)) {
		const block = general_test_text.word_block_mapper.get(word);
		block.trim();
		//console.trace(line);
		block.append_line(line);
	} else {
		const word_data = general_test_text.簡繁轉換一對多_word_mapper.get(word);
		CeL.warn(`${add_line_to_block.name}: 創建新區塊 ${word_data.title}: ${line}`);
		//console.trace(word_data);
		general_test_text.append_new_block(word_data, line);
	}
}

function parse_general_test_text(insert_to_file, options) {
	const { 簡繁轉換一對多_word_mapper } = options;
	/** 一般性測試集檔案內容物件。 */
	const general_test_text = Object.assign([], {
		toString: function join_with_new_line() {
			return this.join('\n');
		},
		// general_test_text.word_block_mapper.get(word) = {Arrray}block
		word_block_mapper: new Map,
		append_new_block,
		add_line_to_block,
		簡繁轉換一對多_word_mapper,
		test_cases: 0,
	});

	/** remove duplicate lines in test text file */
	const remove_duplicate_lines_in_test_text_file = CeL.env.arg_hash?.remove_duplicate_lines_in_test_text_file;

	// parse general_test_text
	let is_in_comments, is_after_comments, lines_Set = new Set;
	const original_general_test_text = CeL.read_file(insert_to_file).toString();
	general_test_text.original_general_test_text = original_general_test_text;
	for (let line of original_general_test_text.split('\n')) {
		line = line.trim();
		if (line.includes('/*')) {
			is_in_comments = true;
		}
		if (is_in_comments) {
			// TODO: handle with "/* ... */ ... /*"
			is_in_comments = line.includes('*/');
			(general_test_text.last_block || general_test_text).push(line);
			is_after_comments = true;
			continue;
		}

		// 首次執行，標題不包含 "↓" 的情況。
		//const matched = line.match(/^\/\/\s*(?<mark>↑?)\s*(?<words>.+)/);
		// 標題全部都包含 "↓" 的情況。
		const matched = line.match(PATTERN_block_mark);
		if (matched && (general_test_text.last_block || matched.groups.mark !== '↑')) {
			is_after_comments = false;
			// parse title
			let word_data = matched.groups.words.between(null, '→').trim(), has_irrelevant_words;
			//console.trace([word_data, 簡繁轉換一對多_word_mapper.get(word_data)?.title]);
			word_data = 簡繁轉換一對多_word_mapper.get(word_data);

			matched.groups.words.replace(/[\s\/→。]/g, '').chars('').forEach(word => {
				if (!簡繁轉換一對多_word_mapper.has(word)) {
					CeL.warn(`${parse_general_test_text.name}: 未登錄於${CeL.wiki.title_link_of(簡繁轉換一對多_word_mapper.page_title)}的字元 ${word} @ ${line}`);
					//console.trace(簡繁轉換一對多_word_mapper);
					has_irrelevant_words = true;
				} else if (!word_data) {
					word_data = 簡繁轉換一對多_word_mapper.get(word);
				} else if (word_data !== 簡繁轉換一對多_word_mapper.get(word)) {
					if (簡繁轉換一對多_word_mapper.get(word)[簡繁轉換一對多_word_mapper.KEY_id_list].includes(word)) {
						//CeL.info(`${parse_general_test_text.name}: 多個相符的字元，採用原標題 @ ${word}: ${word_data.title}，其他相符候選者: ${簡繁轉換一對多_word_mapper.get(word).title}`);
					} else {
						CeL.warn(`${parse_general_test_text.name}: 不相符的字元 @ ${word}: ${word_data.title} !== ${簡繁轉換一對多_word_mapper.get(word).title}`);
						has_irrelevant_words = true;
					}
				}
			});

			if (!has_irrelevant_words && word_data) {
				if (matched.groups.mark === '↑') {
					if (word_data !== general_test_text.last_block?.word_data) {
						CeL.warn(`${parse_general_test_text.name}: 結束標記不相符: ${general_test_text.last_block?.word_data.title} !== ${word_data.title}`);
					}
					//general_test_text.last_block = null;
					delete general_test_text.last_block;
				} else if (word_data === general_test_text.last_block?.word_data) {
					CeL.warn(`${parse_general_test_text.name}: 開始標記重複，跳過此行: ${word_data.title}`);
				} else {
					//console.trace(word_data);
					general_test_text.append_new_block(word_data, line);
				}
				continue;
			}

			CeL.warn(`${parse_general_test_text.name}: ${has_irrelevant_words ? '有不相干的文字' : '無法解析標題，當做普通註解'}: ${line}`);
			// 繼續將 line 加入 general_test_text。
		}


		if (line && remove_duplicate_lines_in_test_text_file) {
			if (!is_after_comments && !line.startsWith('//') && (general_test_text.last_block?.lines_Set || lines_Set).has(line)) {
				//is_after_comments = false;
				CeL.warn(`${parse_general_test_text.name}: Skip duplicate line ${JSON.stringify(line)}`);
				continue;
			}

			is_after_comments = line.startsWith('//');
			if (!is_after_comments)
				(general_test_text.last_block?.lines_Set || lines_Set).add(line);
		}

		if (general_test_text.last_block) {
			if (!line.startsWith('//')) {
				if (!general_test_text.last_block.word_data.pattern.test(line)) {
					CeL.warn(`${parse_general_test_text.name}: 區塊中的測試語句 ${JSON.stringify(line)} 不包括欲測試字元 ${general_test_text.last_block.word_data.pattern}`);
				}
				general_test_text.test_cases++;
			}
			general_test_text.last_block.push(line);
		} else {
			// Insert new block above this line
			if (/^\/\/\s*Insert new block above this line/.test(line)) {
				general_test_text.insert_block_index = general_test_text.length;
			} else {
				general_test_text.test_cases++;
			}
			general_test_text.push(line);
		}
	}

	general_test_text.initialized = true;

	return general_test_text;
}

/**
 * 自動將個別作品測試集添加至一般性測試集的功能。
 * 
 * @param {String}insert_to_file	一般性測試集檔案路徑。
 * @param {String}insert_from_file	個別作品測試集檔案路徑。
 * @param {Object}[options]	附加參數/設定選擇性/特殊功能與選項。
 */
async function insert_watch_target_to_general_test_text(insert_to_file, insert_from_file, options) {
	if (!(CeL.fso_status(insert_from_file)?.mtime - CeL.fso_status(insert_to_file)?.mtime > 0))
		return;
	// insert_from_file is newer than insert_to_file

	//console.trace([insert_to_file, insert_from_file, options]);
	const watch_target_text = CeL.read_file(insert_from_file).toString();
	const mark_matched = watch_target_text.match(PATTERN_insert_mark);
	//console.log([PATTERN_insert_mark, matched_mark, watch_target_text]);
	if (!mark_matched)
		return;
	/** {String}個別作品測試集檔案內容。 */
	const insert_from_text = CeL.data.Convert_Pairs.remove_comments(watch_target_text.slice(mark_matched.index + mark_matched[0].length)).trim();
	if (!insert_from_text)
		return;

	CeL.info(`${insert_watch_target_to_general_test_text.name}: insert text:`);
	CeL.log(insert_from_text);

	// ---------------------------------------------

	const 簡繁轉換一對多_word_mapper = await get_簡繁轉換一對多_word_mapper(options);

	// ---------------------------------------------

	/** 一般性測試集檔案內容物件。 */
	const general_test_text = parse_general_test_text(insert_to_file, { ...options, 簡繁轉換一對多_word_mapper, });
	//console.trace(general_test_text);
	if (general_test_text.test_cases > 300) {
		CeL.warn(`${insert_watch_target_to_general_test_text.name}: 一般性測試集過大，建議封存：`);
		CeL.info('npm test nowiki merge_new_general_test_text_to_archived remove_duplicate_lines_in_test_text_file');
	}

	// ---------------------------------------------

	const pre_generated_text = general_test_text.toString();
	// TODO: 在插入個別作品測試集前檔案內容完全相同，則最後寫入原先的檔案。
	//const write_to_file = insert_to_file.replace(/([^.]*)$/, 'generated.$1');
	const exists_words = Array.from(general_test_text.word_block_mapper.keys());
	if (CeL.is_debug())
		CeL.info(`${insert_watch_target_to_general_test_text.name}: 已有之區塊字元: ${exists_words.join('')}`);
	for (let line of insert_from_text.split('\n')) {
		line = line.trim();
		if (!/[。？！…」]$/.test(line)) {
			// 轉成單行結束的句子。
			line = line.replace(/[、，；：]*$/, '。');
		}
		if (pre_generated_text.includes(line)) {
			// 避免重複添加測試語句。
			continue;
		}

		// 先從現有的區塊找尋是否有符合的 word。
		let word;
		if (!exists_words.some(_word =>
			line.includes(_word)
			&& (word = _word)
		) && (word = line.match(簡繁轉換一對多_word_mapper.pattern))) {
			word = word[0];
		}
		if (word) {
			general_test_text.add_line_to_block(word, line);

		} else {
			CeL.warn(`${insert_watch_target_to_general_test_text.name}: 個別作品測試集檔案 ${insert_from_file} 中的測試語句 ${line} 不包括欲測試字元!`);
		}
	}

	for (let index = 0; index < general_test_text.length; index++) {
		const block = general_test_text[index];
		if (Array.isArray(block)) {
			// 去掉每個 block 中，末尾的換行。
			block.trim();
		} else if (!block && index > 0 && Array.isArray(general_test_text[index - 1])) {
			// 去掉每個 block 之後緊接著的換行。
			//general_test_text.splice(index--, 1);
		}
	}

	const generated_general_test_text = general_test_text.toString();
	if (general_test_text.original_general_test_text === generated_general_test_text) {
		CeL.info(`${insert_watch_target_to_general_test_text.name}: Nothing changed.`);
	} else {
		CeL.write_file(/*write_to_file*/insert_to_file, generated_general_test_text, default_write_file_options);
		CeL.write_file(insert_from_file,
			// move mark to tail of watch target file
			watch_target_text.replace(PATTERN_insert_mark, '$1').trimEnd() + mark_matched[0], default_write_file_options);
	}
}

// ------------------------------------------------------------------

// data of default_general_test_file → default_archived_general_test_file
async function merge_new_general_test_text_to_archived() {
	const 簡繁轉換一對多_word_mapper = await get_簡繁轉換一對多_word_mapper({ text_is_TW: true });
	//console.trace(簡繁轉換一對多_word_mapper);
	const general_test_text = parse_general_test_text(default_general_test_file, { 簡繁轉換一對多_word_mapper });
	//console.trace(general_test_text.toString());
	//console.trace(general_test_text);
	const archived_general_test_text = parse_general_test_text(default_archived_general_test_file, { 簡繁轉換一對多_word_mapper });

	for (const [word, block] of general_test_text.word_block_mapper.entries()) {
		if (block.length === 0)
			continue;
		archived_general_test_text.add_line_to_block(word, block);
		block.truncate();
	}
	CeL.write_file(default_general_test_file, general_test_text.toString(), default_write_file_options);
	CeL.write_file(default_archived_general_test_file, archived_general_test_text.toString(), default_write_file_options);
}

// ------------------------------------------------------------------

async function test_正確率檢核(assert, setup_test, finish_test, options) {
	const file_list = CeL.storage.read_directory(articles_directory);
	//console.trace([articles_directory, file_list]);

	const test_configuration = {
		assert, setup_test, finish_test,
		test_results: Object.create(null),
		error_count: 0, max_error_tags_showing: 40,
	};

	const check_dictionary = true;
	//console.trace(cecc.dictionary_file_paths);
	const dictionary_file_contents = check_dictionary && Object.create(null);

	//CeL.set_debug(9);
	//console.trace(process.memoryUsage());
	for (const file_name of file_list) {
		if (file_name.includes('.bak.'))
			continue;
		let file_name_language = file_name.match(/\.(TW|CN)\.\w+$/);
		//console.trace([file_name, file_name_language]);
		if (!file_name_language)
			continue;

		const convert_options = {
			...default_convert_options,
			cache_directory: CeL.append_path_separator(default_convert_options.cache_directory + CeL.to_file_name(file_name)),
			cache_file_for_short_sentences: true,

			// default (undefined) or 'word': 每個解析出的詞單獨作 zh_conversion。
			// 'combine': 結合未符合分詞辭典規則之詞一併轉換。converter 必須有提供輸入陣列的功能。
			// false: 按照原始輸入，不作 zh_conversion。
			forced_convert_mode: 'combine',

			// 檢查辭典檔的規則。debug 用，會拖累效能。
			check_dictionary: CeL.is_debug(),

			// 不檢查/跳過通同字/同義詞，通用詞彙不算錯誤。用於無法校訂原始文件的情況。
			skip_check_for_synonyms: !file_name.startsWith(Chinese_converter.KEY_watch_target_file_name_prefix)
				// e.g., general.TW.txt
				&& !/^[a-z.]+?\.(?:TW|CN)\./.test(file_name),

			// 超過此長度才創建個別的 cache 檔案，否則會放在 .cache_file_for_short_sentences。
			min_cache_length: 20,
		};

		if (convert_options.skip_check_for_synonyms) {
			CeL.warn(`跳過 [${file_name}] 的通同字/同義詞檢查，將通同字/同義詞當作無錯誤。`);
		}

		const file_path = articles_directory + file_name;
		const answer_file_path = CeCC.to_converted_file_path(file_path);
		const text_is_TW = file_name_language[1] === 'TW';

		if (check_dictionary && !dictionary_file_contents[file_name_language[1]]) {
			dictionary_file_contents[file_name_language[1]] = CeL.read_file(cecc.dictionary_file_paths[file_name_language[1]]).toString();
		}
		const dictionary_file_content = dictionary_file_contents[file_name_language[1]];

		if (file_name.startsWith(Chinese_converter.KEY_watch_target_file_name_prefix) && text_is_TW) {
			await insert_watch_target_to_general_test_text(`${articles_directory}general.${file_name_language[1]}.txt`, file_path, { text_is_TW });
		} else if (default_general_test_file.endsWith(file_name) || default_archived_general_test_file.endsWith(file_name)) {
			load_all_tailored_dictionaries();
		}

		if (await cecc.not_new_article_to_check(file_name, {
			...options, text_is_TW,
			latest_test_result,
			convert_options,
			regenerate_converted: CeL.env.arg_hash?.regenerate_converted,
			recheck: CeL.env.arg_hash?.recheck
		})) {
			CeL.info(`${options.test_name}: Skip ${file_name}: latest test at ${latest_test_result[options.test_name].date}, no news.`);
			continue;
		}

		//console.trace([file_path, answer_file_path]);
		// IIFE
		{
			const work_title = Chinese_converter.extract_work_title_from_file_path(file_path);
			if (work_title) {
				convert_options.tailored_key = work_title;
				cecc.load_tailored_dictionary({
					export: { work_title }
				});
			}
		}

		const content_paragraphs = CeCC.get_paragraphs_of_file(file_path, { with_configurations: true });
		const answer_paragraphs = CeCC.get_paragraphs_of_file(answer_file_path);
		// @see function setup_generate_condition_for() @ Chinese_converter.js
		if (content_paragraphs?.configurations) {
			for (let index = 0; index < answer_paragraphs.length; index++) {
				const content_paragraph = content_paragraphs[index];
				if (content_paragraph in content_paragraphs.configurations) {
					const configuration = content_paragraphs.configurations[content_paragraph];
					//console.log([content_paragraph, configuration, answer_paragraphs[index]]);
					if (configuration.原文) {
						if (configuration.原文 === answer_paragraphs[index]) {
							CeL.log(`轉換前後文字相同，無需設定"原文" ${JSON.stringify(content_paragraph)}: ${JSON.stringify(configuration)}`);
						} else {
							answer_paragraphs[index] = configuration.原文;
						}
					}
				}

				if (!check_dictionary)
					continue;

				// @see CeL.data.count_word()
				if (content_paragraph.length < 6 && !/[\s、，；：。？！…）」』】]$/.test(content_paragraph.trim())) {
					// 太短的詞句大多已經檢核過，為與上下文有關的問題而設置。 e.g., "松了口气", "后土皇地祇"
					continue;
				}

				const answer_paragraph = answer_paragraphs[index];
				const converted_text_without_rule = text_is_TW ? CeL.CN_to_TW(answer_paragraph) : CeL.TW_to_CN(answer_paragraph);
				//console.trace([converted_text_without_rule, content_paragraph]);
				if (content_paragraph !== converted_text_without_rule) {
					continue;
				}

				// 辭典檔中若是包含這個字串，則代表寫進了這條字串相關的規則。
				let need_note = dictionary_file_content.indexOf(answer_paragraph.length < 7 ? answer_paragraph.trim() : answer_paragraph.replace(/[\s（「『【]+$/, '').replace(/[\s、，；：。？！…）」』】]+$/, ''));
				if (need_note > 0
					// 匹配的位置前一個是中文字。
					&& !/[\u4e00-\u9fa5]/.test(dictionary_file_content.charAt(need_note - 1))
				) {
					const line = dictionary_file_content.slice(need_note).between(null, '\n');
					need_note = !line.includes('匹配的條件式');
				} else {
					need_note = false;
				}
				// 測試所有辭典檔，看看是否有無需 CeCC 就能正確轉換的規則。
				CeL.debug('單純採用 zh_conversion 可獲得正確結果。若無上下文干擾、與其他規則衝突之問題，應可去除這條檢測之相關規則: ' + JSON.stringify(answer_paragraph) + '→' + JSON.stringify(content_paragraph), need_note ? 0 : 1);
			}
		}

		await for_each_test_set(Object.assign(test_configuration, {
			test_title: file_name, text_is_TW,
			convert_options,
			content_paragraphs,
			answer_paragraphs,
		}));
	}

	record_test(test_configuration, options);
}

function load_all_tailored_dictionaries() {
	const file_list = CeL.read_directory(cecc.tailored_dictionaries_directory);
	//console.trace(file_list);
	for (const file_name of file_list) {
		const matched = file_name.match(/^(?<work_title>[^.\n]{1,}?)\.(additional|CN_to_TW|TW_to_CN)/);
		if (!matched) {
			if (!/\.js$/.test(file_name)) {
				CeL.warn(`${load_all_tailored_dictionaries.name}: 跳過不合命名規則的檔案 ${JSON.stringify(file_name)}`);
			}
			continue;
		}
		cecc.load_tailored_dictionary({
			show_message: false,
			export: { work_title: matched.groups.work_title }
		});
	}
}


// ============================================================================

async function test_wiki_pages() {
	/** {Object}wiki operator 操作子. */
	const zhwiki = await get_zhwiki_session();

	// 抽取 HTML 文字。
	function extract_HTML_text(html) {
		return CeL.HTML_to_Unicode(html
			// 閱論編 模板
			.replace(/<abbr(\s[^<>]*)?>[\s\S]+?<\/abbr>/g, '')
			.replace(/<p(\s[^<>]*)?>/g, '\n')
			.replace(/<[^<>]+>/g, '')
			//.replace(/\n{3,}/g, '\n\n')
		);
	}

	function get_parsed_wikitext(page_data, uselang) {
		const remove_token = CeL.wiki.parser.parser_prototype.each.remove_token;
		const parsed = page_data.parse();
		parsed.each(token => {
			if (!token) return;
			// 去掉其中文字不會被繁簡轉換的 token。
			if (token.type === 'tag' && token.tag === 'ref') {
				return remove_token;
			}
			// e.g., {{Cite book}}, {{Citejournal}}
			if (token.type === 'transclusion' && /^Cite[ a-z]/.test(token.name)) {
				return remove_token;
			}
		});

		const wikitext = parsed.toString();

		return new Promise((resolve, reject) => {
			CeL.wiki.query([zhwiki.API_URL, 'action=parse'], (data, error) => {
				//console.trace(data);
				if (error)
					reject(error);
				else
					resolve(extract_HTML_text(data.parse.text['*']));
			}, {
				title: page_data.title,
				//prop: 'text|indicators|displaytitle|modules|jsconfigvars|categorieshtml|templates|langlinks|limitreporthtml|parsewarnings',
				prop: 'text',
				text: wikitext,
				pst: true,
				preview: true,
				disableeditsection: true,
				uselang,
			});
		});
	}

	// --------------------------

	add_test('zhwiki 正確率檢核', async (assert, setup_test, finish_test, options) => {
		const page_title_list = CeCC.get_paragraphs_of_file(module_base_path + 'zhwiki pages.txt');
		//console.trace([articles_directory, page_title_list]);

		const test_configuration = {
			assert, setup_test, finish_test,
			test_results: Object.create(null),
			error_count: 0, max_error_tags_showing: 0,
			text_is_TW: true,
			convert_options: {
				// 不檢查/跳過通同字/同義詞，通用詞彙不算錯誤。用於無法校訂原始文件的情況。
				skip_check_for_synonyms: true,
			}
		};

		if (page_title_list?.length > 0) {
			for (const page_title of page_title_list) {
				const page_data = await zhwiki.page(page_title, { redirects: 1 });
				//console.log(page_data.wikitext);
				// TODO: including [[維基百科:字詞轉換處理]]

				await for_each_test_set(Object.assign(test_configuration, {
					test_title: page_title,
					content_paragraphs: CeCC.get_paragraphs_of_text(await get_parsed_wikitext(page_data, 'zh-tw')),
					answer_paragraphs: CeCC.get_paragraphs_of_text(await get_parsed_wikitext(page_data, 'zh-cn')),
				}));
			}
		} else {
			CeL.warn(`${test_wiki_pages.name}: No test page specified in the file [${module_base_path + 'zhwiki pages.txt'}].`);
		}

		record_test(test_configuration, options);
	});
}

// ============================================================================

(async () => {
	//console.trace(CeL.env.arg_hash);
	if (CeL.env.arg_hash?.merge_new_general_test_text_to_archived) {
		await merge_new_general_test_text_to_archived();
		// 已改變 general.archived.TW.txt，應重新讀取檔案以避免處理的是舊資料。
		process.exit();
	}

	add_test('基本檢核', async (assert, setup_test, finish_test, options) => {
		assert([articles_directory, cecc.test_articles_directory]);
	});

	add_test('正確率檢核', test_正確率檢核);

	if (CeL.env.arg_hash?.nowiki) {
		CeL.info(`跳過 wikipedia 測試。`);
	} else if (require('os').freemem() < /* 2GB RAM */ 2 * (2 ** (10 * 3))) {
		CeL.warn(`RAM 過小 (${CeL.to_KiB(require('os').freemem())})，跳過 wikipedia 測試！`);
	} else {
		test_wiki_pages();
	}
})();
