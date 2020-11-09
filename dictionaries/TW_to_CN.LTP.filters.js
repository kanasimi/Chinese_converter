

function 修正引号(configuration) {
	return configuration.word_data.text
		.replace(/「/g, '“')
		.replace(/」/g, '”');
}

module.exports = {
	修正引号,
};
