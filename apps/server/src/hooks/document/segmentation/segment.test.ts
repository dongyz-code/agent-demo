import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDocumentSegments, hashToUuid } from './segment.js';

import type { DocumentParsedBlock } from '@repo/types';

const blocks: DocumentParsedBlock[] = [
  {
    blockId: 'block-1',
    type: 'heading',
    text: '上传设计',
    headingPath: ['上传设计'],
    page: 1,
    position: 0,
    metadata: {},
  },
  {
    blockId: 'block-2',
    type: 'paragraph',
    text: '浏览器直传对象存储，服务端负责授权、签名和完成验证。',
    headingPath: ['上传设计'],
    page: 1,
    position: 1,
    metadata: {},
  },
];

describe('文档确定性切分', () => {
  it('相同文档版本、内容和配置生成完全相同的 Segment', () => {
    const input = {
      documentVersionId: 'version-1',
      blocks,
      profile: {
        version: 'chunk-v1',
        segmentSizeTokens: 20,
        overlapTokens: 4,
      },
    };
    assert.deepEqual(createDocumentSegments(input), createDocumentSegments(input));
  });

  it('配置版本变化会生成不同 Segment 标识', () => {
    const first = createDocumentSegments({
      documentVersionId: 'version-1',
      blocks,
      profile: {
        version: 'chunk-v1',
        segmentSizeTokens: 100,
        overlapTokens: 0,
      },
    });
    const second = createDocumentSegments({
      documentVersionId: 'version-1',
      blocks,
      profile: {
        version: 'chunk-v2',
        segmentSizeTokens: 100,
        overlapTokens: 0,
      },
    });
    assert.notEqual(first[0]?.segmentId, second[0]?.segmentId);
  });

  it('稳定摘要生成合法且可复现的 UUID', () => {
    const first = hashToUuid('same-value');
    assert.equal(first, hashToUuid('same-value'));
    assert.match(
      first,
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  });
});
