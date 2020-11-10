

function 修正引号(configuration) {
	const converted_text = configuration.converted_text;
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
