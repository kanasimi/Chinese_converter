
'use strict';


// 2022/2/15	改採 CeL.zh_conversion。現無作用。
function 修正引号(configuration) {
	const { converted_text } = configuration;
	converted_text.forEach((text, index) => {
		converted_text[index] = text
			.replace(/「/g, '“')
			.replace(/」/g, '”')
			.replace(/『/g, '‘')
			.replace(/』/g, '’')
			;
	});
	//console.trace(converted_text);
}

module.exports = {
	修正引号,
};
