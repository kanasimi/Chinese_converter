
'use strict';


function 修正引號(configuration) {
	const { converted_text } = configuration;
	converted_text.forEach((text, index) => {
		converted_text[index] = text
			.replace(/“/g, '「')
			.replace(/”/g, '」')
			.replace(/‘/g, '『')
			.replace(/’/g, '』')
			;
	});
	//console.trace(converted_text);
}

module.exports = {
	修正引號,
};
