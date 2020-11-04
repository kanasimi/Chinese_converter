#!/usr/bin/python3
'''
http://ltp.ai/docs/quickstart.html
https://www.runoob.com/python/python-json.html

'''

# https://docs.python.org/zh-tw/3/howto/argparse.html
from argparse import ArgumentParser
arg_parser = ArgumentParser()
arg_parser.add_argument("-t", "--text", help="input paragraph text", dest="text")
arg_parser.add_argument("-j", "--json", help="input paragraph JSON Array", dest="json")
arg_parser.add_argument("-f", "--input_file", help="input paragraph file (TODO)", dest="input_file")
arg_parser.add_argument("-l", "--input_file_list", help="input paragraph file list (TODO)", dest="input_file_list")
arg_parser.add_argument("-o", "--output_file", help="output paragraph file (TODO)", dest="output_file")

args = arg_parser.parse_args()
#print("text arg:", args.text)
#print("input_file arg:", args.input_file)

# https://docs.python.org/3/library/json.html
import json

paragraphs = args.text
if paragraphs:
    paragraphs = [paragraphs]
elif args.json:
    try:
        paragraphs = json.loads(args.json)
    except err:
        print("Error occurred: " + err)

if args.input_file:
    raise Exception("NYI")

if args.input_file_list:
    raise Exception("NYI")

#paragraph = "从此连只苍蝇都进不来。"
#paragraph = "送修的只三只漂亮的、华丽的表。"
if not paragraphs:
    print(arg_parser.format_help())
    arg_parser.exit()

# 载入模型
from ltp import LTP
#ltp = LTP()

# -----------------------------------------------------------------------------
# 2020/11/3 12:7:45 Copy from
# https://github.com/HIT-SCIR/ltp/blob/master/utils/server.py
# 維持與伺服器相同輸出格式。
from typing import List

class Server(object):
    def __init__(self, path: str='small', batch_size: int=50, device: str=None, onnx: bool=False):
        if onnx:
            self.ltp = FastLTP(path=path, device=device)
        else:
            self.ltp = LTP(path=path, device=device)
        self.split = lambda a: map(lambda b: a[b:b + batch_size], range(0, len(a), batch_size))

    def _build_words(self, words, pos, dep):
        res = [{'id': -1, 'length': 0, 'offset': 0, 'text': 'root'}]
        for word, p, (id, parent, relation) in zip(words, pos, dep):
            offset = res[-1]['offset'] + res[-1]['length']
            res.append({
                'id': id - 1,
                'length': len(word),
                'offset': offset,
                'text': word,
                'pos': p,
                'parent': parent - 1,
                'relation': relation,
                'roles': [],
                'parents': []
            })

        return res[1:]

    def _predict(self, sentences: List[str]):
        result = []
        for sentences_batch in self.split(sentences):
            batch_seg, hidden = self.ltp.seg(sentences_batch)
            batch_pos = self.ltp.pos(hidden)
            batch_ner = self.ltp.ner(hidden)
            batch_srl = self.ltp.srl(hidden)
            batch_dep = self.ltp.dep(hidden)
            batch_sdp = self.ltp.sdp(hidden)

            for sent, seg, pos, ner, srl, dep, sdp in \
                    zip(sentences_batch, batch_seg, batch_pos, batch_ner, batch_srl, batch_dep, batch_sdp):

                words = self._build_words(seg, pos, dep)

                for word, token_srl in zip(words, srl):
                    for role, start, end in token_srl:
                        text = "".join(seg[start:end + 1])
                        offset = words[start]['offset']
                        word['roles'].append({
                            'text': text,
                            'offset': offset,
                            'length': len(text),
                            'type': role
                        })

                for start, end, label in sdp:
                    words[start - 1]['parents'].append({'parent': end - 1, 'relate': label})

                nes = []
                for role, start, end in ner:
                    text = "".join(seg[start:end + 1])
                    nes.append({
                        'text': text,
                        'offset': start,
                        'ne': role.lower(),
                        'length': len(text)
                    })

                result.append({
                    'text': sent,
                    'nes': nes,
                    'words': words
                })

        return result

# -----------------------------------------------------------------------------
new_Server = Server()
print("Parse paragraph " + json.dumps(paragraphs, separators = (',', ':')) + " using LTP...")

def parse_paragraph(paragraph):
    return new_Server._predict([paragraph])[0]


# 一次處理太多文字會造成記憶體不足。
parsed_data = list(map(parse_paragraph, paragraphs))

print('-' * 60)
# result
# @see MARK_result_starts
print('Parsed JSON:')
parsed_data = json.dumps(parsed_data, separators = (',', ':'))
print(parsed_data)
