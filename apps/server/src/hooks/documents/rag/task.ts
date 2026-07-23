import { randomUUID } from 'node:crypto';
import { and, eq, inArray, max, sql } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { resolveDocumentVersion } from '../document/read.js';
import { getFileProcessingTask } from '../tasks/detail.js';
import { FILE_PROCESSING_TASK_KEY } from '../tasks/definition.js';
import { notifyFileProcessingWorker } from '../tasks/worker.js';
import { DEFAULT_FILE_PROCESSING_CONFIG_VERSION } from './config.js';
import {
  ensureDocumentDatasetRelation,
  prepareExistingRagRelationRetry,
} from '../rag/relations.js';
import type {
  FileProcessingTaskInfo,
  FileProcessingTriggerSource,
} from '@repo/types';

/** 创建文档版本 RAG 任务的输入。 */
export interface CreateDocumentRagTaskInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 可选历史版本；为空时使用当前版本。 */
  documentVersionId?: string;
  /** RAG 接入目标知识库。 */
  datasetId: string;
  /** 处理配置组合版本。 */
  processingConfigVersion?: string;
  /** 任务创建来源。 */
  triggerSource?: FileProcessingTriggerSource;
}

/** 文件任务处于等待或执行中时视为活动任务。 */
const ACTIVE_TASK_STATUSES = ['to-be-started', 'pending'] as const;

/**
 * 以 DocumentVersion 为幂等边界创建或返回活动 RAG 任务。
 *
 * @param input 文档、版本、知识库和处理配置。
 * @param userId 当前操作用户，用于数据范围和审计。
 * @returns 创建或复用的任务摘要。
 */
export async function createDocumentRagTask(
  input: CreateDocumentRagTaskInput,
  userId: string,
): Promise<FileProcessingTaskInfo> {
  if (!ROOT.fileProcessing.enabled) {
    throw new ROOT_ERROR(
      '服务异常',
      'FILE_PROCESSING_DISABLED: 新文件处理流程当前已关闭',
    );
  }
  const resolved = await resolveDocumentVersion(
    input.documentId,
    input.documentVersionId,
    userId,
  );
  const file = resolved.file;
  const [dataset] = await db
    .select({
      name: schema.rag_datasets.name,
      status: schema.rag_datasets.status,
    })
    .from(schema.rag_datasets)
    .where(eq(schema.rag_datasets.dataset_id, input.datasetId))
    .limit(1);
  if (!dataset) {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'RAG_DATASET_NOT_FOUND: 知识库不存在',
    );
  }
  if (dataset.status !== 'active') {
    throw new ROOT_ERROR(
      '数据异常',
      'FILE_PROCESSING_DATASET_DISABLED: 目标知识库已停用',
    );
  }
  const processingConfigVersion =
    input.processingConfigVersion ?? DEFAULT_FILE_PROCESSING_CONFIG_VERSION;
  const triggerSource = input.triggerSource ?? 'manual';
  if (triggerSource === 'retry' || triggerSource === 'rerun') {
    await prepareExistingRagRelationRetry(
      input.datasetId,
      input.documentId,
      resolved.version.document_version_id,
      userId,
    );
  } else {
    await ensureDocumentDatasetRelation(
      input.datasetId,
      input.documentId,
      resolved.version.document_version_id,
      userId,
    );
  }
  const lockKey = [
    'rag',
    resolved.version.document_version_id,
    input.datasetId,
    processingConfigVersion,
  ].join(':');

  const taskId = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [active] = await tx
      .select({ taskId: schema.tasks.task_id })
      .from(schema.file_processing_tasks)
      .innerJoin(
        schema.tasks,
        eq(schema.tasks.task_id, schema.file_processing_tasks.task_id),
      )
      .where(
        and(
          eq(schema.file_processing_tasks.task_type, 'rag'),
          eq(
            schema.file_processing_tasks.document_version_id,
            resolved.version.document_version_id,
          ),
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
      .where(
        eq(
          schema.file_processing_tasks.document_version_id,
          resolved.version.document_version_id,
        ),
      );
    const executionNo = (lastExecution?.value ?? 0) + 1;
    const nextTaskId = randomUUID();
    const now = new Date();
    await tx.insert(schema.tasks).values({
      task_id: nextTaskId,
      task_key: FILE_PROCESSING_TASK_KEY,
      task_name: `${file.filename} / 第 ${executionNo} 次处理`,
      search_key: `${file.filename} ${dataset.name}`,
      pending_uuid: lockKey,
      task_category: 'file-processing',
      business_type: 'document-version',
      business_id: resolved.version.document_version_id,
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
      file_id: file.file_id,
      document_id: input.documentId,
      document_version_id: resolved.version.document_version_id,
      task_type: 'rag',
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
