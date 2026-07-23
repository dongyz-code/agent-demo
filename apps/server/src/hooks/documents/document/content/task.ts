import { randomUUID } from 'node:crypto';
import { and, eq, inArray, max, sql } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { getFileProcessingTask } from '../../tasks/detail.js';
import { FILE_PROCESSING_TASK_KEY } from '../../tasks/definition.js';
import { notifyFileProcessingWorker } from '../../tasks/worker.js';
import {
  prepareDocumentRagRelationsForReprocessing,
  publishDocumentRagRelations,
} from '../../rag/relations.js';
import { resolveDocumentVersion } from '../read.js';
import { DEFAULT_DOCUMENT_CONTENT_CONFIG_VERSION } from './definition.js';

import type {
  FileProcessingTaskInfo,
  FileProcessingTriggerSource,
} from '@repo/types';

/** 创建文档版本内容任务的输入。 */
export interface CreateDocumentContentTaskInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 可选历史版本；为空时使用当前版本。 */
  documentVersionId?: string;
  /** 解析、标准化和 Segment 的组合配置版本。 */
  processingConfigVersion?: string;
  /** 任务创建来源。 */
  triggerSource?: FileProcessingTriggerSource;
}

/** 内容任务处于等待或执行中时视为活动任务。 */
const ACTIVE_TASK_STATUSES = ['to-be-started', 'pending'] as const;

/**
 * 以 DocumentVersion 和处理配置为幂等边界创建或复用内容任务。
 *
 * 任务不绑定单个知识库；同一版本关联多个知识库时只解析和切分一次。已有成功
 * 结果时不再创建任务，而是直接发布所有仍以该版本为 pending 的知识库关系。
 *
 * @param input 文档、版本、处理配置和触发来源。
 * @param userId 当前操作用户，用于数据范围和审计。
 * @returns 新建、复用或已有成功的任务摘要。
 */
export async function createDocumentContentTask(
  input: CreateDocumentContentTaskInput,
  userId: string,
): Promise<FileProcessingTaskInfo> {
  if (!ROOT.fileProcessing.enabled) {
    throw new ROOT_ERROR('服务异常');
  }
  const resolved = await resolveDocumentVersion(
    input.documentId,
    input.documentVersionId,
    userId,
  );
  const documentVersionId = resolved.version.document_version_id;
  const processingConfigVersion =
    input.processingConfigVersion ?? DEFAULT_DOCUMENT_CONTENT_CONFIG_VERSION;
  const triggerSource = input.triggerSource ?? 'manual';
  const forceNewTask = triggerSource === 'retry' || triggerSource === 'rerun';
  if (forceNewTask) {
    await prepareDocumentRagRelationsForReprocessing({
      documentId: input.documentId,
      documentVersionId,
      userId,
    });
  }
  const lockKey = [
    'document-content',
    documentVersionId,
    processingConfigVersion,
  ].join(':');

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [active] = await tx
      .select({
        taskId: schemas.tasks.task_id,
        stage: schemas.tasks.current_stage,
      })
      .from(schemas.file_processing_tasks)
      .innerJoin(
        schemas.tasks,
        eq(schemas.tasks.task_id, schemas.file_processing_tasks.task_id),
      )
      .where(
        and(
          eq(schemas.file_processing_tasks.task_type, 'content'),
          eq(
            schemas.file_processing_tasks.document_version_id,
            documentVersionId,
          ),
          eq(
            schemas.file_processing_tasks.processing_config_version,
            processingConfigVersion,
          ),
          inArray(schemas.tasks.status, [...ACTIVE_TASK_STATUSES]),
        ),
      )
      .limit(1);
    if (active) {
      return {
        taskId: active.taskId,
        created: false,
        contentReady: active.stage === 'content-publishing',
      };
    }

    if (!forceNewTask) {
      const [completed] = await tx
        .select({ taskId: schemas.tasks.task_id })
        .from(schemas.file_processing_tasks)
        .innerJoin(
          schemas.tasks,
          eq(schemas.tasks.task_id, schemas.file_processing_tasks.task_id),
        )
        .where(
          and(
            eq(schemas.file_processing_tasks.task_type, 'content'),
            eq(
              schemas.file_processing_tasks.document_version_id,
              documentVersionId,
            ),
            eq(
              schemas.file_processing_tasks.processing_config_version,
              processingConfigVersion,
            ),
            eq(schemas.tasks.status, 'completed'),
          ),
        )
        .limit(1);
      if (completed) {
        return {
          taskId: completed.taskId,
          created: false,
          contentReady: true,
        };
      }
    }

    const [lastExecution] = await tx
      .select({ value: max(schemas.file_processing_tasks.execution_no) })
      .from(schemas.file_processing_tasks)
      .where(
        eq(
          schemas.file_processing_tasks.document_version_id,
          documentVersionId,
        ),
      );
    const executionNo = (lastExecution?.value ?? 0) + 1;
    const taskId = randomUUID();
    const now = new Date();
    await tx.insert(schemas.tasks).values({
      task_id: taskId,
      task_key: FILE_PROCESSING_TASK_KEY,
      task_name: `${resolved.file.filename} / 内容处理 / 第 ${executionNo} 次`,
      search_key: `${resolved.document.name} ${resolved.file.filename}`,
      pending_uuid: lockKey,
      task_category: 'file-processing',
      business_type: 'document-version',
      business_id: documentVersionId,
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
    await tx.insert(schemas.file_processing_tasks).values({
      task_id: taskId,
      file_id: resolved.file.file_id,
      document_id: input.documentId,
      document_version_id: documentVersionId,
      task_type: 'content',
      execution_no: executionNo,
      trigger_source: triggerSource,
      processing_config_version: processingConfigVersion,
      result_summary: null,
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    });
    return { taskId, created: true, contentReady: false };
  });

  if (result.contentReady) {
    await publishDocumentRagRelations({
      documentId: input.documentId,
      documentVersionId,
      userId,
    });
  }
  if (result.created) {
    notifyFileProcessingWorker();
  }
  return await getFileProcessingTask(result.taskId);
}
