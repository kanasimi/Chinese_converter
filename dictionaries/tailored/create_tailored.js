
const work_title = process.argv[2];
if (!work_title) {
	console.log(`Usage:
	${process.argv[0]} ${process.argv[1]} work_title`);
	process.exit();
}


const noode_fs = require('fs');


let file_name = `${work_title}.additional.to_TW.txt`;
let contents=`/*

《${work_title}》
zh_conversion 用作品特設辭典

*/


`;

if (!noode_fs.existsSync( file_name ))
	noode_fs.writeFileSync(file_name, contents);



file_name = `${work_title}.CN_to_TW.LTP.PoS.txt`;
contents=`/*

《${work_title}》
CeCC 用作品特設辭典

*/


`;


if (!noode_fs.existsSync( file_name ))
	noode_fs.writeFileSync(file_name, contents);


