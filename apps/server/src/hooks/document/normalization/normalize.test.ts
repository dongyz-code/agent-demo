import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDocumentBlocks } from './normalize.js';

import type { DocumentParsedBlock } from '@repo/types';

/** 创建用于标准化测试的段落块。 */
function paragraph(text: string, position: number): DocumentParsedBlock {
  return {
    blockId: `block-${position}`,
    type: 'paragraph',
    text,
    headingPath: [],
    page: position + 1,
    position,
    metadata: {},
  };
}

describe('文档标准化', () => {
  it('移除主动内容、零宽字符并规范空白', () => {
    const [result] = normalizeDocumentBlocks([
      paragraph('<script>alert(1)</script>正文\u200b   内容', 0),
    ]);
    assert.equal(result?.text, '正文 内容');
  });

  it('删除出现至少三次的短页眉', () => {
    const result = normalizeDocumentBlocks([
      paragraph('公司内部资料', 0),
      paragraph('公司内部资料', 1),
      paragraph('公司内部资料', 2),
      paragraph('正文', 3),
    ]);
    assert.deepEqual(result.map((item) => item.text), ['正文']);
  });

  it('代码块保留标签文本，只统一换行', () => {
    const result = normalizeDocumentBlocks([{
      ...paragraph('<script>const a = 1;</script>\r\n', 0),
      type: 'code',
    }]);
    assert.equal(result[0]?.text, '<script>const a = 1;</script>');
  });
});
