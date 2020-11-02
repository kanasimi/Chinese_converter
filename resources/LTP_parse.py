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
elif args.input_file:
	raise Exception("NYI")

#paragraph = "从此连只苍蝇都进不来。"
#paragraph = "送修的只三只漂亮的、华丽的表。"
if not paragraphs:
	print(arg_parser.format_help())
	arg_parser.exit()

# 载入模型
from ltp import LTP
ltp = LTP()

print("Parse paragraph " + json.dumps(paragraphs, separators = (',', ':')) + " using LTP...")

def parse_paragraph(paragraph):
	seg, hidden = ltp.seg([paragraph])
	# 词性标注
	pos = ltp.pos(hidden)
	#print(pos)

	# 语义角色标注
	#srl = ltp.srl(hidden, keep_empty=False)
	# 依存句法分析
	dep = ltp.dep(hidden)

	# http://cips-cl.org/static/CCL2020/sdp.html
	# 语义依存分析(树)
	#sdp_tree = ltp.sdp(hidden, graph=False)
	# 语义依存分析(图)
	sdp = ltp.sdp(hidden, graph = True)

	parsed = {
		'seg':seg[0],
		'pos':pos[0],
		#'srl':srl[0],
		'dep':dep[0],
		#'sdp_tree':sdp_tree[0],
		'sdp':sdp[0],
	}

	return parsed

# 一次處理太多文字會造成記憶體不足。
parsed_data = list(map(parse_paragraph, paragraphs))

print('-' * 60)
# result
# @see MARK_result_starts
print('Parsed JSON:')
parsed_data = json.dumps(parsed_data, separators = (',', ':'))
print(parsed_data)
