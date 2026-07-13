import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, lt } from 'drizzle-orm';

import { getFileProcessingRuntimeConfig, logger } from '@/configs/index.js';
import { countRows, db, schema } from '@/database/index.js';
import { getErrorCode, stableParsedBlockId } from '../task-runtime/index.js';
import { createDomainError } from '../errors.js';
import {
  createDocumentSegments,
  getDefaultSegmentProfile,
  getDocumentParser,
  normalizeDocumentBlocks,
  NORMALIZER_VERSION,
} from '../content/index.js';
import { getReadableFile } from '../files/index.js';
import { addDocumentToDataset } from '../knowledge/index.js';
import {
  FILE_PROCESSING_STAGE_PROGRESS,
  FILE_PROCESSING_TASK_KEY,
} from './definition.js';

import type {
  DocumentParsedBlock,
  DocumentSegment,
  FileProcessingStage,
} from '@repo/types';
import type { FileProcessingTaskContext } from './types.js';

/** 当前进程正在执行的文件任务，防止同一实例重复领取。 */
const activeTaskIds = new Set<string>();
let workerTimer: ReturnType<typeof setInterval> | undefined;
let draining = false;

/** 启动持久化文件任务 worker，并恢复失去心跳的历史任务。 */
export async function startFileProcessingWorker() {
  if (workerTimer) return;
  const config = getFileProcessingRuntimeConfig();
  if (!config.enabled) return;
  await recoverStaleFileProcessingTasks();
  workerTimer = setInterval(notifyFileProcessingWorker, 2_000);
  workerTimer.unref();
  notifyFileProcessingWorker();
}

/** 将失去心跳的执行中任务重置为可重新领取状态。 */
export async function recoverStaleFileProcessingTasks() {
  const config = getFileProcessingRuntimeConfig();
  const staleBefore = new Date(Date.now() - config.staleTaskSeconds * 1000);
  await db
    .update(schema.tasks)
    .set({
      status: 'to-be-started',
      current_stage: 'queued',
      error_code: null,
      error_message: null,
      end_timestamp: null,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.tasks.task_key, FILE_PROCESSING_TASK_KEY),
        eq(schema.tasks.status, 'pending'),
        lt(schema.tasks.last_update_timestamp, staleBefore),
      ),
    );
}

/** 通知 worker 尽快领取等待任务。 */
export function notifyFileProcessingWorker() {
  queueMicrotask(() => {
    drainFileProcessingTasks().catch((error) => {
      logger.error(
        { event: 'file.processing.worker_drain_failed', err: error },
        '文件处理任务领取失败',
      );
    });
  });
}

/** 执行单个文件处理任务。 */
export async function runFileProcessingTask(taskId: string) {
  if (activeTaskIds.has(taskId)) return;
  activeTaskIds.add(taskId);
  try {
    const context = await claimTask(taskId);
    if (!context) return;
    await executeTask(context);
  } finally {
    activeTaskIds.delete(taskId);
    notifyFileProcessingWorker();
  }
}

/** 在并发上限内领取等待任务。 */
async function drainFileProcessingTasks() {
  if (draining) return;
  draining = true;
  try {
    const available =
      getFileProcessingRuntimeConfig().workerConcurrency - activeTaskIds.size;
    if (available <= 0) return;
    const tasks = await db
      .select({ taskId: schema.tasks.task_id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.task_key, FILE_PROCESSING_TASK_KEY),
          eq(schema.tasks.status, 'to-be-started'),
        ),
      )
      .orderBy(asc(schema.tasks.create_timestamp))
      .limit(available);
    for (const task of tasks) {
      void runFileProcessingTask(task.taskId).catch((error) => {
        logger.error(
          {
            event: 'file.processing.unhandled',
            taskId: task.taskId,
            err: error,
          },
          '文件处理任务执行失败',
        );
      });
    }
  } finally {
    draining = false;
  }
}

