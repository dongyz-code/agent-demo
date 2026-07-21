import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import {
  FileProcessingLeaseLostError,
  runFileProcessingTask,
} from '../processing/runner.js';
import {
  getHeartbeatIntervalMs,
  startFileProcessingHeartbeat,
} from '../processing/worker.js';

test('heartbeat 间隔小于 stale 阈值且有安全上限', () => {
  assert.equal(getHeartbeatIntervalMs(300), 30_000);
  assert.equal(getHeartbeatIntervalMs(9), 3_000);
  assert.equal(getHeartbeatIntervalMs(2), 1_000);
  assert.ok(getHeartbeatIntervalMs(1) < 1_000);
});

test('长阶段执行期间按短间隔续租，停止后不再留下 timer', async () => {
  let renewCount = 0;
  const heartbeat = startFileProcessingHeartbeat({
    leaseId: 'lease-1',
    intervalMs: 5,
    renew: async () => {
      renewCount += 1;
      return true;
    },
  });

  await delay(24);
  await heartbeat.lease.assertActive();
  await heartbeat.stop();
  const stoppedAt = renewCount;
  await delay(15);

  assert.ok(stoppedAt >= 3);
  assert.equal(renewCount, stoppedAt);
});

test('heartbeat 条件失配会使后续阶段边界校验失败', async () => {
  const heartbeat = startFileProcessingHeartbeat({
    leaseId: 'lease-1',
    intervalMs: 60_000,
    renew: async () => false,
  });

  try {
    await assert.rejects(
      heartbeat.lease.assertActive(),
      FileProcessingLeaseLostError,
    );
    await assert.rejects(
      heartbeat.lease.assertActive(),
      FileProcessingLeaseLostError,
    );
  } finally {
    await heartbeat.stop();
  }
});

test('heartbeat 数据库异常同样标记 lease 失效', async () => {
  const heartbeat = startFileProcessingHeartbeat({
    leaseId: 'lease-1',
    intervalMs: 60_000,
    renew: async () => {
      throw new Error('database unavailable');
    },
  });

  try {
    await assert.rejects(
      heartbeat.lease.assertActive(),
      FileProcessingLeaseLostError,
    );
  } finally {
    await heartbeat.stop();
  }
});

test('阶段开始前 lease 已失效时 runner 直接结束', async () => {
  let checkCount = 0;

  await runFileProcessingTask(
    {
      taskId: 'task-1',
      fileId: 'file-1',
      documentId: 'document-1',
      documentVersionId: 'version-1',
      datasetId: 'dataset-1',
      userId: 'user-1',
    },
    {
      leaseId: 'lease-1',
      assertActive: async () => {
        checkCount += 1;
        throw new FileProcessingLeaseLostError();
      },
    },
  );

  assert.equal(checkCount, 1);
});

test('runner 不写伪 checkpoint，worker 使用条件 lease 与稳定恢复错误码', async () => {
  const [runnerSource, workerSource] = await Promise.all([
    readFile(new URL('../processing/runner.ts', import.meta.url), 'utf8'),
    readFile(new URL('../processing/worker.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(runnerSource, /JSON\.stringify\(\{ processedItems \}\)/);
  assert.match(runnerSource, /checkpoint: null/);
  assert.match(workerSource, /eq\(schema\.tasks\.status, 'pending'\)/);
  assert.match(workerSource, /eq\(schema\.tasks\.pending_uuid, leaseId\)/);
  assert.match(workerSource, /FILE_PROCESSING_WORKER_LOST/);
  assert.match(workerSource, /current_stage: 'queued'/);
});
