import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, lt } from 'drizzle-orm';

import { logger, ROOT } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { FileProcessingLeaseLostError } from './runtime.js';
import {
  DOCUMENT_CLEANUP_TASK_KEY,
  FILE_PROCESSING_STAGE_PROGRESS,
  FILE_PROCESSING_TASK_KEY,
} from './definition.js';

import type {
  FileProcessingTaskContext,
  FileProcessingTaskLease,
} from './runtime.js';

/** 文档 worker 进程失效时写入阶段记录的稳定错误码。 */
const FILE_PROCESSING_WORKER_LOST_ERROR = 'FILE_PROCESSING_WORKER_LOST';

/** 当前进程正在执行的文件任务，防止同一实例重复领取。 */
const activeTaskIds = new Set<string>();
let workerTimer: ReturnType<typeof setInterval> | undefined;
let workerStarting: Promise<void> | undefined;
let draining = false;

/** heartbeat 控制器，worker 结束单任务时必须释放 timer。 */
interface FileProcessingHeartbeat {
  /** runner 使用的 lease 校验器。 */
  lease: FileProcessingTaskLease;
  /** 停止 heartbeat，并等待正在执行的续租结束。 */
  stop: () => Promise<void>;
}

/**
 * 从 stale 阈值推导 heartbeat 间隔。
 *
 * @param staleTaskSeconds 任务被判定失效的秒数。
 * @returns 小于 stale 阈值且不超过 30 秒的毫秒间隔。
 */
function getHeartbeatIntervalMs(staleTaskSeconds: number): number {
  const staleMs = Math.max(2, Math.floor(staleTaskSeconds * 1000));
  return Math.min(
    30_000,
    Math.max(1_000, Math.floor(staleMs / 3)),
    staleMs - 1,
  );
}

/**
 * 启动单任务 heartbeat，并提供阶段边界的主动 lease 校验。
 *
 * @param input lease 标识、续租间隔和数据库续租动作。
 * @returns runner lease 与释放函数。
 */
function startFileProcessingHeartbeat(input: {
  /** 当前领取生成的唯一 token。 */
  leaseId: string;
  /** heartbeat 毫秒间隔。 */
  intervalMs: number;
  /** 条件续租动作；仍持有任务时返回 true。 */
  renew: () => Promise<boolean>;
}): FileProcessingHeartbeat {
  let lost = false;
  let inFlight: Promise<void> | undefined;

  /** 执行一次续租；任意失败都把当前执行器标记为失去 lease。 */
  const renewOnce = async () => {
    if (lost) throw new FileProcessingLeaseLostError();
    if (inFlight) await inFlight;
    if (lost) throw new FileProcessingLeaseLostError();

    inFlight = (async () => {
      try {
        if (!(await input.renew())) lost = true;
      } catch {
        lost = true;
      }
    })().finally(() => {
      inFlight = undefined;
    });
    await inFlight;
    if (lost) throw new FileProcessingLeaseLostError();
  };

  const timer = setInterval(() => {
    if (lost || inFlight) return;
    void renewOnce().catch(() => undefined);
  }, input.intervalMs);
  timer.unref();

  return {
    lease: {
      leaseId: input.leaseId,
      assertActive: renewOnce,
    },
    stop: async () => {
      clearInterval(timer);
      await inFlight;
    },
  };
}

/** 启动文件处理 worker，并先恢复失去 heartbeat 的历史任务。 */
export async function startFileProcessingWorker(): Promise<void> {
  if (workerTimer) return;
  if (workerStarting) return await workerStarting;

  workerStarting = (async () => {
    await recoverStaleFileProcessingTasks();
    if (workerTimer) return;
    workerTimer = setInterval(notifyFileProcessingWorker, 2_000);
    workerTimer.unref();
    notifyFileProcessingWorker();
  })().finally(() => {
    workerStarting = undefined;
  });
  await workerStarting;
}

/** 通知 worker 尽快领取等待任务。 */
export function notifyFileProcessingWorker(): void {
  queueMicrotask(() => {
    drainFileProcessingTasks().catch((error) => {
      logger.error(
        { event: 'file.processing.worker_drain_failed', err: error },
        '文件处理任务领取失败',
      );
    });
  });
}