/** 条件领取任务并构造完整执行上下文。 */
async function claimTask(
  taskId: string,
): Promise<FileProcessingTaskContext | undefined> {
  const now = new Date();
  const [claimed] = await db
    .update(schema.tasks)
    .set({
      status: 'pending',
      current_stage: 'reading',
      progress: FILE_PROCESSING_STAGE_PROGRESS.reading,
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
    .returning({ taskId: schema.tasks.task_id });
  if (!claimed) return;

  const [row] = await db
    .select({
      task: schema.tasks,
      fileTask: schema.file_processing_tasks,
    })
    .from(schema.tasks)
    .innerJoin(
      schema.file_processing_tasks,
      eq(schema.file_processing_tasks.task_id, schema.tasks.task_id),
    )
    .where(eq(schema.tasks.task_id, taskId))
    .limit(1);
  if (
    !row ||
    !row.task.tenant_id ||
    !row.fileTask.document_id ||
    !row.fileTask.document_version_id ||
    !row.fileTask.dataset_id
  ) {
    await failTask(
      taskId,
      'FILE_PROCESSING_CONTEXT_INVALID',
      '文件处理任务上下文不完整',
    );
    return;
  }
  return {
    taskId,
    fileId: row.fileTask.file_id,
    documentId: row.fileTask.document_id,
    documentVersionId: row.fileTask.document_version_id,
    datasetId: row.fileTask.dataset_id,
    actor: {
      tenantId: row.task.tenant_id,
      userId: row.fileTask.create_user_id,
    },
  };
}

/** 执行文件处理各阶段并提交最终结果。 */
async function executeTask(context: FileProcessingTaskContext) {
  try {
    const file = await runTaskStage(context.taskId, 'reading', async () =>
      getReadableFile(context.fileId, context.actor.tenantId),
    );
    const parser = getDocumentParser(file.contentType);
    const parsed = await runTaskStage(context.taskId, 'parsing', async () =>
      parser.parse({ file }),
    );
    const normalized = await runTaskStage(
      context.taskId,
      'normalizing',
      () => normalizeDocumentBlocks(parsed),
    );
    const profile = getDefaultSegmentProfile();
    const segments = await runTaskStage(
      context.taskId,
      'segmenting',
      () =>
        createDocumentSegments({
          documentVersionId: context.documentVersionId,
          blocks: normalized,
          profile,
        }),
    );
    await persistContentResult(context, {
      blocks: normalized,
      segments,
      parserVersion: parser.version,
      normalizerVersion: NORMALIZER_VERSION,
      segmentProfileVersion: profile.version,
    });
    await runTaskStage(context.taskId, 'rag-ingestion', async () =>
      addDocumentToDataset(context.datasetId, context.documentId, context.actor),
    );
    await completeTask(context, segments.length, {
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      datasetId: context.datasetId,
      segmentCount: segments.length,
      capability: 'rag-ingestion',
    });
  } catch (error) {
    if (await isTaskCanceled(context.taskId)) return;
    const message = error instanceof Error ? error.message : '文件处理失败';
    await failTask(context.taskId, getErrorCode(message, 'FILE_PROCESSING_FAILED'), message);
    await db.transaction(async (tx) => {
      await tx
        .update(schema.document_versions)
        .set({
          status: 'failed',
          last_update_user_id: context.actor.userId,
          last_update_timestamp: new Date(),
        })
        .where(
          and(
            eq(
              schema.document_versions.document_version_id,
              context.documentVersionId,
            ),
            inArray(schema.document_versions.status, ['queued', 'processing']),
          ),
        );
      await tx
        .update(schema.documents)
        .set({
          status: 'failed',
          last_update_user_id: context.actor.userId,
          last_update_timestamp: new Date(),
        })
        .where(
          and(
            eq(schema.documents.document_id, context.documentId),
            inArray(schema.documents.status, ['queued', 'processing']),
          ),
        );
    });
    throw error;
  }
}

/** 执行阶段并记录进度、尝试次数和错误。 */
async function runTaskStage<T>(
  taskId: string,
  stage: FileProcessingStage,
  action: () => Promise<T> | T,
) {
  await assertTaskNotCanceled(taskId);
  const attempt =
    (await countRows(
      schema.file_processing_task_stage_runs,
      and(
        eq(schema.file_processing_task_stage_runs.task_id, taskId),
        eq(schema.file_processing_task_stage_runs.stage, stage),
      ),
    )) + 1;
  const stageRunId = randomUUID();
  const start = new Date();
  await db.insert(schema.file_processing_task_stage_runs).values({
    stage_run_id: stageRunId,
    task_id: taskId,
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
  await db
    .update(schema.tasks)
    .set({
      current_stage: stage,
      progress: FILE_PROCESSING_STAGE_PROGRESS[stage],
      last_update_timestamp: start,
    })
    .where(eq(schema.tasks.task_id, taskId));
  try {
    const result = await action();
    const processedItems = getProcessedItems(result);
    await db.transaction(async (tx) => {
      await tx
        .update(schema.file_processing_task_stage_runs)
        .set({
          status: 'completed',
          processed_items: processedItems,
          total_items: processedItems,
          checkpoint: JSON.stringify({ processedItems }),
          end_timestamp: new Date(),
        })
        .where(
          eq(
            schema.file_processing_task_stage_runs.stage_run_id,
            stageRunId,
          ),
        );
      await tx
        .update(schema.tasks)
        .set({
          processed_items: processedItems,
          total_items: processedItems,
          last_update_timestamp: new Date(),
        })
        .where(eq(schema.tasks.task_id, taskId));
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '阶段执行失败';
    await db
      .update(schema.file_processing_task_stage_runs)
      .set({
        status: (await isTaskCanceled(taskId)) ? 'killed' : 'failed',
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

/** 幂等保存解析块、Segment 和文档 ready 状态。 */
async function persistContentResult(
  context: FileProcessingTaskContext,
  result: {
    blocks: DocumentParsedBlock[];
    segments: DocumentSegment[];
    parserVersion: string;
    normalizerVersion: string;
    segmentProfileVersion: string;
  },
) {
  await assertTaskNotCanceled(context.taskId);
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.document_parsed_blocks)
      .where(
        eq(
          schema.document_parsed_blocks.document_version_id,
          context.documentVersionId,
        ),
      );
    if (result.blocks.length) {
      await tx.insert(schema.document_parsed_blocks).values(
        result.blocks.map((block) => ({
          block_id: stableParsedBlockId(
            context.documentVersionId,
            result.parserVersion,
            block,
          ),
          document_version_id: context.documentVersionId,
          type: block.type,
          content: block.text,
          heading_path: JSON.stringify(block.headingPath),
          page: block.page,
          position: block.position,
          metadata: JSON.stringify(block.metadata),
          parser_version: result.parserVersion,
        })),
      );
    }
    await tx
      .delete(schema.document_segments)
      .where(
        eq(
          schema.document_segments.document_version_id,
          context.documentVersionId,
        ),
      );
    if (result.segments.length) {
      await tx.insert(schema.document_segments).values(
        result.segments.map((segment) => ({
          segment_id: segment.segmentId,
          document_version_id: context.documentVersionId,
          parent_segment_id: segment.parentSegmentId,
          content: segment.content,
          embedding_content: segment.embeddingContent,
          content_hash: segment.contentHash,
          heading_path: JSON.stringify(segment.headingPath),
          page: segment.page,
          position: segment.position,
          token_count: segment.tokenCount,
          segment_profile_version: result.segmentProfileVersion,
        })),
      );
    }
    const now = new Date();
    await tx
      .update(schema.document_versions)
      .set({
        status: 'ready',
        parser_version: result.parserVersion,
        normalizer_version: result.normalizerVersion,
        segment_profile_version: result.segmentProfileVersion,
        last_update_user_id: context.actor.userId,
        last_update_timestamp: now,
      })
      .where(
        eq(
          schema.document_versions.document_version_id,
          context.documentVersionId,
        ),
      );
    await tx
      .update(schema.documents)
      .set({
        status: 'ready',
        last_update_user_id: context.actor.userId,
        last_update_timestamp: now,
      })
      .where(eq(schema.documents.document_id, context.documentId));
  });
}

/** 将任务标记为成功并写入安全结果摘要。 */
async function completeTask(
  context: FileProcessingTaskContext,
  segmentCount: number,
  resultSummary: Record<string, unknown>,
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
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
      .where(eq(schema.tasks.task_id, context.taskId));
    await tx
      .update(schema.file_processing_tasks)
      .set({
        result_summary: JSON.stringify(resultSummary),
        last_update_user_id: context.actor.userId,
        last_update_timestamp: now,
      })
      .where(eq(schema.file_processing_tasks.task_id, context.taskId));
  });
}

/** 将任务标记为失败并保留当前阶段。 */
async function failTask(taskId: string, errorCode: string, message: string) {
  await db
    .update(schema.tasks)
    .set({
      status: 'failed',
      error_code: errorCode,
      error_message: message,
      end_timestamp: new Date(),
      last_update_timestamp: new Date(),
    })
    .where(eq(schema.tasks.task_id, taskId));
}

/** 在阶段边界阻止已取消任务继续执行。 */
async function assertTaskNotCanceled(taskId: string) {
  if (await isTaskCanceled(taskId)) {
    throw createDomainError(
      'FILE_PROCESSING_TASK_CANCELED',
      '文件处理任务已取消',
      'conflict',
    );
  }
}

/** 查询任务是否已被取消。 */
async function isTaskCanceled(taskId: string) {
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
