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
1. 先中文分詞（附帶詞性標註）+自動判斷句子、段落的語境（配合[維基百科專有名詞轉換](https://zh.wikipedia.org/wiki/Wikipedia:%E5%AD%97%E8%A9%9E%E8%BD%89%E6%8F%9B%E8%99%95%E7%90%86/%E5%85%AC%E5%85%B1%E8%BD%89%E6%8F%9B%E7%B5%84)）
2. 再繁簡轉換（輕量化繁簡轉換辭典負擔）

## Features

## Installation
Install [LTP](https://github.com/HIT-SCIR/ltp) first.

經實測，採用哈工大 [LTP](https://github.com/HIT-SCIR/ltp) 的[服務端版本](http://ltp.ai/docs/quickstart.html#ltp-server)，配合[相對應辭典](dictionaries/CN_to_TW.LTP.PoS.txt)，可正確 繁→簡→繁 轉換[測試檔](_test%20suite/articles)中的文字。

### Install 中文分詞: LTP
On Windows, install LTP:
1. [安裝 Pytorch](https://codertw.com/%E7%A8%8B%E5%BC%8F%E8%AA%9E%E8%A8%80/635797/)。如果 `pip install ltp` 不成功則
   至[Pytorch 官方網站](http://pytorch.org/)選擇合適版本離線安裝。

   CUDA version: `nvidia-smi`

   `pip install torch-*.whl`

   // e.g., cu101/torch-1.7.0%2Bcu101-cp38-cp38-win_amd64.whl

2. Install LTP:
```cmd
pip install ltp
```

#### Alternative: Install 中文分詞: LTP
Alternative method: On Windows, install [nodejieba](https://github.com/yanyiwu/nodejieba):
```cmd
REM run as Administrator
npm install --global windows-build-tools
REM Waiting for some minutes...
npm install --global node-gyp
npm install --global node-pre-gyp
npm install nodejieba
REM Waiting for some minutes...
```

### Install cecc
And then install cecc:

```bash
npm install cecc
```

## Usage
1. 啟動 [LTP server](http://ltp.ai/docs/quickstart.html#ltp-server)

2. Try codes:
```javascript
// load module
const CeCC = require('cecc');
// chinese_converter
const cecc = new CeCC({ LTP_URL : 'http://localhost:5000/' });
cecc.to_TW('简体中文');
cecc.to_CN('繁體中文');
```

## See also
### 中文分詞
* [“结巴”中文分词](https://github.com/fxsjy/jieba) [繁體版本](https://github.com/ldkrsi/jieba-zh_TW)
   * [用 JS 做語意分析是不是搞錯了什麼(一)：斷詞篇](https://noob.tw/js-nlp-jieba/)
* [Ansj中文分词](https://github.com/NLPchina/ansj_seg)

### 詞性標記 词性标注
* 哈工大 [LTP](https://github.com/HIT-SCIR/ltp) [線上展示](http://ltp.ai/demo.html)
* [Stanford CoreNLP](https://stanfordnlp.github.io/CoreNLP/) [線上展示](https://corenlp.run/)
* [中央研究院語言所 中文斷詞系統](http://ckipsvr.iis.sinica.edu.tw/) [線上展示](http://sunlight.iis.sinica.edu.tw/uwextract/demo.htm)
* [CKIP Lab](https://ckip.iis.sinica.edu.tw/) [CkipTagger開源中文處理工具](https://github.com/ckiplab/ckiptagger) [線上展示](https://ckip.iis.sinica.edu.tw/service/corenlp/)

* [NLPIR](https://github.com/NLPIR-team/NLPIR) [中科院计算所 词性类别](http://103.242.175.216:197/nlpir/)
* 清华大学 [THULAC](http://thulac.thunlp.org/)

* [中文分词工具比较](https://blog.csdn.net/zzzzlei123123123/article/details/104227223)
* [词性标注的简单综述](https://www.zzjw.cc/2019/11/23/pos-review/)

### 簡繁轉換
* [OpenCC](https://github.com/BYVoid/OpenCC)
* [新同文堂](https://github.com/tongwentang/tongwen-core)
* [ConvertZZ](https://github.com/flier268/ConvertZZ)
* [繁化姬](https://zhconvert.org/)
* 厦门大学 [汉字简繁文本智能转换系统](http://jf.xmu.edu.cn/)