/** 将 stale 任务的遗留阶段终结后重置为从 reading 重试。 */
async function recoverStaleFileProcessingTasks(): Promise<void> {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - ROOT.fileProcessing.staleTaskSeconds * 1000,
  );
  await db.transaction(async (tx) => {
    const staleTasks = await tx
      .select({ taskId: schema.tasks.task_id })
      .from(schema.tasks)
      .where(
        and(
          inArray(schema.tasks.task_key, getWorkerTaskKeys()),
          eq(schema.tasks.status, 'pending'),
          lt(schema.tasks.last_update_timestamp, staleBefore),
        ),
      )
      .for('update', { skipLocked: true });
    if (!staleTasks.length) return;

    const taskIds = staleTasks.map((task) => task.taskId);
    await tx
      .update(schema.file_processing_task_stage_runs)
      .set({
        status: 'failed',
        error_code: FILE_PROCESSING_WORKER_LOST_ERROR,
        error_message: '上一个 worker 失去 lease，任务将从 reading 重新执行',
        end_timestamp: now,
      })
      .where(
        and(
          inArray(schema.file_processing_task_stage_runs.task_id, taskIds),
          eq(schema.file_processing_task_stage_runs.status, 'pending'),
        ),
      );
    await tx
      .update(schema.tasks)
      .set({
        status: 'to-be-started',
        current_stage: 'queued',
        pending_uuid: null,
        progress: 0,
        processed_items: 0,
        total_items: 0,
        error_code: null,
        error_message: null,
        start_timestamp: null,
        end_timestamp: null,
        last_update_timestamp: now,
      })
      .where(
        and(
          inArray(schema.tasks.task_id, taskIds),
          eq(schema.tasks.status, 'pending'),
        ),
      );
  });
}

/** 在并发上限内读取等待任务并触发原子领取。 */
async function drainFileProcessingTasks(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const available =
      ROOT.fileProcessing.workerConcurrency - activeTaskIds.size;
    if (available <= 0) return;
    const tasks = await db
      .select({
        taskId: schema.tasks.task_id,
        taskKey: schema.tasks.task_key,
      })
      .from(schema.tasks)
      .where(
        and(
          inArray(schema.tasks.task_key, getWorkerTaskKeys()),
          eq(schema.tasks.status, 'to-be-started'),
        ),
      )
      .orderBy(asc(schema.tasks.create_timestamp))
      .limit(available);
    for (const task of tasks) {
      void runClaimedFileProcessingTask(task.taskId, task.taskKey).catch(
        (error) => {
          logger.error(
            {
              event: 'file.processing.unhandled',
              taskId: task.taskId,
              err: error,
            },
            '文件处理任务执行失败',
          );
        },
      );
    }
  } finally {
    draining = false;
  }
}

/** 原子领取并执行单个任务，同一进程不会并行领取相同标识。 */
async function runClaimedFileProcessingTask(
  taskId: string,
  taskKey: string,
): Promise<void> {
  if (activeTaskIds.has(taskId)) return;
  activeTaskIds.add(taskId);
  let heartbeat: FileProcessingHeartbeat | undefined;
  try {
    if (taskKey === DOCUMENT_CLEANUP_TASK_KEY) {
      const claimed = await claimDocumentCleanupTask(taskId);
      if (!claimed) return;
      heartbeat = startFileProcessingHeartbeat({
        leaseId: claimed.leaseId,
        intervalMs: getHeartbeatIntervalMs(
          ROOT.fileProcessing.staleTaskSeconds,
        ),
        renew: async () =>
          await renewFileProcessingLease(taskId, claimed.leaseId),
      });
      const { runDocumentCleanupTask } =
        await import('../document/cleanup.js');
      await runDocumentCleanupTask(claimed.context, heartbeat.lease);
      return;
    }
    const claimed = await claimFileProcessingTask(taskId);
    if (!claimed) return;
    heartbeat = startFileProcessingHeartbeat({
      leaseId: claimed.leaseId,
      intervalMs: getHeartbeatIntervalMs(ROOT.fileProcessing.staleTaskSeconds),
      renew: async () =>
        await renewFileProcessingLease(taskId, claimed.leaseId),
    });
    if (claimed.context.taskType === 'preview') {
      const { runDocumentPreviewTask } = await import('../preview/runner.js');
      await runDocumentPreviewTask(claimed.context, heartbeat.lease);
    } else {
      const { runDocumentRagTask } = await import('../rag/runner.js');
      await runDocumentRagTask(claimed.context, heartbeat.lease);
    }
  } finally {
    await heartbeat?.stop();
    activeTaskIds.delete(taskId);
    notifyFileProcessingWorker();
  }
}

/**
 * 条件领取等待任务并构造 runner 上下文。
 *
 * @param taskId 待领取的通用任务标识。
 * @returns 领取成功时返回 lease 和上下文，状态已变化时返回空。
 */
async function claimFileProcessingTask(taskId: string): Promise<
  | {
      /** 当前领取生成的唯一 token。 */
      leaseId: string;
      /** runner 执行所需上下文。 */
      context: FileProcessingTaskContext;
    }
  | undefined
