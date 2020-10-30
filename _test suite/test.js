'use strict';

// load module
const Chinese_converter = require('../Chinese_converter.js');
const chinese_converter = new Chinese_converter;

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

add_test('正確率檢核：繁→簡→繁', async (assert, setup_test, finish_test, options) => {
	const articles_directory = module.path + '/articles/';
	const file_list = CeL.storage.read_directory(articles_directory);
	for (const file_name of file_list) {
		const test_name = options.test_name + file_name;
		setup_test(test_name);
		const contents = CeL.read_file(articles_directory + file_name).toString().replace(/<!--[\s\S]*?-->/g, '');
		contents.split('\n').forEach((line, index) => {
			line = line.trim();
			assert([chinese_converter.to_TW(chinese_converter.to_CN(line)), line], file_name + ` #${index + 1}`);
		});
		finish_test(test_name);
	}
});
