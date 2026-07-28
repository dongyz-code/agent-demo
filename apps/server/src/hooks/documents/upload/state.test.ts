import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveExistingUploadInitDisposition } from './state.js';

/** 测试使用的固定当前时间。 */
const NOW = Date.parse('2026-07-28T00:00:00.000Z');

test('completed 会话只恢复结果且不受原过期时间影响', () => {
  assert.equal(
    resolveExistingUploadInitDisposition(
      { status: 'completed', expiresAt: new Date(NOW - 1) },
      NOW,
    ),
    'completed',
  );
});

test('有效活动会话可以重复初始化并刷新签名', () => {
  assert.equal(
    resolveExistingUploadInitDisposition(
      { status: 'uploading', expiresAt: new Date(NOW + 1) },
      NOW,
    ),
    'active',
  );
});

test('失败和取消会话要求客户端使用新的上传尝试', () => {
  assert.equal(
    resolveExistingUploadInitDisposition(
      { status: 'failed', expiresAt: new Date(NOW + 1) },
      NOW,
    ),
    'terminal',
  );
  assert.equal(
    resolveExistingUploadInitDisposition(
      { status: 'canceled', expiresAt: new Date(NOW + 1) },
      NOW,
    ),
    'terminal',
  );
});

test('超过有效期的活动会话不能重新签发写地址', () => {
  assert.equal(
    resolveExistingUploadInitDisposition(
      { status: 'initialized', expiresAt: new Date(NOW) },
      NOW,
    ),
    'expired',
  );
});
