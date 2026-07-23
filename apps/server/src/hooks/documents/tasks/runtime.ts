import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
import { FILE_PROCESSING_STAGE_PROGRESS } from './definition.js';
import { getErrorCode } from './errors.js';

import type {
  DocumentProcessingTaskType,
  FileProcessingStage,
} from '@repo/types';

/** worker 领取后交给运行时的完整任务上下文。 */
export interface FileProcessingTaskContext {
  /** 通用任务标识。 */
  taskId: string;
  /** 被处理文件。 */
  fileId: string;
  /** 逻辑文档标识。 */
  documentId: string;
  /** 当前文档版本标识。 */
  documentVersionId: string;
  /** 目标知识库标识。 */
  datasetId: string | null;
  /** 当前任务执行预览还是 RAG 处理。 */
  taskType?: DocumentProcessingTaskType;
  /** 创建任务的操作用户。 */
  userId: string;
}

/** runner 用于确认当前进程仍持有任务的最小 lease。 */
export interface FileProcessingTaskLease {
  /** 当前领取生成的唯一 token。 */
  leaseId: string;
  /** 续租并确认任务仍属于当前执行器，失效时抛出错误。 */
  assertActive: () => Promise<void>;
}

/** 当前执行器不再拥有任务时使用的内部错误。 */
export class FileProcessingLeaseLostError extends Error {
  /** 构造稳定且不包含业务内容的 lease 失效错误。 */
  constructor() {
    super('FILE_PROCESSING_LEASE_LOST: 文件处理任务 lease 已失效');
    this.name = 'FileProcessingLeaseLostError';
  }
}

/**
 * 执行单个阶段并记录进度、尝试次数和错误。
 *
 * @param context worker 已领取的任务上下文。
 * @param lease 当前领取对应的 lease 校验器。
 * @param stage 本次执行的文件处理阶段。
 * @param action 阶段业务动作，可能包含外部请求。
 * @returns 阶段动作完成且 lease 仍有效时返回动作结果。
 */
export async function runTaskStage<T>(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
  stage: FileProcessingStage,
  action: () => Promise<T> | T,
) {
  await lease.assertActive();
  const attempt =
    (await countRows(
      schema.file_processing_task_stage_runs,
      and(
        eq(schema.file_processing_task_stage_runs.task_id, context.taskId),
        eq(schema.file_processing_task_stage_runs.stage, stage),
      ),
    )) + 1;
  const stageRunId = randomUUID();
  const start = new Date();
  await db.transaction(async (tx) => {
    const [owned] = await tx
      .update(schema.tasks)
      .set({
        current_stage: stage,
        progress: FILE_PROCESSING_STAGE_PROGRESS[stage],
        last_update_timestamp: start,
      })
      .where(
        and(
          eq(schema.tasks.task_id, context.taskId),
          eq(schema.tasks.status, 'pending'),
          eq(schema.tasks.pending_uuid, lease.leaseId),
        ),
      )
      .returning({ taskId: schema.tasks.task_id });
    if (!owned) throw new FileProcessingLeaseLostError();
    await tx.insert(schema.file_processing_task_stage_runs).values({
      stage_run_id: stageRunId,
      task_id: context.taskId,
      stage,
      attempt,
      status: 'pending',
      processed_items: 0,
      total_items: 0,
      checkpoint: null,
      error_code: null,
      error_message: null,
      start_timestamp: start,
      end_timestamp: null,
    });
  });
  try {
    const result = await action();
    await lease.assertActive();
    const processedItems = getProcessedItems(result);
    await db.transaction(async (tx) => {
      const [owned] = await tx
        .update(schema.tasks)
        .set({ last_update_timestamp: new Date() })
        .where(
          and(
            eq(schema.tasks.task_id, context.taskId),
            eq(schema.tasks.status, 'pending'),
            eq(schema.tasks.pending_uuid, lease.leaseId),
          ),
        )
        .returning({ taskId: schema.tasks.task_id });
      if (!owned) throw new FileProcessingLeaseLostError();
      await tx
        .update(schema.file_processing_task_stage_runs)
        .set({
          status: 'completed',
          processed_items: processedItems,
          total_items: processedItems,
          checkpoint: null,
          end_timestamp: new Date(),
        })
        .where(
          eq(schema.file_processing_task_stage_runs.stage_run_id, stageRunId),
        );
      await tx
        .update(schema.tasks)
        .set({
          processed_items: processedItems,
          total_items: processedItems,
          last_update_timestamp: new Date(),
        })
        .where(
          and(
            eq(schema.tasks.task_id, context.taskId),
            eq(schema.tasks.status, 'pending'),
            eq(schema.tasks.pending_uuid, lease.leaseId),
          ),
        );
    });
    return result;
  } catch (error) {
    try {
      await lease.assertActive();
    } catch (leaseError) {
      if (await isTaskCanceled(context.taskId)) {
        await finishCanceledStageRun(stageRunId);
      }
      throw leaseError;
    }
    const message = error instanceof Error ? error.message : '阶段执行失败';
    await db
      .update(schema.file_processing_task_stage_runs)
      .set({
        status: (await isTaskCanceled(context.taskId)) ? 'killed' : 'failed',
        error_code: getErrorCode(message, 'FILE_PROCESSING_FAILED'),
        error_message: message,
        end_timestamp: new Date(),
      })
      .where(
        eq(schema.file_processing_task_stage_runs.stage_run_id, stageRunId),
      );
    throw error;
  }
}

