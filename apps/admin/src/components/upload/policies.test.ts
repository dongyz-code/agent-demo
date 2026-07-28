import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getClientUploadPolicy,
  resolveDeclaredContentType,
  validateClientUploadFile,
} from './policies';

test('文档源策略允许 PNG 图片独立进入上传队列', () => {
  const policy = getClientUploadPolicy('default-attachment');
  const file = new File([new Uint8Array([1])], 'scan.png', {
    type: 'image/png',
  });
  assert.equal(validateClientUploadFile(file, policy), undefined);
});

test('RAG 文档策略仍不允许图片扩大解析范围', () => {
  const policy = getClientUploadPolicy('rag-document');
  const file = new File([new Uint8Array([1])], 'scan.png', {
    type: 'image/png',
  });
  assert.match(validateClientUploadFile(file, policy) ?? '', /不支持/);
});

test('浏览器缺失 MIME 时按受支持扩展名补齐声明', () => {
  const file = new File([new Uint8Array([1])], 'notes.md');
  assert.equal(resolveDeclaredContentType(file), 'text/markdown');
});

test('空文件在加入队列前返回明确原因', () => {
  const policy = getClientUploadPolicy('default-attachment');
  const file = new File([], 'empty.pdf', { type: 'application/pdf' });
  assert.match(validateClientUploadFile(file, policy) ?? '', /不能为空/);
});
