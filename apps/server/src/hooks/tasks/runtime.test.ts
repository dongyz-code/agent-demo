import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decideTaskSettlement,
  hasTaskNameCapacity,
  loadTaskScript,
  normalizeTaskInput,
} from './runtime.js';
import { resolveDocumentTaskParts } from '../documents/tasks/runtime.js';

import type { DocumentTaskData } from '../documents/tasks/task.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const DOCUMENT_SCRIPT = new URL(
  '../documents/tasks/runtime.js',
  import.meta.url,
).href;

test('单对象 add 参数保存完整策略快照', () => {
  const snapshot = normalizeTaskInput({
    name: ' document.process ',
    script: DOCUMENT_SCRIPT,
    data: { parts: ['preview'] },
    retry: { times: 3, delay: 5_000 },
    timeout: 60_000,
    concurrency: 1,
  });
  assert.deepEqual(snapshot, {
    name: 'document.process',
    script: DOCUMENT_SCRIPT,
    data: { parts: ['preview'] },
    maxRetries: 3,
    retryDelayMs: 5_000,
    timeoutMs: 60_000,
    concurrency: 1,
  });
});

test('未提供可选策略时使用统一默认值', () => {
  const snapshot = normalizeTaskInput({
    name: 'email.send',
    script: DOCUMENT_SCRIPT,
    data: { recipientId: 'recipient-id' },
  });
  assert.equal(snapshot.maxRetries, 0);
  assert.equal(snapshot.retryDelayMs, 5_000);
  assert.equal(snapshot.timeoutMs, 30 * 60 * 1000);
  assert.equal(snapshot.concurrency, 4);
});

test('任务脚本只允许服务端目录内的 file URL', () => {
  assert.throws(
    () =>
      normalizeTaskInput({
        name: 'remote.task',
        script: 'https://example.com/task.js',
        data: {},
      }),
    /TASK_SCRIPT_INVALID/u,
  );
});

test('任务脚本模块直接解析默认导出和生命周期函数', async () => {
  const module = await loadTaskScript(DOCUMENT_SCRIPT);
  assert.equal(typeof module.default, 'function');
  assert.equal(typeof module.onCreate, 'function');
  assert.equal(typeof module.onCancel, 'function');
  assert.equal(typeof module.onTerminalFailure, 'function');
});

test('脚本成功直接进入 succeeded', () => {
  const decision = decideTaskSettlement({
    outcome: 'succeeded',
    attempt: 1,
    maxRetries: 3,
    retryDelayMs: 5_000,
    now: NOW,
  });
  assert.deepEqual(decision, {
    attemptStatus: 'succeeded',
    taskStatus: 'succeeded',
    nextRunAt: null,
  });
});

test('maxRetries 只计算首次执行之外的重试次数', () => {
  const thirdAttempt = decideTaskSettlement({
    outcome: 'failed',
    attempt: 3,
    maxRetries: 3,
    retryDelayMs: 5_000,
    now: NOW,
  });
  assert.equal(thirdAttempt.taskStatus, 'retrying');
  assert.equal(
    thirdAttempt.nextRunAt?.toISOString(),
    '2026-01-01T00:00:05.000Z',
  );

  const fourthAttempt = decideTaskSettlement({
    outcome: 'failed',
    attempt: 4,
    maxRetries: 3,
    retryDelayMs: 5_000,
    now: NOW,
  });
  assert.deepEqual(fourthAttempt, {
    attemptStatus: 'failed',
    taskStatus: 'failed',
    nextRunAt: null,
  });
});

test('超时在有重试次数时等待重试，耗尽后保留 timed_out 终态', () => {
  const retrying = decideTaskSettlement({
    outcome: 'timed_out',
    attempt: 1,
    maxRetries: 1,
    retryDelayMs: 2_000,
    now: NOW,
  });
  assert.equal(retrying.attemptStatus, 'timed_out');
  assert.equal(retrying.taskStatus, 'retrying');

  const terminal = decideTaskSettlement({
    outcome: 'timed_out',
    attempt: 2,
    maxRetries: 1,
    retryDelayMs: 2_000,
    now: NOW,
  });
  assert.deepEqual(terminal, {
    attemptStatus: 'timed_out',
    taskStatus: 'timed_out',
    nextRunAt: null,
  });
});

test('异常中断保留 interrupted attempt 并最终归入 failed', () => {
  const decision = decideTaskSettlement({
    outcome: 'interrupted',
    attempt: 1,
    maxRetries: 0,
    retryDelayMs: 0,
    now: NOW,
  });
  assert.deepEqual(decision, {
    attemptStatus: 'interrupted',
    taskStatus: 'failed',
    nextRunAt: null,
  });
});

test('同名并发只统计相同任务名称', () => {
  const activeNames = ['pdf.generate', 'email.send', 'email.send'];
  assert.equal(
    hasTaskNameCapacity('pdf.generate', 1, activeNames),
    false,
  );
  assert.equal(hasTaskNameCapacity('email.send', 3, activeNames), true);
  assert.equal(
    hasTaskNameCapacity('document.process', 2, [
      'document.process',
      'document.process',
    ]),
    false,
  );
});

test('整体文档任务按 parts 组合执行或跳过未选部分', () => {
  const base = {
    fileId: 'file-id',
    documentId: 'document-id',
    documentVersionId: 'version-id',
    userId: 'user-id',
    triggerSource: 'manual' as const,
    processingConfigVersions: {
      content: 'content-v1',
      preview: 'preview-v1',
    },
  };
  assert.deepEqual(
    resolveDocumentTaskParts({
      ...base,
      parts: ['content', 'preview'],
    }),
    ['content', 'preview'],
  );
  assert.deepEqual(
    resolveDocumentTaskParts({ ...base, parts: ['preview'] }),
    ['preview'],
  );
  assert.throws(
    () =>
      resolveDocumentTaskParts({
        ...base,
        parts: ['cleanup', 'content'],
      } as unknown as DocumentTaskData),
    /清理部分必须独占任务/u,
  );
});
