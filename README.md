[![npm version](https://badge.fury.io/js/cecc.svg)](https://www.npmjs.com/package/cecc)
[![npm downloads](https://img.shields.io/npm/dm/cecc.svg)](https://www.npmjs.com/package/cecc)
<!--
[![Travis CI Build Status](https://travis-ci.com/kanasimi/Chinese_converter.svg?branch=master)](https://travis-ci.com/kanasimi/Chinese_converter)
[![codecov](https://codecov.io/gh/kanasimi/Chinese_converter/branch/master/graph/badge.svg)](https://codecov.io/gh/kanasimi/Chinese_converter)
-->

[![Known Vulnerabilities](https://snyk.io/test/github/kanasimi/Chinese_converter/badge.svg?targetFile=package.json)](https://snyk.io/test/github/kanasimi/Chinese_converter?targetFile=package.json)
[![codebeat badge](https://codebeat.co/badges/e358b88e-dff0-465f-aa7b-b5f972dee085)](https://codebeat.co/projects/github-com-kanasimi-chinese_converter-master)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/fd590585ec734d3b90e701da95cca8b2)](https://www.codacy.com/gh/kanasimi/Chinese_converter/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=kanasimi/Chinese_converter&amp;utm_campaign=Badge_Grade)
[![DeepScan grade](https://deepscan.io/api/teams/4788/projects/14427/branches/268541/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=4788&pid=14427&bid=268541)

# CeCC - Colorless echo Chinese converter
在人工智慧讀通文義、繁簡轉換前，應用[自然語言處理](https://zh.wikipedia.org/wiki/%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86)中文分詞、標注詞性、判斷語境之後再做轉換，[應比單純詞彙比對更準確](https://www.ccjk.com/word%E4%B8%AD%E6%96%87%E7%AE%80%E7%B9%81%E8%BD%AC%E6%8D%A2%E5%AD%98%E5%9C%A8%E7%9A%84%E9%97%AE%E9%A2%98%E4%B8%8E%E8%A7%A3%E5%86%B3%E5%AF%B9%E7%AD%96-%E8%BD%AC%E8%BD%BD/)。辭典應可如維基百科般由眾人編輯，且記錄改變原由，加進 test suit。


## Concepts
Chinese_converter 採用先中文分詞（附帶詞義、詞性標注），再以 CeL.zh_conversion 繁簡轉換的方法，來輕量化繁簡轉換辭典，同時達到較為精確的繁簡轉換。

### 單純從前至後替換文字的缺陷
CeL.zh_conversion 採用與 OpenCC 和新同文堂相同的技術，從前至後，於每個字元位置檢查符合辭典檔中詞彙的最長詞彙，一旦符合就置換並跳到下一個字元位置。

這種方法在遇到某些字詞必須與前一個字詞連動時，就可能漏失掉。例如「干」預設會轉成「幹」。（轉換標的通常是用途雜亂，最難找出規則又常出現、例外多的字詞。）因此當辭典檔中有「芒果」卻沒有「芒果乾」時，遇到「芒果干」就可能換成「芒果幹」。
我們可以藉由把這些需要連動的詞彙全部加入辭典檔來完善轉換結果，例如令「芒果干」轉換成「芒果乾」，additional.to_TW.txt 與 CN_to_TW.LTP.PoS.txt 中就有許多例子。但這造成辭典檔複雜龐大，就本例來說，我們畢竟不可能把所有動植物，如蘋果乾、響尾蛇乾全加進去。
而且每次加入新的詞彙也得考慮是否會影響到上下文。例如加入「上千」將造成「算得上千钧一发」因為先符合了「上千」，「钧一发」本身不在辭典檔中，將造成轉換錯誤。而加入了「下游」→「下游」，也得同時加入「下游戏」→「下游戏」以防止「玩一下游戏」、「停下游戏」被錯誤轉換。

此外這種做法最大的問題是不能依上下文判斷。例如「这颗梨子干你什么事」、「我拿水蜜桃干他朋友什么事」就不容易正確轉換。而有些詞像「排泄」、「排洩」，「自制」、「自製」有兩種可能性，也必須依上下文來判斷。

### 先中文分詞的好處
先中文分詞來判斷，可依句子與片語的結構來轉換。不但較靈活，也更能應對特殊情況。例如 zh_conversion 指定了許多 这只→這隻、一只→一隻 之類的轉換。在遇到「這隻是小鳥」、「這只是妄想」時常常出錯。若能判斷出「只」是否為量詞，則可減少許多錯誤。

由於 zh_conversion 執行速度快許多，因此 Chinese_converter 只對特殊情況才採用中文分詞辭典。

歡迎提供句子以做測試，也歡迎提交辭典檔規則。

理想情況，尚可加上自動判斷句子、段落的語境（配合[維基百科專有名詞轉換](https://zh.wikipedia.org/wiki/Wikipedia:%E5%AD%97%E8%A9%9E%E8%BD%89%E6%8F%9B%E8%99%95%E7%90%86/%E5%85%AC%E5%85%B1%E8%BD%89%E6%8F%9B%E7%B5%84)）。


## Process
繁簡轉換流程： 
1. 中文分詞（採用外包程式中文斷詞）
2. TODO: 判別語境
3. 依照相應詞典轉換各詞彙

## Features
1. 經由判斷詞性，可簡單判斷如何轉換。例如動詞用<code>幹</code>，形容詞用<code>乾</code>。
2. 自帶條件式生成功能，可快速生成辭典用的候選條件式。
3. 自附 cache 功能，可大大降低多次轉譯長文的時間（例如在測試期間、修改辭典條件欲重新轉換）。

## Installation
Install [LTP](https://github.com/HIT-SCIR/ltp) first.

經實測，採用哈工大 [LTP](https://github.com/HIT-SCIR/ltp) 4.1.5.post2 Base(v3) 模型的[服務端版本](http://ltp.ai/docs/quickstart.html#ltp-server)，配合[相對應辭典](dictionaries/CN_to_TW.LTP.PoS.txt)；以 繁→簡→繁 轉換[測試檔](_test%20suite/articles)中的文字，可轉換回原先之內容。

### Install 中文分詞: LTP
On Windows, install LTP:
1. 安裝 [PyTorch](http://pytorch.org/) 支援的 Python。（最新的 Python 常不能執行 PyTorch。）
2. 安裝 LTP 與 [LTP server](http://ltp.ai/docs/quickstart.html#ltp-server) 所依賴的軟體包:
```cmd
pip install ltp
pip install tornado
pip install fire
```

3. Upgrade LTP:
```cmd
pip install --upgrade ltp
```
<!--
#### Alternative: Install 中文分詞: nodejieba
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
-->
### Install cecc
Install [Node.js](https://nodejs.org/), and then install cecc:

```bash
npm install cecc
```

## Usage
1. 直接下載 [LTP server 原始碼](https://github.com/HIT-SCIR/ltp/blob/master/tools/server.py)並改 <code>'small'</code> 為 <code>'base'</code>。
2. 啟動 LTP server，預設為 http://localhost:5000/ 。您可能需要 6 GB 記憶體來啟動 server。第一次執行需要下載超過 500 MiB 的辭典檔。

3. Try codes:
   ```javascript
   // load module
   const CeCC = require('cecc');
   // chinese_converter
   const cecc = new CeCC({ LTP_URL : 'http://localhost:5000/' });
   cecc.to_TW('简体中文');
   cecc.to_CN('繁體中文');
   ```
4. 完整測試。
   ```sh
   # 重新生成 .converted.* 解答檔案。
   npm test regenerate_converted
   # TODO: 重新生成所有詞性查詢 cache。
   npm test ignore_cache
   ```

## Mechanism 文字替換機制
1. 若有符合[附帶詞性辭典檔](https://github.com/kanasimi/Chinese_converter/tree/master/dictionaries)的文字，則依之變換。其他未符合的交由 [CeL.extension.zh_conversion](https://github.com/kanasimi/CeJS/blob/master/extension/zh_conversion.js) 處理。
2. zh_conversion 基本上採用 [OpenCC 的辭典](https://github.com/BYVoid/OpenCC/tree/master/data/dictionary)，並以 [generate_additional_table.js](https://github.com/kanasimi/CeJS/blob/master/extension/zh_conversion/generate_additional_table.js) 合併新同文堂和 ConvertZZ 的辭典檔成 additional.to_TW.auto-generated.txt 與 additional.to_CN.auto-generated.txt。依照 [CeL.extension.zh_conversion](https://github.com/kanasimi/CeJS/blob/master/extension/zh_conversion.js) 中 Converter.options 之辭典檔順序，每個序列由長至短轉換。實際文字替換轉換作業在 [CeL.data.Convert_Pairs](https://github.com/kanasimi/CeJS/blob/master/data/Convert_Pairs.js) 中的 <code>function convert_using_pair_Map_by_length(text)</code>。

## 辭典修訂流程
### 常規單句式辭典修訂流程
1. 閱讀轉換過的文字，發現轉換錯誤。
2. 改成正確的句子，填入測試檔 [general.TW.txt](_test%20suite/articles/general.TW.txt) 或 [general.TW.answer.txt](_test%20suite/articles/general.TW.answer.txt)。
3. 啟動 [LTP server](http://ltp.ai/docs/quickstart.html#ltp-server)，`npm test` 跑測試。
4. 檢核測試工具自動生成的條件式，將合適的條件式填入辭典檔 [CN_to_TW.LTP.PoS.txt](dictionaries/CN_to_TW.LTP.PoS.txt) 或 [TW_to_CN.LTP.PoS.txt](dictionaries/TW_to_CN.LTP.PoS.txt)。必要時添加新 filter 功能函數於 [CN_to_TW.LTP.filters.js](dictionaries/CN_to_TW.LTP.filters.js)。
5. `npm test` 確認無衝突。
6. 通過測試後 push 新辭典檔。

### 邊閱讀文本邊修訂流程
有時另外挑出句子會解析出不同語法，此時必須透過完整轉換文本修訂辭典：通過 [work_crawler](https://github.com/kanasimi/work_crawler) 選擇繁簡轉換功能，並隨時修訂辭典，應先設定 .cache_directory（work_crawler 會自動設定）。
1. 閱讀轉換過的文字，發現轉換錯誤。
2. 改成正確的句子，填入作品相應的測試檔 `_test suite/articles/watch_target.作品名稱.(TW|CN).txt` (e.g., [watch_target.第一序列.TW.txt](_test%20suite/articles/watch_target.第一序列.TW.txt))，會在每次轉換都測試是否有相符之文字。
3. 持續修改辭典檔至能通過 `npm test nowiki` 測試。
4. 重新生成繁簡轉換後文本，檢核測試工具自動生成的條件式，將合適的條件式填入辭典檔 [CN_to_TW.LTP.PoS.txt](dictionaries/CN_to_TW.LTP.PoS.txt) 或 [TW_to_CN.LTP.PoS.txt](dictionaries/TW_to_CN.LTP.PoS.txt)。
5. 全部閱讀檢核完後，將作品相應的測試檔的文句填入測試檔 [general.TW.txt](_test%20suite/articles/general.TW.txt) 或 [general.TW.answer.txt](_test%20suite/articles/general.TW.answer.txt)。

## Defect
* LTP 轉換速率過慢。
* 詞典仍過於薄弱、有缺陷，尚待加強。
* 因為當前語言解析程式仍處於粗糙階段，解析結果不甚穩定；更換 LTP 程式版本就需要大幅改變辭典。

## See also
### 中文分詞
* [“结巴”中文分词](https://github.com/fxsjy/jieba) [繁體版本](https://github.com/ldkrsi/jieba-zh_TW)
   * [用 JS 做語意分析是不是搞錯了什麼(一)：斷詞篇](https://noob.tw/js-nlp-jieba/)
* [pkuseg：一个多领域中文分词工具包](https://github.com/lancopku/pkuseg-python)
* [Ansj中文分词](https://github.com/NLPchina/ansj_seg)
* [中文分词工具比较](https://blog.csdn.net/zzzzlei123123123/article/details/104227223)、[中文分词器分词效果评估对比](https://github.com/ysc/cws_evaluation)、[中文分词工具评估](https://github.com/tiandiweizun/chinese-segmentation-evaluation)、[五款中文分词工具在线PK: Jieba, SnowNLP, PkuSeg, THULAC, HanLP](https://www.tuicool.com/articles/v6RJFf2)

久未更新
* [IKAnalyzer](https://github.com/wks/ik-analyzer)

### 詞性標記 词性标注
* 哈工大 [LTP](https://github.com/HIT-SCIR/ltp) [線上展示](http://ltp.ai/demo.html)
* [Stanford CoreNLP](https://stanfordnlp.github.io/CoreNLP/) [線上展示](https://corenlp.run/)
* [中央研究院語言所 中文斷詞系統](http://ckipsvr.iis.sinica.edu.tw/) [線上展示](http://sunlight.iis.sinica.edu.tw/uwextract/demo.htm)
* [CKIP Lab](https://ckip.iis.sinica.edu.tw/) [CkipTagger開源中文處理工具](https://github.com/ckiplab/ckiptagger) [線上展示](https://ckip.iis.sinica.edu.tw/service/corenlp/)
* 清华大学 [THULAC](http://thulac.thunlp.org/) [線上展示](http://thulac.thunlp.org/demo)
* [HanLP](https://github.com/hankcs/HanLP)
* 教育部语言文字应用研究所计算语言学研究室 [语料库在线](http://corpus.zhonghuayuwen.org/index.aspx) [線上展示](http://corpus.zhonghuayuwen.org/CpsWParser.aspx)
* [Macropodus](https://github.com/yongzhuo/Macropodus)

* [NLPIR](https://github.com/NLPIR-team/NLPIR) [中科院计算所 词性类别](http://103.242.175.216:197/nlpir/)

* [词性标注的简单综述](https://www.zzjw.cc/2019/11/23/pos-review/)

久未更新
* [kcws](https://github.com/koth/kcws)
* [ZPar statistical parser](https://github.com/frcchang/zpar)

### 簡繁轉換
* [繁化姬](https://zhconvert.org/)
* [繁簡轉換王](https://convert.tw/)
* [textpro中文文本批处理程序](https://www.fodian.net/tools/)

未考慮詞性之簡繁轉換：
* [OpenCC](https://github.com/BYVoid/OpenCC)
* [新同文堂](https://github.com/tongwentang/tongwen-core)
* [ConvertZZ](https://github.com/flier268/ConvertZZ)
* 厦门大学 [汉字简繁文本智能转换系统](http://jf.xmu.edu.cn/)

* [搜狗输入法字典 词库下载](https://pinyin.sogou.com/dict/)
