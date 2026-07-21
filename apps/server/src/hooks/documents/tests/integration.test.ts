import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const integrationEnabled = process.env.DOCUMENTS_INTEGRATION_TEST === '1';
const integrationSkipReason = integrationEnabled
  ? false
  : '未设置 DOCUMENTS_INTEGRATION_TEST=1，跳过 PostgreSQL/MinIO 集成测试';

test(
  'MinIO 可完成真实对象上传、读取和删除',
  { skip: integrationSkipReason },
  async () => {
    const { ROOT } = await import('@/configs/index.js');
    const {
      deleteStoredObject,
      headStoredObject,
      openStoredObject,
      putStoredObject,
    } = await import('../storage/commands.js');
    const objectKey = `integration/documents/${randomUUID()}.txt`;
    const body = Buffer.from('documents integration test');

    try {
      await putStoredObject({
        bucket: ROOT.upload.bucket,
        objectKey,
        contentType: 'text/plain',
        content: body,
      });
      const head = await headStoredObject({
        bucket: ROOT.upload.bucket,
        objectKey,
      });
      const stream = await openStoredObject({
        bucket: ROOT.upload.bucket,
        objectKey,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      assert.equal(head.ContentLength, body.length);
      assert.equal(
        Buffer.concat(chunks).toString('utf8'),
        body.toString('utf8'),
      );
    } finally {
      await deleteStoredObject({
        bucket: ROOT.upload.bucket,
        objectKey,
      });
    }
  },
);

test(
  'PostgreSQL 原子领取只允许一个 worker 获得同一任务',
  { skip: integrationSkipReason },
  async () => {
    const { db, schema } = await import('@/database/index.js');
    const { claimFileProcessingTask, renewFileProcessingLease } =
      await import('../processing/worker.js');
    const taskId = randomUUID();
    const now = new Date();

    try {
      await db.insert(schema.tasks).values({
        task_id: taskId,
        task_key: 'file-processing',
        task_name: 'documents worker integration',
        search_key: null,
        pending_uuid: null,
        task_category: 'file-processing',
        business_type: 'file',
        business_id: randomUUID(),
        current_stage: 'queued',
        progress: 0,
        processed_items: 0,
        total_items: 0,
        error_code: null,
        error_message: null,
        args: null,
        status: 'to-be-started',
        execution_user_id: 'integration-test',
        trigger_method: 'manual',
        create_timestamp: now,
        start_timestamp: null,
        end_timestamp: null,
        logs: null,
        last_update_timestamp: now,
      });
      await db.insert(schema.file_processing_tasks).values({
        task_id: taskId,
        file_id: randomUUID(),
        document_id: randomUUID(),
        document_version_id: randomUUID(),
        dataset_id: randomUUID(),
        execution_no: 1,
        trigger_source: 'manual',
        processing_config_version: 'integration-v1',
        result_summary: null,
        create_user_id: 'integration-test',
        create_timestamp: now,
        last_update_user_id: 'integration-test',
        last_update_timestamp: now,
      });

      const claims = await Promise.all([
        claimFileProcessingTask(taskId),
        claimFileProcessingTask(taskId),
      ]);
      const claimed = claims.filter((value) => value !== undefined);

      assert.equal(claimed.length, 1);
      assert.equal(
        await renewFileProcessingLease(taskId, claimed[0]!.leaseId),
        true,
      );
      assert.equal(await renewFileProcessingLease(taskId, randomUUID()), false);
    } finally {
      await db
        .delete(schema.file_processing_task_stage_runs)
        .where(
          (await import('drizzle-orm')).eq(
            schema.file_processing_task_stage_runs.task_id,
            taskId,
          ),
        );
      await db
        .delete(schema.file_processing_tasks)
        .where(
          (await import('drizzle-orm')).eq(
            schema.file_processing_tasks.task_id,
            taskId,
          ),
        );
      await db
        .delete(schema.tasks)
        .where((await import('drizzle-orm')).eq(schema.tasks.task_id, taskId));
    }
  },
);

test(
  'PostgreSQL stale 恢复终结 pending 阶段并从 queued 重试',
  { skip: integrationSkipReason },
  async () => {
    const { eq } = await import('drizzle-orm');
    const { db, schema } = await import('@/database/index.js');
    const {
      FILE_PROCESSING_WORKER_LOST_ERROR,
      claimFileProcessingTask,
      recoverStaleFileProcessingTasks,
      renewFileProcessingLease,
    } = await import('../processing/worker.js');
    const { runFileProcessingTask } = await import('../processing/runner.js');
    const taskId = randomUUID();
    const pendingStageRunId = randomUUID();
    const completedStageRunId = randomUUID();
    const now = new Date();
    const staleAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      await db.insert(schema.tasks).values({
        task_id: taskId,
        task_key: 'file-processing',
        task_name: 'documents stale integration',
        search_key: null,
        pending_uuid: randomUUID(),
        task_category: 'file-processing',
        business_type: 'file',
        business_id: randomUUID(),
        current_stage: 'parsing',
        progress: 30,
        processed_items: 0,
        total_items: 0,
        error_code: null,
        error_message: null,
        args: null,
        status: 'pending',
        execution_user_id: 'integration-test',
        trigger_method: 'manual',
        create_timestamp: staleAt,
        start_timestamp: staleAt,
        end_timestamp: null,
        logs: null,
        last_update_timestamp: staleAt,
      });
      await db.insert(schema.file_processing_tasks).values({
        task_id: taskId,
        file_id: randomUUID(),
        document_id: randomUUID(),
        document_version_id: randomUUID(),
        dataset_id: randomUUID(),
        execution_no: 1,
        trigger_source: 'manual',
        processing_config_version: 'integration-v1',
        result_summary: null,
        create_user_id: 'integration-test',
        create_timestamp: staleAt,
        last_update_user_id: 'integration-test',
        last_update_timestamp: staleAt,
      });
      await db.insert(schema.file_processing_task_stage_runs).values([
        {
          stage_run_id: completedStageRunId,
          task_id: taskId,
          stage: 'reading',
          attempt: 1,
          status: 'completed',
          processed_items: 1,
          total_items: 1,
          checkpoint: null,
          error_code: null,
          error_message: null,
          start_timestamp: staleAt,
          end_timestamp: staleAt,
        },
        {
          stage_run_id: pendingStageRunId,
          task_id: taskId,
          stage: 'parsing',
          attempt: 1,
          status: 'pending',
          processed_items: 0,
          total_items: 0,
          checkpoint: null,
          error_code: null,
          error_message: null,
          start_timestamp: staleAt,
          end_timestamp: null,
        },
      ]);

      await recoverStaleFileProcessingTasks();
      const [taskRow] = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.task_id, taskId));
      const stageRows = await db
        .select()
        .from(schema.file_processing_task_stage_runs)
        .where(eq(schema.file_processing_task_stage_runs.task_id, taskId));

      assert.equal(taskRow?.status, 'to-be-started');
      assert.equal(taskRow?.current_stage, 'queued');
      assert.equal(
        stageRows.find((row) => row.stage_run_id === pendingStageRunId)
          ?.error_code,
        FILE_PROCESSING_WORKER_LOST_ERROR,
      );
      assert.equal(
        stageRows.find((row) => row.stage_run_id === completedStageRunId)
          ?.status,
        'completed',
      );

      const claimed = await claimFileProcessingTask(taskId);
      assert.ok(claimed);
      const [restarted] = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.task_id, taskId));
      assert.equal(restarted?.current_stage, 'reading');

      await assert.rejects(
        runFileProcessingTask(claimed.context, {
          leaseId: claimed.leaseId,
          assertActive: async () => {
            if (!(await renewFileProcessingLease(taskId, claimed.leaseId))) {
              throw new Error('lease lost');
            }
          },
        }),
      );
      const attempts = await db
        .select()
        .from(schema.file_processing_task_stage_runs)
        .where(eq(schema.file_processing_task_stage_runs.task_id, taskId));
      const retriedReading = attempts.find(
        (row) => row.stage === 'reading' && row.attempt === 2,
      );
      assert.equal(retriedReading?.status, 'failed');
      assert.equal(retriedReading?.checkpoint, null);
    } finally {
      await db
        .delete(schema.file_processing_task_stage_runs)
        .where(eq(schema.file_processing_task_stage_runs.task_id, taskId));
      await db
        .delete(schema.file_processing_tasks)
        .where(eq(schema.file_processing_tasks.task_id, taskId));
      await db.delete(schema.tasks).where(eq(schema.tasks.task_id, taskId));
    }
  },
);

