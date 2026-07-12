import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canCancelUploadSession, canTransferUploadSession } from './state.js';

describe('上传会话状态规则', () => {
  it('只有 initialized 和 uploading 可以继续传输', () => {
    assert.equal(canTransferUploadSession('initialized'), true);
    assert.equal(canTransferUploadSession('uploading'), true);
    assert.equal(canTransferUploadSession('completing'), false);
    assert.equal(canTransferUploadSession('completed'), false);
    assert.equal(canTransferUploadSession('failed'), false);
  });

  it('终态会话不能再次取消', () => {
    assert.equal(canCancelUploadSession('uploading'), true);
    assert.equal(canCancelUploadSession('failed'), true);
    assert.equal(canCancelUploadSession('completed'), false);
    assert.equal(canCancelUploadSession('canceled'), false);
    assert.equal(canCancelUploadSession('expired'), false);
  });
});
