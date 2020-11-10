'use strict';

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

const CeL = global.CeL;
CeL.info('Using CeJS version: ' + CeL.version);

// load modules for test
CeL.run(['application.debug.log',
	// gettext(), and for .detect_HTML_language(), .time_zone_of_language()
	'application.locale.gettext'
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

const articles_directory = module.path + CeL.env.path_separator + 'articles' + CeL.env.path_separator;

function get_paragraphs_of_file(file_name) {
	//console.trace(`Read ${articles_directory + file_name}`);
	const contents = CeL.read_file(articles_directory + file_name);
	if (!contents)
		return;

	return CeL.data.pair.remove_comments(contents.toString())
		// 注意：LTP 於末尾有無句號、數個句子是合併或拆分解析，會有不同解析結果。
		// (?:[。？！]|……)[\r\n]*|
		.split(/[\r\n]+/)
		.map(line => line.trim()).filter(line => !!line && !/^(\/\/)/.test(line));
}

add_test('正確率檢核', async (assert, setup_test, finish_test, options) => {
	const file_list = CeL.storage.read_directory(articles_directory);
	//console.trace([articles_directory, file_list]);
	let error_count = 0;
	for (const file_name of file_list) {
		let file_is_CN = file_name.match(/\.(CN|TW)\.\w+$/);
		//console.trace([file_name, file_is_CN]);
		if (!file_is_CN)
			continue;
		file_is_CN = file_is_CN[1] === 'CN';

		const test_name = `${file_is_CN ? '簡→' : ''}繁→簡→繁：${file_name}`;
		setup_test(test_name);

		const content_paragraphs = get_paragraphs_of_file(file_name);
		const answer_paragraphs = get_paragraphs_of_file(file_name.replace(/(\.\w+)$/, '.answer$1'));
		let TW_paragraphs, converted_CN, tagged_word_list_of_paragraphs;
		if (file_is_CN) {
			TW_paragraphs = await cecc.to_TW(content_paragraphs);
			if (answer_paragraphs) {
				for (let index = 0; index < answer_paragraphs.length; index++) {
					if (!assert([TW_paragraphs[index], answer_paragraphs[index]], file_name + ` #${index + 1}-CN answer`)) {
						CeL.info(`　 簡\t${JSON.stringify(content_paragraphs[index])}\n→ 繁\t${JSON.stringify(TW_paragraphs[index])}\n ans.\t${JSON.stringify(answer_paragraphs[index])}`);
					}
				}
			}

			converted_CN = await cecc.to_CN(TW_paragraphs);
			for (let index = 0; index < content_paragraphs.length; index++) {
				if (!assert([converted_CN[index], content_paragraphs[index]], file_name + ` #${index + 1}-CN`)) {
					CeL.info(`　 簡\t${JSON.stringify(content_paragraphs[index])}\n→ 繁\t${JSON.stringify(TW_paragraphs[index])}\n→ 簡\t${JSON.stringify(converted_CN[index])}\n 原簡\t${JSON.stringify(content_paragraphs[index])}`);
				}
			}

		} else {
			TW_paragraphs = content_paragraphs;
			converted_CN = await cecc.to_CN(TW_paragraphs);

			if (answer_paragraphs) {
				for (let index = 0; index < answer_paragraphs.length; index++) {
					if (!assert([converted_CN[index], answer_paragraphs[index]], file_name + ` #${index + 1}-TW answer`)) {
						CeL.info(`　 繁\t${JSON.stringify(TW_paragraphs[index])}\n→ 簡\t${JSON.stringify(converted_CN[index])}\n ans.\t${JSON.stringify(answer_paragraphs[index])}`);
					}
				}
			}
		}

		let converted_TW = await cecc.to_TW(converted_CN, { get_full_data: true, generate_condition: true, should_be: TW_paragraphs });
		tagged_word_list_of_paragraphs = converted_TW.tagged_word_list_of_paragraphs;
		converted_TW = converted_TW.converted_paragraphs;
		for (let index = 0; index < TW_paragraphs.length; index++) {
			if (!assert([converted_TW[index], TW_paragraphs[index]], file_name + ` #${index + 1}`)) {
				CeL.info(`　 繁\t${JSON.stringify(TW_paragraphs[index])}\n→ 簡\t${JSON.stringify(converted_CN[index])}\n→ 繁\t${JSON.stringify(converted_TW[index])}\n 原繁\t${JSON.stringify(TW_paragraphs[index])}`);
				TW_paragraphs.correction_conditions[index].forEach(correction => {
					if (correction.parsed[CeCC.KEY_matched_condition]) {
						CeL.log('Matched condition: ' + correction.parsed[CeCC.KEY_matched_condition].condition_text);
					}
					// 自動提供候選條件式。
					CeL.log(`Candidate correction for ${correction.parsed.text}:\n${correction.join('\t')}`);
				});
				if (error_count++ < 40) {
					if (tagged_word_list_of_paragraphs) {
						console.log(tagged_word_list_of_paragraphs[index]);
					} else {
						console.log(await cecc.tag_paragraph(converted_CN[index]));
					}
				}
			}
		}

		finish_test(test_name);
	}
});
