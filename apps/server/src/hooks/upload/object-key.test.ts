import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildObjectKey,
  calculateMultipartPlan,
  createFileFingerprint,
  normalizeExtension,
  sanitizeUploadFilename,
} from './object-key.js';

describe('上传对象纯函数', () => {
  it('清理路径、控制字符并限制展示名称长度', () => {
    assert.equal(sanitizeUploadFilename('../a\u0000/b?.pdf'), '.._a__b_.pdf');
    assert.equal(sanitizeUploadFilename('   '), 'file');
    assert.equal(sanitizeUploadFilename('a'.repeat(300)).length, 255);
  });

  it('只接受安全的短扩展名', () => {
    assert.equal(normalizeExtension('Report.PDF'), 'pdf');
    assert.equal(normalizeExtension('archive.超长扩展名'), 'bin');
    assert.equal(normalizeExtension('README'), 'bin');
  });

  it('对象路径不包含租户原文和原始文件名', () => {
    const key = buildObjectKey({
      tenantId: 'tenant/private',
      fileId: '8a52ef09-72b5-4dd5-bbf5-5b50be0f15ac',
      extension: 'pdf',
      now: new Date('2026-07-12T00:00:00.000Z'),
    });
    assert.match(
      key,
      /^tenants\/[a-f0-9]{16}\/files\/2026\/07\/8a52ef09-72b5-4dd5-bbf5-5b50be0f15ac\/[a-f0-9-]{36}\.pdf$/,
    );
    assert.equal(key.includes('tenant/private'), false);
  });

  it('分片计划遵守 5 MiB 下限和一万片上限', () => {
    assert.deepEqual(calculateMultipartPlan(6 * 1024 * 1024, 1024), {
      partSize: 5 * 1024 * 1024,
      partCount: 2,
    });
    const large = calculateMultipartPlan(60 * 1024 ** 3, 5 * 1024 * 1024);
    assert.ok(large.partCount <= 10_000);
    assert.equal(large.partSize % (1024 * 1024), 0);
  });

  it('相同属性生成相同指纹，关键属性变化会改变结果', () => {
    const values = {
      filename: 'a.pdf',
      size: 100,
      contentType: 'application/pdf',
      clientFingerprint: 'client-value',
    };
    assert.equal(createFileFingerprint(values), createFileFingerprint(values));
    assert.notEqual(
      createFileFingerprint(values),
      createFileFingerprint({ ...values, size: 101 }),
    );
  });
});
