import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getDocumentParser } from './registry.js';

describe('文档解析器注册表', () => {
  it('文本和表格选择本地解析器', () => {
    assert.equal(getDocumentParser('text/plain').name, 'local-text');
    assert.equal(getDocumentParser('text/markdown').name, 'local-text');
    assert.equal(getDocumentParser('text/csv').name, 'local-text');
  });

  it('PDF 和 Office 选择远程文档解析器', () => {
    assert.equal(getDocumentParser('application/pdf').name, 'remote-document');
    assert.equal(
      getDocumentParser(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ).name,
      'remote-document',
    );
  });

  it('不支持类型返回稳定错误码', () => {
    assert.throws(
      () => getDocumentParser('application/x-unknown'),
      /DOCUMENT_PARSER_NOT_SUPPORTED/,
    );
  });
});

