import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { getReadableFile } from '../files/index.js';
import { ensureDocumentForFile } from '@/hooks/documents/index.js';
import { getRagDataset } from '../knowledge/index.js';
import {
  DEFAULT_FILE_PROCESSING_CONFIG_VERSION,
  FILE_PROCESSING_TASK_KEY,
} from './definition.js';
import { notifyFileProcessingWorker } from './runner.js';

import type {
  FileProcessingTaskDetail,
  FileProcessingTaskInfo,
} from '@repo/types';
import type { CreateFileProcessingTaskInput } from './types.js';

/** 文件任务处于等待或执行中时视为活动任务。 */
const ACTIVE_TASK_STATUSES = ['to-be-started', 'pending'] as const;

/** 创建或返回等价的活动文件处理任务。 */
export async function createFileProcessingTask(
  input: CreateFileProcessingTaskInput,
  userId: string,
): Promise<FileProcessingTaskInfo> {
  if (!ROOT.fileProcessing.enabled) {
    throw new ROOT_ERROR(
      '服务异常',
      'FILE_PROCESSING_DISABLED: 新文件处理流程当前已关闭',
    );
  }
  const file = await getReadableFile(input.fileId);
  const dataset = await getRagDataset(input.datasetId);
  if (dataset.status !== 'active') {
    throw new ROOT_ERROR(
      '数据异常',
      'FILE_PROCESSING_DATASET_DISABLED: 目标知识库已停用',
    );
  }
  const processingConfigVersion =
    input.processingConfigVersion ?? DEFAULT_FILE_PROCESSING_CONFIG_VERSION;
  const document = await ensureDocumentForFile(
    { fileId: input.fileId, name: file.filename },
    userId,
  );
  const lockKey = [
    input.fileId,
    input.datasetId,
    processingConfigVersion,
  ].join(':');

  const taskId = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`,
    );
    const [active] = await tx
      .select({ taskId: schema.tasks.task_id })
      .from(schema.file_processing_tasks)
      .innerJoin(
        schema.tasks,
        eq(schema.tasks.task_id, schema.file_processing_tasks.task_id),
      )
      .where(
        and(
          eq(schema.file_processing_tasks.file_id, input.fileId),
          eq(schema.file_processing_tasks.dataset_id, input.datasetId),
          eq(
            schema.file_processing_tasks.processing_config_version,
            processingConfigVersion,
          ),
          inArray(schema.tasks.status, [...ACTIVE_TASK_STATUSES]),
        ),
      )
      .limit(1);
    if (active) return active.taskId;

    const [lastExecution] = await tx
      .select({ value: max(schema.file_processing_tasks.execution_no) })
      .from(schema.file_processing_tasks)
      .where(eq(schema.file_processing_tasks.file_id, input.fileId));
    const executionNo = (lastExecution?.value ?? 0) + 1;
    const nextTaskId = randomUUID();
    const now = new Date();
    const triggerSource = input.triggerSource ?? 'manual';
    await tx.insert(schema.tasks).values({
      task_id: nextTaskId,
      task_key: FILE_PROCESSING_TASK_KEY,
      task_name: `${file.filename} / 第 ${executionNo} 次处理`,
      search_key: `${file.filename} ${dataset.name}`,
      pending_uuid: lockKey,
      task_category: 'file-processing',
      business_type: 'file',
      business_id: input.fileId,
      current_stage: 'queued',
      progress: 0,
      processed_items: 0,
      total_items: 0,
      error_code: null,
      error_message: null,
      args: null,
      status: 'to-be-started',
      execution_user_id: userId,
      trigger_method: triggerSource === 'upload' ? 'auto' : 'manual',
      create_timestamp: now,
      start_timestamp: null,
      end_timestamp: null,
      logs: null,
      last_update_timestamp: now,
    });
    await tx.insert(schema.file_processing_tasks).values({
      task_id: nextTaskId,
      file_id: input.fileId,
      document_id: document.document.documentId,
      document_version_id: document.documentVersionId,
      dataset_id: input.datasetId,
      execution_no: executionNo,
      trigger_source: triggerSource,
      processing_config_version: processingConfigVersion,
      result_summary: null,
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    });
    return nextTaskId;
  });

  notifyFileProcessingWorker();
  return await getFileProcessingTask(taskId);
}

/** 查询文件处理任务详情及阶段时间线。 */
export async function getFileProcessingTask(
  taskId: string,
): Promise<FileProcessingTaskDetail> {
  const [row] = await selectTaskRows(
    and(eq(schema.tasks.task_id, taskId)),
  ).limit(1);
  if (!row) {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'FILE_PROCESSING_TASK_NOT_FOUND: 文件处理任务不存在',
    );
  }
  const stageRuns = await db
    .select()
    .from(schema.file_processing_task_stage_runs)
    .where(eq(schema.file_processing_task_stage_runs.task_id, taskId))
    .orderBy(
      schema.file_processing_task_stage_runs.start_timestamp,
      schema.file_processing_task_stage_runs.attempt,
    );
  return {
    ...toTaskInfo(row),
    processingConfigVersion: row.fileTask.processing_config_version,
    resultSummary: row.fileTask.result_summary
      ? (JSON.parse(row.fileTask.result_summary) as Record<string, unknown>)
      : null,
    stageRuns: stageRuns.map((stage) => ({
      stage: stage.stage,
      attempt: stage.attempt,
      status: stage.status as FileProcessingTaskInfo['status'],
      processedItems: stage.processed_items,
      totalItems: stage.total_items,
      errorCode: stage.error_code,
      errorMessage: stage.error_message,
      startedAt: stage.start_timestamp,
      endedAt: stage.end_timestamp,
    })),
  };
}

/** 查询任务、文件、知识库和文件任务扩展的联合行。 */
function selectTaskRows(where: ReturnType<typeof and>) {
  return db
    .select({
      task: schema.tasks,
      fileTask: schema.file_processing_tasks,
      file: schema.files,
      dataset: schema.rag_datasets,
    })
    .from(schema.file_processing_tasks)
    .innerJoin(
      schema.tasks,
      eq(schema.tasks.task_id, schema.file_processing_tasks.task_id),
    )
    .innerJoin(
      schema.files,
      eq(schema.files.file_id, schema.file_processing_tasks.file_id),
    )
    .leftJoin(
      schema.rag_datasets,
      eq(schema.rag_datasets.dataset_id, schema.file_processing_tasks.dataset_id),
    )
    .where(where)
    .orderBy(desc(schema.tasks.create_timestamp));
}

/** 将数据库联合行转换为任务中心公共摘要。 */
function toTaskInfo(row: Awaited<ReturnType<typeof selectTaskRows>>[number]): FileProcessingTaskInfo {
  return {
    taskId: row.task.task_id,
    fileId: row.fileTask.file_id,
    filename: row.file.filename,
    datasetId: row.fileTask.dataset_id,
    datasetName: row.dataset?.name ?? null,
    executionNo: row.fileTask.execution_no,
    triggerSource: row.fileTask.trigger_source,
    status: row.task.status as FileProcessingTaskInfo['status'],
    stage: (row.task.current_stage ?? 'queued') as FileProcessingTaskInfo['stage'],
    progress: row.task.progress,
    processedItems: row.task.processed_items,
    totalItems: row.task.total_items,
    errorCode: row.task.error_code,
    errorMessage: row.task.error_message,
    retryable: ['failed', 'completed'].includes(row.task.status),
    createdAt: row.task.create_timestamp,
    startedAt: row.task.start_timestamp,
    endedAt: row.task.end_timestamp,
  };
}
