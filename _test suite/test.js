﻿'use strict';

// load module
const CeCC = require('../Chinese_converter.js');
const cecc = new CeCC({
	// using LTP
	using_LTP: true,
	LTP_URL: 'http://localhost:5000/',

	// using Stanford CoreNLP
	//CoreNLP_URL: 'http://localhost:9000/',
	//CoreNLP_URL: 'https://corenlp.run/',
});

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

const module_base_path = module.path + CeL.env.path_separator;
const articles_directory = module_base_path + 'articles' + CeL.env.path_separator;

add_test('基本檢核', async (assert, setup_test, finish_test, options) => {
	assert([articles_directory, cecc.test_articles_directory]);
});

// ------------------------------------------------------------------

const convert_options = cecc.regenerate_converted.default_convert_options;

const latest_test_result_file = convert_options.cache_directory + 'latest_test_result.json';
let latest_test_result = CeL.read_file(latest_test_result_file);
if (latest_test_result)
	latest_test_result = JSON.parse(latest_test_result.toString());
else
	latest_test_result = Object.create(null);

async function for_each_test_set(test_configuration) {
	const { assert, setup_test, finish_test,
		test_title, text_is_TW,
		content_paragraphs, answer_paragraphs } = test_configuration;

	const test_name = `${text_is_TW ? '' : '简→'}繁→简→繁：${test_title}`;
	setup_test(test_name);

	let answer_paragraphs_is_OK;
	if (answer_paragraphs) {
		if (answer_paragraphs.length === content_paragraphs.length) {
			answer_paragraphs_is_OK = true;
		} else {
			// 含有不同數量之字串！
			CeL.warn(`${test_title}: 預設解答與欲測試之項目數不符，將不採用解答！若檔案為自動生成，您可以刪除舊檔後，重新生成轉換標的檔案。`);
		}
	}

	let TW_paragraphs, converted_CN, tagged_word_list_of_paragraphs;
	if (text_is_TW) {
		TW_paragraphs = content_paragraphs;
		converted_CN = await cecc.to_CN(TW_paragraphs, convert_options);

		if (answer_paragraphs_is_OK) {
			for (let index = 0; index < answer_paragraphs.length; index++) {
				if (!assert([converted_CN[index], answer_paragraphs[index]], test_title + ` #${index + 1}-TW answer`)) {
					CeL.info(`　 繁\t${JSON.stringify(TW_paragraphs[index])
						}\n→ 简\t${JSON.stringify(converted_CN[index])
						}\n應為\t${JSON.stringify(answer_paragraphs[index])
						}`);
				}
			}
		}

	} else {
		TW_paragraphs = await cecc.to_TW(content_paragraphs, convert_options);
		if (answer_paragraphs_is_OK) {
			for (let index = 0; index < answer_paragraphs.length; index++) {
				if (!assert([TW_paragraphs[index], answer_paragraphs[index]], test_title + ` #${index + 1}-CN answer`)) {
					CeL.info(`　 简\t${JSON.stringify(content_paragraphs[index])
						}\n→ 繁\t${JSON.stringify(TW_paragraphs[index])
						}\n應為\t${JSON.stringify(answer_paragraphs[index])
						}`);
				}
			}
		}

		converted_CN = await cecc.to_CN(TW_paragraphs, convert_options);
		for (let index = 0; index < content_paragraphs.length; index++) {
			if (!assert([converted_CN[index], content_paragraphs[index]], test_title + ` #${index + 1}-CN`)) {
				CeL.info(`　 简\t${JSON.stringify(content_paragraphs[index])
					}\n→ 繁\t${JSON.stringify(TW_paragraphs[index])
					}\n→ 简\t${JSON.stringify(converted_CN[index])
					}\n 原简\t${JSON.stringify(content_paragraphs[index])
					}`);
			}
		}
	}

	let converted_TW = await cecc.to_TW(converted_CN, { ...convert_options, get_full_data: true, generate_condition: true, should_be: TW_paragraphs });
	tagged_word_list_of_paragraphs = converted_TW.tagged_word_list_of_paragraphs;
	converted_TW = converted_TW.converted_paragraphs;
	for (let index = 0; index < TW_paragraphs.length; index++) {
		if (!assert([converted_TW[index], TW_paragraphs[index]], test_title + ` #${index + 1}`)) {
			const tagged_word_list = tagged_word_list_of_paragraphs ? tagged_word_list_of_paragraphs[index] : await cecc.tag_paragraph(converted_CN[index]);
			CeL.log(`　 繁\t${JSON.stringify(TW_paragraphs[index])
				}\n→ 简\t${tagged_word_list.map(word_data => cecc.word_data_to_condition(word_data)).join('+')
				}\n\t${JSON.stringify(converted_CN[index])
				}\n→ 繁\t${JSON.stringify(converted_TW[index])
				}\n 原繁\t${JSON.stringify(TW_paragraphs[index])
				}`);
			TW_paragraphs.correction_conditions && TW_paragraphs.correction_conditions[index].forEach(CeCC.show_correction_condition);
			if (test_configuration.error_count++ < test_configuration.max_error_tags_showing && test_configuration.max_error_tags_showing) {
				console.log(CeCC.beautify_tagged_word_list(tagged_word_list));
			}
		}
	}

	finish_test(test_name);
}

function record_test(test_configuration, options) {
	if (test_configuration.error_count !== 0) {
		return;
	}

	latest_test_result[options.test_name] = {
		date: new Date
	};

	CeL.write_file(latest_test_result_file, JSON.stringify(latest_test_result));
}

// ============================================================================

add_test('正確率檢核', async (assert, setup_test, finish_test, options) => {
	const file_list = CeL.storage.read_directory(articles_directory);
	//console.trace([articles_directory, file_list]);

	const test_configuration = {
		assert, setup_test, finish_test,
		error_count: 0, max_error_tags_showing: 40,
	};

	for (const file_name of file_list) {
		if (file_name.includes('.bak.'))
			continue;
		let file_name_language = file_name.match(/\.(TW|CN)\.\w+$/);
		//console.trace([file_name, file_name_language]);
		if (!file_name_language)
			continue;

		const file_path = articles_directory + file_name;
		const answer_file_path = CeCC.to_converted_file_path(file_path);
		const text_is_TW = file_name_language[1] === 'TW';
		if (await cecc.not_new_article_to_check(file_name, {
			...options, text_is_TW,
			latest_test_result, convert_options,
			regenerate_converted: CeL.env.argv.includes('regenerate_converted'),
			recheck: CeL.env.argv.includes('recheck')
		})) {
			CeL.info(`Skip ${file_name}: latest test at ${latest_test_result[options.test_name].date}, no news.`);
			continue;
		}

		await for_each_test_set(Object.assign(test_configuration, {
			test_title: file_name, text_is_TW,
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
	CeL.run([
		// 載入操作維基百科的主要功能。
		'application.net.wiki',
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
	const wiki = new Wikiapi('zh');

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
		return new Promise((resolve, reject) => {
			CeL.wiki.query([wiki.API_URL, 'action=parse'], function (data, error) {
				//console.trace(data);
				if (error)
					reject(error);
				else
					resolve(extract_HTML_text(data.parse.text['*']));
			}, {
				title: page_data.title,
				//prop: 'text|indicators|displaytitle|modules|jsconfigvars|categorieshtml|templates|langlinks|limitreporthtml|parsewarnings',
				prop: 'text',
				text: page_data.wikitext,
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
			error_count: 0, max_error_tags_showing: 0,
		};

		for (const page_title of page_title_list) {
			const page_data = await wiki.page(page_title, { redirects: 1 });
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
