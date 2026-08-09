import { and, desc, eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { TaskCanceledError } from '@/hooks/tasks/task.js';
import { uuidv7 } from '@/utils/index.js';

import type { TaskRunInput } from '@/hooks/tasks/task.js';
import type {
  DocumentProcessingTaskPart,
  FileProcessingStage,
} from '@repo/types';
import type { DocumentTaskData } from './task.js';

/** 文件处理阶段对应的任务中心进度。 */
const STAGE_PROGRESS: Record<FileProcessingStage, number> = {
  queued: 0,
  reading: 10,
  parsing: 30,
  normalizing: 50,
  segmenting: 80,
  embedding: 85,
  'content-publishing': 95,
  'content-completed': 100,
  'preview-converting': 70,
  'preview-publishing': 90,
  'preview-completed': 100,
  completed: 100,
};

/** 已领取文件处理任务的完整领域上下文。 */
export interface FileProcessingTaskContext {
  /** 通用任务公共运行上下文。 */
  task: TaskRunInput<DocumentTaskData>;
  /** 被处理文件。 */
  fileId: string;
  /** 逻辑文档标识。 */
  documentId: string;
  /** 当前文档版本标识。 */
  documentVersionId: string;
  /** 当前整体任务正在执行的内容或预览部分。 */
  part: DocumentProcessingTaskPart;
  /** 当前部分映射到整体任务的起始进度。 */
  progressStart: number;
  /** 当前部分映射到整体任务的结束进度。 */
  progressEnd: number;
  /** 创建任务的操作用户。 */
  userId: string;
}

/** 单个阶段执行期间可恢复的轻量上下文。 */
export interface FileProcessingStageExecution {
  /** 上一个同阶段 attempt 保存的 checkpoint。 */
  checkpoint: unknown;
  /** 覆盖保存当前阶段的轻量 checkpoint。 */
  saveCheckpoint: (checkpoint: unknown) => Promise<void>;
}

/**
 * 执行单个文档阶段并保存独立阶段历史。
 *
 * @param context 已领取文件处理任务上下文。
 * @param stage 当前业务阶段。
 * @param action 阶段业务动作。
 * @returns 阶段业务动作结果。
 */
export async function runTaskStage<T>(
  context: FileProcessingTaskContext,
  stage: FileProcessingStage,
  action: (execution: FileProcessingStageExecution) => Promise<T> | T,
): Promise<T> {
  await context.task.throwIfCanceled();
  const [previousRun] = await db
    .select({
      attempt: schemas.file_processing_task_stage_runs.attempt,
      checkpoint: schemas.file_processing_task_stage_runs.checkpoint,
    })
    .from(schemas.file_processing_task_stage_runs)
    .where(
      and(
        eq(
          schemas.file_processing_task_stage_runs.task_id,
          context.task.taskId,
        ),
        eq(schemas.file_processing_task_stage_runs.stage, stage),
      ),
    )
    .orderBy(desc(schemas.file_processing_task_stage_runs.attempt))
    .limit(1);
  const attempt = (previousRun?.attempt ?? 0) + 1;
  const stageRunId = uuidv7();
  const now = new Date();
  await context.task.throwIfCanceled();
  await db.transaction(async (transaction) => {
    await transaction
      .update(schemas.file_processing_task_stage_runs)
      .set({
        status: 'interrupted',
        error_code: 'FILE_PROCESSING_WORKER_LOST',
        error_message: '上一执行进程已中断，新 attempt 将重新执行阶段',
        end_timestamp: now,
      })
      .where(
        and(
          eq(
            schemas.file_processing_task_stage_runs.task_id,
            context.task.taskId,
          ),
          eq(schemas.file_processing_task_stage_runs.status, 'running'),
        ),
      );
    await transaction.insert(schemas.file_processing_task_stage_runs).values({
      stage_run_id: stageRunId,
      task_id: context.task.taskId,
      stage,
      attempt,
      status: 'running',
      processed_items: 0,
      total_items: 0,
      checkpoint: previousRun?.checkpoint ?? null,
      error_code: null,
      error_message: null,
      start_timestamp: now,
      end_timestamp: null,
    });
  });
  await context.task.progress({
    stage,
    progress: mapPartProgress(context, STAGE_PROGRESS[stage]),
  });
  await context.task.log.info(`开始阶段：${stage}`);
  try {
    const result = await action({
      checkpoint: parseCheckpoint(previousRun?.checkpoint),
      saveCheckpoint: async (checkpoint) => {
        await saveStageCheckpoint(context, stageRunId, checkpoint);
      },
    });
    const processedItems = getProcessedItems(result);
    await context.task.throwIfCanceled();
    await db.transaction(async (transaction) => {
      await transaction
        .update(schemas.file_processing_task_stage_runs)
        .set({
          status: 'succeeded',
          processed_items: processedItems,
          total_items: processedItems,
          end_timestamp: new Date(),
        })
        .where(
          and(
            eq(
              schemas.file_processing_task_stage_runs.stage_run_id,
              stageRunId,
            ),
            eq(schemas.file_processing_task_stage_runs.status, 'running'),
          ),
        );
    });
    await context.task.progress({
      stage,
      progress: mapPartProgress(context, STAGE_PROGRESS[stage]),
      processedItems,
      totalItems: processedItems,
    });
    await context.task.log.info(
      `完成阶段：${stage}，处理数量：${processedItems}`,
    );
    return result;
  } catch (error) {
    await failStage(context, stageRunId, stage, error);
    throw error;
  }
}

/**
 * 保存文件处理结果摘要，通用任务成功由脚本正常返回自动完成。
 *
 * @param context 已领取文件处理任务上下文。
 * @param processedItems 页面或 Segment 数量。
 * @param resultSummary 领域结果摘要。
 * @returns 结果摘要和任务 lease 守卫在同一事务提交后结束。
 */
export async function completeFileProcessingTask(
  context: FileProcessingTaskContext,
  processedItems: number,
  resultSummary: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  await context.task.throwIfCanceled();
  await db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ summary: schemas.file_processing_tasks.result_summary })
      .from(schemas.file_processing_tasks)
      .where(
        eq(schemas.file_processing_tasks.task_id, context.task.taskId),
      )
      .limit(1);
    const summaries = parseResultSummaries(current?.summary);
    summaries[context.part] = resultSummary;
    await transaction
      .update(schemas.file_processing_tasks)
      .set({
        result_summary: JSON.stringify(summaries),
        last_update_user_id: context.userId,
        last_update_timestamp: now,
      })
      .where(
        eq(schemas.file_processing_tasks.task_id, context.task.taskId),
      );
  });
  await context.task.progress({
    stage: `${context.part}-completed`,
    progress: context.progressEnd,
    processedItems,
    totalItems: processedItems,
  });
  await context.task.log.info(`业务处理完成，处理数量：${processedItems}`);
}

