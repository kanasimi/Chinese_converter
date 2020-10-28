[![Codacy Badge](https://api.codacy.com/project/badge/Grade/986ca401faaf4c17a7eb136be69417db)](https://app.codacy.com/gh/kanasimi/Chinese_converter?utm_source=github.com&utm_medium=referral&utm_content=kanasimi/Chinese_converter&utm_campaign=Badge_Grade)
﻿[![npm version](https://badge.fury.io/js/cecc.svg)](https://www.npmjs.com/package/cecc)
[![npm downloads](https://img.shields.io/npm/dm/cecc.svg)](https://www.npmjs.com/package/cecc)
[![Build Status](https://travis-ci.org/kanasimi/Chinese_converter.svg?branch=master)](https://travis-ci.org/kanasimi/Chinese_converter)
[![codecov](https://codecov.io/gh/kanasimi/Chinese_converter/branch/master/graph/badge.svg)](https://codecov.io/gh/kanasimi/Chinese_converter)

[![Known Vulnerabilities](https://snyk.io/test/github/kanasimi/Chinese_converter/badge.svg?targetFile=package.json)](https://snyk.io/test/github/kanasimi/Chinese_converter?targetFile=package.json)
[![codebeat badge](https://codebeat.co/badges/e358b88e-dff0-465f-aa7b-b5f972dee085)](https://codebeat.co/projects/github-com-kanasimi-chinese_converter-master)
<!--
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/02aa4b9cc9df4fa9b10389abbb139ebf)](https://app.codacy.com/app/kanasimi/Chinese_converter?utm_source=github.com&utm_medium=referral&utm_content=kanasimi/Chinese_converter&utm_campaign=Badge_Grade_Dashboard)
-->
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

const chinese_converter = new CeCC;
chinese_converter.to_TW('简体中文');
chinese_converter.to_CN('繁體中文');
```

## See also
* https://noob.tw/js-nlp-jieba/
* https://github.com/ldkrsi/jieba-zh_TW
* https://github.com/ckiplab/ckiptagger
* https://github.com/NLPchina/ansj_seg
