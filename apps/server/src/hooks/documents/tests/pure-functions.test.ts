import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import type { DocumentParsedBlock } from '@repo/types';
import {
  buildObjectKey,
  calculateMultipartPlan,
  createFileFingerprint,
  normalizeExtension,
  sanitizeUploadFilename,
} from '../upload/object-key.js';
import {
  calculateSha256Stream,
  detectTrustedContentType,
} from '../upload/validators.js';
import { normalizeDocumentBlocks } from '../processing/pipeline/normalize.js';
import {
  createDocumentSegments,
  estimateTokens,
} from '../processing/pipeline/segment.js';

/**
 * 构造纯函数测试使用的解析块。
 *
 * @param overrides 需要覆盖的块字段。
 * @returns 字段完整且可直接传入处理流水线的解析块。
 */
function parsedBlock(
  overrides: Partial<DocumentParsedBlock> = {},
): DocumentParsedBlock {
  return {
    blockId: 'block-1',
    type: 'paragraph',
    text: '正文',
    headingPath: [],
    page: null,
    position: 0,
    metadata: {},
    ...overrides,
  };
}

test('对象 key 只使用服务端标识、UTC 月份和规范扩展名', () => {
  const filename = sanitizeUploadFilename('  ../季度:报告.PDF  ');
  const extension = normalizeExtension(filename);
  const objectKey = buildObjectKey({
    fileId: 'file-id',
    extension,
    now: new Date('2026-07-21T08:00:00.000Z'),
  });

  assert.equal(filename, '.._季度_报告.PDF');
  assert.equal(extension, 'pdf');
  assert.match(objectKey, /^files\/2026\/07\/file-id\/[0-9a-f-]{36}\.pdf$/);
  assert.equal(objectKey.includes('季度'), false);
});

test('文件指纹对稳定输入可重复且能区分属性变化', () => {
  const input = {
    filename: 'report.pdf',
    size: 1024,
    contentType: 'application/pdf',
    clientFingerprint: 'client-value',
  };

  assert.equal(createFileFingerprint(input), createFileFingerprint(input));
  assert.notEqual(
    createFileFingerprint(input),
    createFileFingerprint({ ...input, size: 1025 }),
  );
  assert.match(createFileFingerprint(input), /^[0-9a-f]{64}$/);
});

test('Multipart 计划遵守最小分片和一万片上限', () => {
  assert.deepEqual(calculateMultipartPlan(12 * 1024 * 1024, 1024), {
    partSize: 5 * 1024 * 1024,
    partCount: 3,
  });

  const largePlan = calculateMultipartPlan(
    60 * 1024 * 1024 * 1024,
    5 * 1024 * 1024,
  );
  assert.ok(largePlan.partCount <= 10_000);
  assert.equal(largePlan.partSize % (1024 * 1024), 0);
});

test('可信 MIME 优先使用 Magic Number，仅允许文本声明回退', async () => {
  const pngPrefix = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00,
  ]);

  assert.equal(
    await detectTrustedContentType({
      prefix: pngPrefix,
      declaredContentType: 'text/plain',
    }),
    'image/png',
  );
  assert.equal(
    await detectTrustedContentType({
      prefix: Buffer.from('plain text'),
      declaredContentType: 'text/markdown',
    }),
    'text/markdown',
  );
  assert.equal(
    await detectTrustedContentType({
      prefix: Buffer.from('unknown binary'),
      declaredContentType: 'application/pdf',
    }),
    undefined,
  );
});

test('SHA-256 以流式方式消费完整内容', async () => {
  const digest = await calculateSha256Stream(
    Readable.from([Buffer.from('hello'), Buffer.from(' world')]),
  );

  assert.equal(
    digest,
    'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
  );
});

test('normalize 清理 HTML、空白和重复短页眉并重排位置', () => {
  const blocks = normalizeDocumentBlocks([
    parsedBlock({ blockId: 'header-1', text: '页眉', position: 0 }),
    parsedBlock({
      blockId: 'body',
      text: '  <b>正文</b>\t 内容  ',
      position: 1,
    }),
    parsedBlock({ blockId: 'header-2', text: '页眉', position: 2 }),
    parsedBlock({ blockId: 'header-3', text: '页眉', position: 3 }),
    parsedBlock({
      blockId: 'code',
      type: 'code',
      text: '  a  =  1\r\n',
      position: 4,
    }),
  ]);

  assert.deepEqual(
    blocks.map(({ blockId, text, position }) => ({ blockId, text, position })),
    [
      { blockId: 'body', text: '正文 内容', position: 0 },
      { blockId: 'code', text: 'a  =  1', position: 1 },
    ],
  );
});

test('segment 按预算切分、保留结构信息并生成确定性标识', () => {
  const input = {
    documentVersionId: 'version-1',
    blocks: [
      parsedBlock({
        blockId: 'heading',
        type: 'heading',
        text: '标题',
        headingPath: ['标题'],
        page: 1,
      }),
      parsedBlock({
        blockId: 'body',
        text: 'a'.repeat(32),
        headingPath: ['标题'],
        page: 1,
        position: 1,
      }),
    ],
    profile: {
      version: 'test-v1',
      segmentSizeTokens: 4,
      overlapTokens: 1,
    },
  };

  const first = createDocumentSegments(input);
  const second = createDocumentSegments(input);

  assert.deepEqual(first, second);
  assert.ok(first.length >= 2);
  assert.deepEqual(first[0]?.headingPath, ['标题']);
  assert.equal(first[0]?.page, 1);
  assert.match(first[0]?.segmentId ?? '', /^[0-9a-f-]{36}$/);
  assert.equal(estimateTokens('12345'), 2);
});
