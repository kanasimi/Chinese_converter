[![npm version](https://badge.fury.io/js/cecc.svg)](https://www.npmjs.com/package/cecc)
[![npm downloads](https://img.shields.io/npm/dm/cecc.svg)](https://www.npmjs.com/package/cecc)
<!--
[![Build Status](https://travis-ci.org/kanasimi/Chinese_converter.svg?branch=master)](https://travis-ci.org/kanasimi/Chinese_converter)
[![codecov](https://codecov.io/gh/kanasimi/Chinese_converter/branch/master/graph/badge.svg)](https://codecov.io/gh/kanasimi/Chinese_converter)
-->

[![Known Vulnerabilities](https://snyk.io/test/github/kanasimi/Chinese_converter/badge.svg?targetFile=package.json)](https://snyk.io/test/github/kanasimi/Chinese_converter?targetFile=package.json)
[![codebeat badge](https://codebeat.co/badges/e358b88e-dff0-465f-aa7b-b5f972dee085)](https://codebeat.co/projects/github-com-kanasimi-chinese_converter-master)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/fd590585ec734d3b90e701da95cca8b2)](https://www.codacy.com/gh/kanasimi/Chinese_converter/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=kanasimi/Chinese_converter&amp;utm_campaign=Badge_Grade)
[![DeepScan grade](https://deepscan.io/api/teams/4788/projects/14427/branches/268541/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=4788&pid=14427&bid=268541)

# CeCC - Colorless echo Chinese converter
在人工智慧繁簡轉換前，中文分詞（中文斷詞）、判斷語境之後再做轉換，應比單純詞彙比對更準確。辭典應可如維基百科般由眾人編輯，且記錄改變原由，加進 test suit。

## Concepts
1. 中文分詞（附帶詞性標註）+自動判斷句子、段落的語境（配合維基百科專有名詞轉換）
2. 繁簡轉換（先輕量化繁簡轉換辭典負擔）

## Features

## Installation
Install [nodejieba](https://github.com/yanyiwu/nodejieba) first.

On Windows:
```cmd
REM run as Administrator
npm install --global windows-build-tools
REM Waiting for some minutes...
npm install --global node-gyp
npm install --global node-pre-gyp
npm install nodejieba
REM Waiting for some minutes...
```

And then install cecc:

```bash
npm install cecc
```

## Usage
Here lists some examples of this module.

```javascript
// load module
const CeCC = require('cecc');
// chinese_converter
const cecc = new CeCC;
cecc.to_TW('简体中文');
cecc.to_CN('繁體中文');
```

## See also
### 中文分詞
* https://noob.tw/js-nlp-jieba/
* https://github.com/ldkrsi/jieba-zh_TW
* https://github.com/NLPchina/ansj_seg

### 詞性標記 词性标注
* https://github.com/HIT-SCIR/ltp
* https://corenlp.run/

* [中科院计算所 词性类别](http://103.242.175.216:197/nlpir/)

* https://ckip.iis.sinica.edu.tw/service/corenlp/
* [中央研究院語言所 中文斷詞系統](http://ckipsvr.iis.sinica.edu.tw/) [線上展示](http://sunlight.iis.sinica.edu.tw/uwextract/demo.htm)

* https://github.com/ckiplab/ckiptagger
* https://github.com/NLPIR-team/NLPIR
* https://github.com/GeoHey-Team/node-thulac
* https://www.zzjw.cc/2019/11/23/pos-review/

* https://blog.csdn.net/zzzzlei123123123/article/details/104227223

### 簡繁轉換
* [OpenCC](https://github.com/BYVoid/OpenCC)
* [新同文堂](https://github.com/tongwentang/tongwen-core)
* [ConvertZZ](https://github.com/flier268/ConvertZZ)