test(
  'PostgreSQL 远程动作期间取消会终结当前阶段且不提交结果',
  { skip: integrationSkipReason },
  async () => {
    const { eq } = await import('drizzle-orm');
    const { db, schema } = await import('@/database/index.js');
    const { FileProcessingLeaseLostError, runTaskStage } =
      await import('../processing/runner.js');
    const { renewFileProcessingLease } =
      await import('../processing/worker.js');
    const taskId = randomUUID();
    const leaseId = randomUUID();
    const now = new Date();
    let releaseAction: (() => void) | undefined;
    let markActionStarted: (() => void) | undefined;
    const actionStarted = new Promise<void>((resolve) => {
      markActionStarted = resolve;
    });
    const actionRelease = new Promise<void>((resolve) => {
      releaseAction = resolve;
    });

    try {
      await db.insert(schema.tasks).values({
        task_id: taskId,
        task_key: 'file-processing',
        task_name: 'documents cancel integration',
        search_key: null,
        pending_uuid: leaseId,
        task_category: 'file-processing',
        business_type: 'file',
        business_id: randomUUID(),
        current_stage: 'reading',
        progress: 10,
        processed_items: 0,
        total_items: 0,
        error_code: null,
        error_message: null,
        args: null,
        status: 'pending',
        execution_user_id: 'integration-test',
        trigger_method: 'manual',
        create_timestamp: now,
        start_timestamp: now,
        end_timestamp: null,
        logs: null,
        last_update_timestamp: now,
      });
      const lease = {
        leaseId,
        assertActive: async () => {
          if (!(await renewFileProcessingLease(taskId, leaseId))) {
            throw new FileProcessingLeaseLostError();
          }
        },
      };
      const running = runTaskStage(
        {
          taskId,
          fileId: randomUUID(),
          documentId: randomUUID(),
          documentVersionId: randomUUID(),
          datasetId: randomUUID(),
          userId: 'integration-test',
        },
        lease,
        'parsing',
        async () => {
          markActionStarted?.();
          await actionRelease;
          return ['parsed-result'];
        },
      );

      await actionStarted;
      await db
        .update(schema.tasks)
        .set({ status: 'killed', end_timestamp: new Date() })
        .where(eq(schema.tasks.task_id, taskId));
      releaseAction?.();
      await assert.rejects(running, FileProcessingLeaseLostError);

      const [stage] = await db
        .select()
        .from(schema.file_processing_task_stage_runs)
        .where(eq(schema.file_processing_task_stage_runs.task_id, taskId));
      assert.equal(stage?.status, 'killed');
      assert.equal(stage?.processed_items, 0);
      assert.equal(stage?.checkpoint, null);
    } finally {
      releaseAction?.();
      await db
        .delete(schema.file_processing_task_stage_runs)
        .where(eq(schema.file_processing_task_stage_runs.task_id, taskId));
      await db.delete(schema.tasks).where(eq(schema.tasks.task_id, taskId));
    }
  },
);