/**
 * 把单个处理部分的百分比映射到整体任务进度区间。
 *
 * @param context 当前部分及其整体进度范围。
 * @param partProgress 当前部分内 0 到 100 的进度。
 * @returns 映射后的整体整数进度。
 */
function mapPartProgress(
  context: FileProcessingTaskContext,
  partProgress: number,
): number {
  const range = context.progressEnd - context.progressStart;
  return context.progressStart + Math.floor((range * partProgress) / 100);
}

/**
 * 解析各处理部分已经保存的结果摘要。
 *
 * @param value 数据库存储的 JSON 字符串。
 * @returns 可继续合并内容或预览结果的对象。
 */
function parseResultSummaries(
  value: string | null | undefined,
): Partial<Record<DocumentProcessingTaskPart, Record<string, unknown>>> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Partial<
      Record<DocumentProcessingTaskPart, Record<string, unknown>>
    >;
  } catch {
    throw new Error('FILE_PROCESSING_RESULT_INVALID: 任务结果摘要不是有效 JSON');
  }
}

/**
 * 保存当前阶段轻量 checkpoint。
 *
 * @param context 当前文件处理任务上下文。
 * @param stageRunId 当前活动阶段记录标识。
 * @param checkpoint 可 JSON 序列化的恢复信息。
 * @returns checkpoint 保存完成后结束，任务失效时抛出取消异常。
 */
async function saveStageCheckpoint(
  context: FileProcessingTaskContext,
  stageRunId: string,
  checkpoint: unknown,
): Promise<void> {
  const serialized = JSON.stringify(checkpoint);
  if (serialized === undefined) {
    throw new ROOT_ERROR('阶段恢复信息无法序列化');
  }
  await context.task.throwIfCanceled();
  await db.transaction(async (transaction) => {
    const [saved] = await transaction
      .update(schemas.file_processing_task_stage_runs)
      .set({ checkpoint: serialized })
      .where(
        and(
          eq(
            schemas.file_processing_task_stage_runs.stage_run_id,
            stageRunId,
          ),
          eq(schemas.file_processing_task_stage_runs.status, 'running'),
        ),
      )
      .returning({
        stageRunId: schemas.file_processing_task_stage_runs.stage_run_id,
      });
    if (!saved) throw new TaskCanceledError();
  });
}

/**
 * 终结失败或被中断的阶段并写入安全日志。
 *
 * @param context 当前文件处理任务上下文。
 * @param stageRunId 当前活动阶段记录标识。
 * @param stage 当前业务阶段。
 * @param error 阶段抛出的未知异常。
 * @returns 阶段终态和错误日志写入完成后结束。
 */
async function failStage(
  context: FileProcessingTaskContext,
  stageRunId: string,
  stage: FileProcessingStage,
  error: unknown,
): Promise<void> {
  const message = readErrorMessage(error);
  let status: 'failed' | 'interrupted' = 'failed';
  if (error instanceof TaskCanceledError) status = 'interrupted';
  await db
    .update(schemas.file_processing_task_stage_runs)
    .set({
      status,
      error_code: readErrorCode(error),
      error_message: message,
      end_timestamp: new Date(),
    })
    .where(
      and(
        eq(
          schemas.file_processing_task_stage_runs.stage_run_id,
          stageRunId,
        ),
        eq(schemas.file_processing_task_stage_runs.status, 'running'),
      ),
    );
  await context.task.log.error(`阶段失败：${stage}，${message}`);
}

/**
 * 解析数据库保存的阶段 checkpoint。
 *
 * @param value JSON 字符串或空值。
 * @returns 没有历史时返回 undefined，否则返回解析结果。
 */
function parseCheckpoint(value: string | null | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ROOT_ERROR('阶段恢复信息不是有效 JSON');
  }
}

/**
 * 估算阶段结果包含的处理数量。
 *
 * @param value 阶段返回值。
 * @returns 数组、segments、blocks 数量或 1。
 */
function getProcessedItems(value: unknown): number {
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

/**
 * 读取阶段错误稳定码。
 *
 * @param error 阶段抛出的未知异常。
 * @returns ROOT_ERROR code、取消码或通用文件处理码。
 */
function readErrorCode(error: unknown): string {
  if (error instanceof ROOT_ERROR) return error.code;
  if (error instanceof TaskCanceledError) return 'TASK_EXECUTION_STOPPED';
  return 'FILE_PROCESSING_FAILED';
}

/**
 * 读取阶段安全错误摘要。
 *
 * @param error 阶段抛出的未知异常。
 * @returns 最多 500 字符的安全消息。
 */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }
  return '阶段执行失败';
}
