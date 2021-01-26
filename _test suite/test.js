/*

CLS && npm test nowiki

// the 2>&1 instructs that the STDERR to be redirected to STDOUT
npm test nowiki > "test_report.txt" 2>&1

CHCP 65001
CLS && type "test_report.txt"

*/

'use strict';

// load module
const CeCC = require('../Chinese_converter.js');

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

function check_tests(recorder, error_count) {
	all_error_count += error_count;
	++test_done;
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
	CeL.test(test_name, conditions, check_tests);
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

add_test('基本檢核', async (assert, setup_test, finish_test, options) => {
	assert([articles_directory, cecc.test_articles_directory]);
});

// ------------------------------------------------------------------

function get_zhwiki_session() {
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

	return wiki_session;
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
		= await cecc[options.convert_to_language === 'TW' ? 'to_TW' : 'to_CN'](converte_from_paragraphs, { ...test_configuration.convert_options, get_full_data: true, generate_condition: true, should_be });
	const test_postfix = options.test_postfix ? ' ' + options.test_postfix : '';

	if (!test_configuration.test_results[test_title]) {
		test_configuration.test_results[test_title] = {
			error_count: 0,
		};
	}
	const test_results = test_configuration.test_results[test_title];
	const test_length = should_be.length;

	if (test_length !== converte_from_paragraphs.length) {
		// 含有不同數量之字串！
		CeL.warn(`${test_title}${test_postfix}: 預設解答與欲測試之項目數不符，將不採用解答！若檔案為自動生成，您可以刪除舊檔後，重新生成轉換標的檔案。`);
		test_results.error_count++;
	} else if (should_be.correction_conditions) {
		for (let index = 0; index < test_length; index++) {
			const should_convert_to_text = should_be[index];
			const condition_list = should_be.correction_conditions[index];
			if (condition_list
				&& !assert([converted_paragraphs[index], should_convert_to_text], test_title + ` #${index + 1}/${test_length}${test_postfix}`)) {
				test_results.error_count++;
				//CeL.log(`　 繁\t${JSON.stringify(should_convert_to_text)}`);
				const convert_from_text = converte_from_paragraphs[index];
				cecc.print_section_report({
					tagged_word_list: tagged_word_list_of_paragraphs ? tagged_word_list_of_paragraphs[index] : await cecc.tag_paragraph(convert_from_text),
					condition_list,
					convert_from_text,
					convert_to_text: converted_paragraphs[index],
					should_convert_to_text,
					show_tagged_word_list: test_configuration.error_count++ < test_configuration.max_error_tags_showing && test_configuration.max_error_tags_showing,
				}, options);
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

/**
 * 自動將個別作品測試集添加至一般性測試集的功能。
 * 
 * @param {String}insert_to_file	個別作品測試集檔案路徑。
 * @param {String}insert_from_file	一般性測試集檔案路徑。
 * @param {Object}[options]	附加參數/設定選擇性/特殊功能與選項。
 */
async function insert_watch_target_to_general_test_text(insert_to_file, insert_from_file, options) {
	if (!(CeL.fso_status(insert_from_file).mtime - CeL.fso_status(insert_to_file).mtime > 0))
		return;
	// insert_from_file is newer than insert_to_file

	//console.trace([insert_to_file, insert_from_file, options]);
	let insert_from_text = CeL.data.pair.remove_comments(CeL.read_file(insert_from_file).toString().between(insert_watch_target_to_general_test_text.name).between('\n')).trim();
	if (!insert_from_text)
		return;

	CeL.info(`${insert_watch_target_to_general_test_text.name}: insert text:`);
	CeL.log(insert_from_text);

	const word_mapper = new Map;
	const KEY_id_list = options.text_is_TW ? '简words' : '繁words';

	/** {Object}wiki operator 操作子. */
	const zhwiki = get_zhwiki_session();
	const page_title = '簡繁轉換一對多列表';
	const page_data = await zhwiki.page(page_title, { redirects: 1 });
	page_data.parse().each('Template:簡繁轉換', function (token) {
		if (token.简 === token.繁) {
			// e.g., '𥁕'
			return;
		}

		//console.log(token.简 + ' ⇄ ' + token.繁);
		const 繁words = token.繁.chars().unique();
		const 简words = token.简.chars().unique();
		const word_data = {
			简words, 繁words,
			title: `${简words.join(' ')} → ${繁words.join(' ')} 。`,
			pattern: new RegExp(`[${简words.join('')}${繁words.join('')}]`),
		};

		//function register_word(word)
		简words.concat(繁words).unique().forEach(word => {
			if (word_mapper.has(word)) {
				if (word_mapper.get(word).title === word_data.title) {
					// 跳過完全相同的。
					return;
				}
				if (!简words.includes(word))
					return;
				if (word_mapper.get(word)[KEY_id_list].includes(word)) {
					if (word_mapper.get(word).title.length > word_data.title.length) {
						// TODO: 應該合併。
						return;
					}
					if (CeL.is_debug())
						CeL.warn(`${insert_watch_target_to_general_test_text.name}: ${CeL.wiki.title_link_of(page_title)}包含重複字元:\n\t${word_mapper.get(word).title}\n\t${word_data.title}`);
				}
			}
			word_mapper.set(word, word_data);
		});
	});

	word_mapper.pattern = new RegExp(Array.from(word_mapper.keys()).join('|'));

	// ---------------------------------------------

	function join_with_new_line() {
		return this.join('\n');
	}
	const general_test_text = Object.assign([], {
		toString: join_with_new_line,
		// general_test_text.word_block_mapper.get(word) = {Arrray}block
		word_block_mapper: new Map,
	});

	function append_new_block(word_data, line) {
		// 初始化 last_block。
		last_block = Object.assign([], {
			toString: join_with_new_line,
			word_data,
			line,
		});
		// 正規化起始標記。
		last_block.push(`// ↓ ${word_data.title}`);
		general_test_text.push(last_block);
		// 登記區塊。
		word_data.简words.concat(word_data.繁words).unique().forEach(word => {
			if (general_test_text.word_block_mapper.has(word)) {
				if (general_test_text.word_block_mapper.get(word).word_data === word_data || !word_data[KEY_id_list].includes(word))
					return;
				if (general_test_text.word_block_mapper.get(word).word_data[KEY_id_list].includes(word))
					CeL.warn(`${insert_watch_target_to_general_test_text.name}: 一般性測試集包含重複區塊 for ${word
						}:\n\t${general_test_text.word_block_mapper.get(word).word_data.title}\t${general_test_text.word_block_mapper.get(word).line
						}\n→\t${word_data.title}\t${line}`);
			}
			general_test_text.word_block_mapper.set(word, last_block);
		});
	}

	// parse general_test_text
	let last_block, is_in_comments;
	const original_general_test_text = CeL.read_file(insert_to_file).toString();
	for (let line of original_general_test_text.split('\n')) {
		line = line.trim();
		if (line.includes('/*')) {
			is_in_comments = true;
		}
		if (is_in_comments) {
			// TODO: handle with "/* ... */ ... /*"
			is_in_comments = line.includes('*/');
			(last_block || general_test_text).push(line);
			continue;
		}

		// 首次執行，標題不包含 "↓" 的情況。
		//const matched = line.match(/^\/\/\s*(?<mark>↑?)\s*(?<words>.+)/);
		// 標題全部都包含 "↓" 的情況。
		const matched = line.match(/^\/\/\s*(?<mark>[↑↓])\s*(?<words>.+)/);
		if (matched && (last_block || matched.groups.mark !== '↑')) {
			// parse title
			let word_data = matched.groups.words.between(null, '→').trim(), has_irrelevant_words;
			//console.trace([word_data, word_mapper.get(word_data)?.title]);
			word_data = word_mapper.get(word_data);
			if (!word_data) {
				const words = matched.groups.words.replace(/[\s\/→。]/g, '').chars('');
				words.forEach(word => {
					if (!word_mapper.has(word)) {
						CeL.warn(`${insert_watch_target_to_general_test_text.name}: 未登錄於${CeL.wiki.title_link_of(page_title)}的字元 ${word} @ ${line}`);
						has_irrelevant_words = true;
					} else if (!word_data || word_data !== word_mapper.get(word) && word_mapper.get(word)[KEY_id_list].includes(word)) {
						word_data = word_mapper.get(word);
					} else if (word_data !== word_mapper.get(word)) {
						CeL.warn(`${insert_watch_target_to_general_test_text.name}: 不相符的字元 @ ${word}: ${word_data.title} !== ${word_mapper.get(word).title}`);
						has_irrelevant_words = true;
					}
				});
			}

			if (!has_irrelevant_words && word_data) {
				if (matched.groups.mark === '↑') {
					if (word_data !== last_block.word_data) {
						CeL.warn(`${insert_watch_target_to_general_test_text.name}: 結束標記不相符: ${last_block.word_data.title} !== ${word_data.title}`);
					}
					last_block = null;
				} else {
					append_new_block(word_data, line);
				}
				continue;
			}

			CeL.warn(`${insert_watch_target_to_general_test_text.name}: ${has_irrelevant_words ? '有不相干的文字' : '無法解析標題，當做普通註解'}: ${line}`);
		}

		if (last_block) {
			if (!line.startsWith('//') && !last_block.word_data.pattern.test(line)) {
				CeL.warn(`${insert_watch_target_to_general_test_text.name}: 區塊中的測試語句 ${line} 不包括欲測試字元 ${last_block.word_data.pattern}`);
			}
			last_block.push(line);
		} else {
			general_test_text.push(line);
		}
	}

	function trim_block(block) {
		while (!block[block.length - 1]) {
			// 去掉末尾的空行。
			block.pop();
		}
	}

	const pre_generated_text = general_test_text.toString();
	// TODO: 在插入個別作品測試集前檔案內容完全相同，則最後寫入原先的檔案。
	//const write_to_file = insert_to_file.replace(/([^.]*)$/, 'generated.$1');
	const exists_words = Array.from(general_test_text.word_block_mapper.keys());
	if (CeL.is_debug())
		CeL.info(`${insert_watch_target_to_general_test_text.name}: 已有之區塊字元: ${exists_words.join('')}`);
	for (let line of insert_from_text.split('\n')) {
		line = line.trim();
		if (!/[。！…」]$/.test(line))
			line = line.replace(/[，；]*$/, '。');
		if (pre_generated_text.includes(line)) {
			// 避免重複添加測試語句。
			continue;
		}

		// 先從現有的區塊找尋是否有符合的 word。
		let word;
		if (!exists_words.some(_word => {
			if (line.includes(_word)) {
				word = _word;
				return true;
			}
		}) && (word = line.match(word_mapper.pattern))) {
			word = word[0];
		}
		if (word) {
			if (general_test_text.word_block_mapper.has(word)) {
				const block = general_test_text.word_block_mapper.get(word);
				trim_block(block);
				block.push(line);
			} else {
				const word_data = word_mapper.get(word);
				CeL.warn(`${insert_watch_target_to_general_test_text.name}: 創建新區塊 ${word_data.title}: ${line}`);
				append_new_block(word_data, line);
			}

		} else {
			CeL.warn(`${insert_watch_target_to_general_test_text.name}: watch_target 中的測試語句 ${line} 不包括欲測試字元`);
		}
	}

	for (let index = 0; index < general_test_text.length; index++) {
		const block = general_test_text[index];
		if (Array.isArray(block)) {
			trim_block(block);
			// 正規化結束標記。
			block.push(`// ↑ ${block.word_data.title}`, '', '');
		} else if (!block && index > 0 && Array.isArray(general_test_text[index - 1])) {
			general_test_text.splice(index--, 1);
		}
	}

	const generated_general_test_text = general_test_text.toString();
	if (original_general_test_text === generated_general_test_text) {
		CeL.info(`${insert_watch_target_to_general_test_text.name}: Nothing changed.`);
	} else {
		CeL.write_file(/*write_to_file*/insert_to_file, generated_general_test_text,
			{ backup: { directory_name: 'backup' } });
	}
}

// ----------------------------------------------

add_test('正確率檢核', async (assert, setup_test, finish_test, options) => {
	const file_list = CeL.storage.read_directory(articles_directory);
	//console.trace([articles_directory, file_list]);

	const test_configuration = {
		assert, setup_test, finish_test,
		test_results: Object.create(null),
		error_count: 0, max_error_tags_showing: 40,
	};

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
		};

		const file_path = articles_directory + file_name;
		const answer_file_path = CeCC.to_converted_file_path(file_path);
		const text_is_TW = file_name_language[1] === 'TW';

		if (file_name.startsWith('watch_target.') && text_is_TW)
			await insert_watch_target_to_general_test_text(`${articles_directory}general.${file_name_language[1]}.txt`, articles_directory + file_name, { text_is_TW });

		if (await cecc.not_new_article_to_check(file_name, {
			...options, text_is_TW,
			latest_test_result,
			convert_options,
			regenerate_converted: CeL.env.argv.includes('regenerate_converted'),
			recheck: CeL.env.argv.includes('recheck')
		})) {
			CeL.info(`${options.test_name}: Skip ${file_name}: latest test at ${latest_test_result[options.test_name].date}, no news.`);
			continue;
		}

		await for_each_test_set(Object.assign(test_configuration, {
			test_title: file_name, text_is_TW,
			convert_options,
			content_paragraphs: CeCC.get_paragraphs_of_file(file_path),
			answer_paragraphs: CeCC.get_paragraphs_of_file(answer_file_path),
		}));
	}

	record_test(test_configuration, options);
});


// ============================================================================

if (CeL.env.argv.includes('nowiki')) {
	CeL.info(`跳過 wikipedia 測試。`);
} else if (require('os').freemem() < /* 6GB RAM */ 6 * (2 ** 10) ** 3) {
	CeL.warn(`RAM 過小 (${CeL.to_KiB(require('os').freemem())})，跳過 wikipedia 測試！`);
} else {
	/** {Object}wiki operator 操作子. */
	const zhwiki = get_zhwiki_session();

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
		const parsed = page_data.parse();
		parsed.each('tag', tag_token => {
			if (tag_token.tag === 'ref') {
				return CeL.wiki.parser.parser_prototype.each.remove_token;
			}
		});

		const wikitext = parsed.toString();

		return new Promise((resolve, reject) => {
			CeL.wiki.query([zhwiki.API_URL, 'action=parse'], function (data, error) {
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
		};

		for (const page_title of page_title_list) {
			const page_data = await zhwiki.page(page_title, { redirects: 1 });
			//console.log(page_data.wikitext);

			await for_each_test_set(Object.assign(test_configuration, {
				test_title: page_title, text_is_TW: true,
				content_paragraphs: CeCC.get_paragraphs_of_text(await get_parsed_wikitext(page_data, 'zh-tw')),
				answer_paragraphs: CeCC.get_paragraphs_of_text(await get_parsed_wikitext(page_data, 'zh-cn')),
			}));
		}

		record_test(test_configuration, options);
	});
}