test(
  'worker 重复启动保持幂等且停止后释放轮询 timer',
  { skip: integrationSkipReason },
  async () => {
    const { setImmediate: waitForImmediate } =
      await import('node:timers/promises');
    const { ROOT } = await import('@/configs/index.js');
    const {
      isFileProcessingWorkerStarted,
      startFileProcessingWorker,
      stopFileProcessingWorker,
    } = await import('../processing/worker.js');
    const previousConcurrency = ROOT.fileProcessing.workerConcurrency;
    const previousStaleSeconds = ROOT.fileProcessing.staleTaskSeconds;
    ROOT.fileProcessing.workerConcurrency = 0;
    ROOT.fileProcessing.staleTaskSeconds = 1_000_000_000;

    try {
      await Promise.all([
        startFileProcessingWorker(),
        startFileProcessingWorker(),
      ]);
      assert.equal(isFileProcessingWorkerStarted(), true);
      await stopFileProcessingWorker();
      await stopFileProcessingWorker();
      assert.equal(isFileProcessingWorkerStarted(), false);
      await waitForImmediate();
    } finally {
      await stopFileProcessingWorker();
      ROOT.fileProcessing.workerConcurrency = previousConcurrency;
      ROOT.fileProcessing.staleTaskSeconds = previousStaleSeconds;
    }
  },
);
