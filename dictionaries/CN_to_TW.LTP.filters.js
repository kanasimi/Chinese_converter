

function 修正引號(configuration) {
	return configuration.word_data.text
		.replace(/“/g, '「')
		.replace(/”/g, '」');
}

module.exports = {
	修正引號,
};
