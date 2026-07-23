import { randomUUID } from 'node:crypto';
import { and, eq, inArray, max, sql } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { resolveDocumentVersion } from '../document/read.js';
import { FILE_PROCESSING_TASK_KEY } from '../tasks/definition.js';
import {
  DOCUMENT_PREVIEW_CONVERTER_VERSION,
  documentPageConverter,
} from './converter.js';

import type { FileProcessingTriggerSource } from '@repo/types';

/** 文件任务处于等待或执行中时视为活动任务。 */
const ACTIVE_TASK_STATUSES = ['to-be-started', 'pending'] as const;

/** 创建文档预览任务的输入。 */
export interface CreateDocumentPreviewTaskInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 可选历史版本；为空时使用当前版本。 */
  documentVersionId?: string;
  /** 上传自动触发或用户手动重试。 */
  triggerSource?: FileProcessingTriggerSource;
}

/**
 * 创建或返回同版本、同转换器的唯一活动预览任务。
 *
 * @param input 文档、可选版本及触发来源。
 * @param userId 当前操作用户，用于数据范围和审计。
 * @returns 新任务或活动任务标识；同版本页面已就绪时返回空。
 */
export async function createDocumentPreviewTask(
  input: CreateDocumentPreviewTaskInput,
  userId: string,
): Promise<string | null> {
  const resolved = await resolveDocumentVersion(
    input.documentId,
    input.documentVersionId,
    userId,
  );
  const contentType =
    resolved.file.content_type ?? resolved.file.declared_content_type;
  if (!documentPageConverter.supports(contentType)) {
    throw new ROOT_ERROR(
      '数据异常',
      'DOCUMENT_PREVIEW_TYPE_UNSUPPORTED: 当前文件类型不支持页面预览',
    );
  }
  const documentVersionId = resolved.version.document_version_id;
  const lockKey = [
    'preview',
    documentVersionId,
    DOCUMENT_PREVIEW_CONVERTER_VERSION,
  ].join(':');
  const taskId = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [version] = await tx
      .select({
        status: schema.document_versions.preview_status,
        converterVersion:
          schema.document_versions.preview_converter_version,
      })
      .from(schema.document_versions)
      .where(
        eq(
          schema.document_versions.document_version_id,
          documentVersionId,
        ),
      )
      .limit(1);
    if (
      version?.status === 'ready' &&
      version.converterVersion === DOCUMENT_PREVIEW_CONVERTER_VERSION
    ) {
      return null;
    }
    const [active] = await tx
      .select({ taskId: schema.tasks.task_id })
      .from(schema.file_processing_tasks)
      .innerJoin(
        schema.tasks,
        eq(schema.tasks.task_id, schema.file_processing_tasks.task_id),
      )
      .where(
        and(
          eq(schema.file_processing_tasks.task_type, 'preview'),
          eq(
            schema.file_processing_tasks.document_version_id,
            documentVersionId,
          ),
          eq(
            schema.file_processing_tasks.processing_config_version,
            DOCUMENT_PREVIEW_CONVERTER_VERSION,
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
          documentVersionId,
        ),
      );
    const executionNo = (lastExecution?.value ?? 0) + 1;
    const nextTaskId = randomUUID();
    const now = new Date();
    const triggerSource = input.triggerSource ?? 'manual';
    await tx
      .update(schema.document_versions)
      .set({
        preview_status: 'pending',
        preview_page_count: 0,
        preview_error: null,
        preview_converter_version: null,
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .where(
        eq(
          schema.document_versions.document_version_id,
          documentVersionId,
        ),
      );
    await tx.insert(schema.tasks).values({
      task_id: nextTaskId,
      task_key: FILE_PROCESSING_TASK_KEY,
      task_name: `${resolved.file.filename} / 页面预览`,
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
    await tx.insert(schema.file_processing_tasks).values({
      task_id: nextTaskId,
      file_id: resolved.file.file_id,
      document_id: input.documentId,
      document_version_id: documentVersionId,
      task_type: 'preview',
      dataset_id: null,
      execution_no: executionNo,
      trigger_source: triggerSource,
      processing_config_version: DOCUMENT_PREVIEW_CONVERTER_VERSION,
      result_summary: null,
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    });
    return nextTaskId;
  });

  if (taskId) {
    const { notifyFileProcessingWorker } = await import('../tasks/worker.js');
    notifyFileProcessingWorker();
  }
  return taskId;
}