> {
  const claimed = await claimTaskLease(taskId, 'reading');
  if (!claimed) return;
  const { leaseId } = claimed;

  const [row] = await db
    .select({ fileTask: schema.file_processing_tasks })
    .from(schema.file_processing_tasks)
    .where(eq(schema.file_processing_tasks.task_id, taskId))
    .limit(1);
  if (
    !row?.fileTask.document_id ||
    !row.fileTask.document_version_id ||
    (row.fileTask.task_type === 'rag' && !row.fileTask.dataset_id)
  ) {
    await failInvalidClaimedTask(taskId, leaseId);
    return;
  }
  return {
    leaseId,
    context: {
      taskId,
      fileId: row.fileTask.file_id,
      documentId: row.fileTask.document_id,
      documentVersionId: row.fileTask.document_version_id,
      datasetId: row.fileTask.dataset_id,
      taskType: row.fileTask.task_type,
      userId: row.fileTask.create_user_id,
    },
  };
}

/**
 * 条件领取文档级清理任务并校验其通用任务上下文。
 *
 * @param taskId 待领取的 cleanup task 标识。
 * @returns 领取成功时返回 lease、文档和审计用户，状态变化时返回空。
 */
async function claimDocumentCleanupTask(taskId: string) {
  const claimed = await claimTaskLease(taskId, 'cleanup-objects');
  if (!claimed) return;
  if (
    claimed.taskKey !== DOCUMENT_CLEANUP_TASK_KEY ||
    claimed.businessType !== 'document' ||
    !claimed.businessId ||
    !claimed.userId
  ) {
    await failInvalidClaimedTask(taskId, claimed.leaseId);
    return;
  }
  return {
    leaseId: claimed.leaseId,
    context: {
      taskId,
      documentId: claimed.businessId,
      userId: claimed.userId,
    },
  };
}

/**
 * 原子把一个等待任务切换为 pending，并返回通用业务上下文。
 *
 * @param taskId 待领取的通用任务标识。
 * @param currentStage 领取成功后写入的初始阶段。
 * @returns 领取成功时的 lease 和业务字段，状态已变化时返回空。
 */
async function claimTaskLease(taskId: string, currentStage: string) {
  const now = new Date();
  const leaseId = randomUUID();
  const [claimed] = await db
    .update(schema.tasks)
    .set({
      status: 'pending',
      current_stage: currentStage,
      pending_uuid: leaseId,
      progress:
        currentStage === 'reading'
          ? FILE_PROCESSING_STAGE_PROGRESS.reading
          : 10,
      processed_items: 0,
      total_items: 0,
      start_timestamp: now,
      end_timestamp: null,
      error_code: null,
      error_message: null,
      last_update_timestamp: now,
    })
    .where(
      and(
        eq(schema.tasks.task_id, taskId),
        eq(schema.tasks.status, 'to-be-started'),
      ),
    )
    .returning({
      taskId: schema.tasks.task_id,
      taskKey: schema.tasks.task_key,
      businessType: schema.tasks.business_type,
      businessId: schema.tasks.business_id,
      userId: schema.tasks.execution_user_id,
    });
  if (!claimed) return;
  return {
    leaseId,
    taskKey: claimed.taskKey,
    businessType: claimed.businessType,
    businessId: claimed.businessId,
    userId: claimed.userId,
  };
}

/**
 * 返回当前配置下 worker 可以领取的任务键。
 *
 * @returns 始终包含 cleanup；文件处理关闭时不包含 preview/rag 任务键。
 */
function getWorkerTaskKeys(): string[] {
  return ROOT.fileProcessing.enabled
    ? [FILE_PROCESSING_TASK_KEY, DOCUMENT_CLEANUP_TASK_KEY]
    : [DOCUMENT_CLEANUP_TASK_KEY];
}

/**
 * 条件续租当前执行器仍持有的 pending 任务。
 *
 * @param taskId 当前通用任务标识。
 * @param leaseId 当前领取生成的唯一 token。
 * @returns 条件更新命中当前任务时返回 true。
 */
async function renewFileProcessingLease(
  taskId: string,
  leaseId: string,
): Promise<boolean> {
  const [renewed] = await db
    .update(schema.tasks)
    .set({ last_update_timestamp: new Date() })
    .where(
      and(
        eq(schema.tasks.task_id, taskId),
        eq(schema.tasks.status, 'pending'),
        eq(schema.tasks.pending_uuid, leaseId),
      ),
    )
    .returning({ taskId: schema.tasks.task_id });
  return Boolean(renewed);
}

/** 把领取后发现上下文缺失的任务标记为失败。 */
async function failInvalidClaimedTask(
  taskId: string,
  leaseId: string,
): Promise<void> {
  await db
    .update(schema.tasks)
    .set({
      status: 'failed',
      error_code: 'FILE_PROCESSING_CONTEXT_INVALID',
      error_message: '文件处理任务上下文不完整',
      end_timestamp: new Date(),
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.tasks.task_id, taskId),
        eq(schema.tasks.status, 'pending'),
        eq(schema.tasks.pending_uuid, leaseId),
      ),
    );
}