/** 将任务标记为成功并写入安全结果摘要。 */
export async function completeTask(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
  segmentCount: number,
  resultSummary: Record<string, unknown>,
) {
  await lease.assertActive();
  const now = new Date();
  await db.transaction(async (tx) => {
    const [completed] = await tx
      .update(schema.tasks)
      .set({
        status: 'completed',
        current_stage: 'completed',
        progress: 100,
        processed_items: segmentCount,
        total_items: segmentCount,
        end_timestamp: now,
        error_code: null,
        error_message: null,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(schema.tasks.task_id, context.taskId),
          eq(schema.tasks.status, 'pending'),
          eq(schema.tasks.pending_uuid, lease.leaseId),
        ),
      )
      .returning({ taskId: schema.tasks.task_id });
    if (!completed) throw new FileProcessingLeaseLostError();
    await tx
      .update(schema.file_processing_tasks)
      .set({
        result_summary: JSON.stringify(resultSummary),
        last_update_user_id: context.userId,
        last_update_timestamp: now,
      })
      .where(eq(schema.file_processing_tasks.task_id, context.taskId));
  });
}

/** 将仍由当前 lease 持有的任务标记为失败并保留当前阶段。 */
export async function failTask(
  taskId: string,
  leaseId: string,
  errorCode: string,
  message: string,
) {
  const [failed] = await db
    .update(schema.tasks)
    .set({
      status: 'failed',
      error_code: errorCode,
      error_message: message,
      end_timestamp: new Date(),
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.tasks.task_id, taskId),
        eq(schema.tasks.status, 'pending'),
        eq(schema.tasks.pending_uuid, leaseId),
      ),
    )
    .returning({ taskId: schema.tasks.task_id });
  return Boolean(failed);
}

/** 将取消期间仍为 pending 的当前阶段记录终结为 killed。 */
async function finishCanceledStageRun(stageRunId: string) {
  await db
    .update(schema.file_processing_task_stage_runs)
    .set({
      status: 'killed',
      error_code: 'FILE_PROCESSING_TASK_CANCELED',
      error_message: '文件处理任务已取消',
      end_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.file_processing_task_stage_runs.stage_run_id, stageRunId),
        eq(schema.file_processing_task_stage_runs.status, 'pending'),
      ),
    );
}

/** 查询任务是否已被取消。 */
export async function isTaskCanceled(taskId: string) {
  const [task] = await db
    .select({ status: schema.tasks.status })
    .from(schema.tasks)
    .where(eq(schema.tasks.task_id, taskId))
    .limit(1);
  return task?.status === 'killed';
}

/** 估算阶段结果数量，用于任务中心进度摘要。 */
function getProcessedItems(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    if ('segments' in value && Array.isArray(value.segments)) {
      return value.segments.length;
    }
    if ('blocks' in value && Array.isArray(value.blocks)) {
      return value.blocks.length;
    }
  }
  return 1;
}
