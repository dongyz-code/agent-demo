import { and, eq, inArray } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import { getErrorCode } from '../tasks/errors.js';
import {
  failTask,
  FileProcessingLeaseLostError,
  isTaskCanceled,
} from '../tasks/runtime.js';
import { deleteStoredObject } from '../storage/objects.js';

import type { FileProcessingTaskLease } from '../tasks/runtime.js';

/** 需要由文档清理任务删除的私有对象位置。 */
interface DocumentCleanupStoredObject {
  /** 对象所在 Bucket。 */
  bucket: string;
  /** 对象私有路径。 */
  objectKey: string;
}

/** 文档清理 worker 所需的最小任务上下文。 */
interface DocumentCleanupTaskContext {
  /** 通用任务标识。 */
  taskId: string;
  /** 被逻辑删除的文档标识。 */
  documentId: string;
  /** 发起删除的审计用户。 */
  userId: string;
}

/**
 * 顺序删除去重后的文档对象，并在每次远程动作前后校验 lease。
 *
 * @param objects 页面和源文件对象位置。
 * @param lease 当前清理任务租约，失效后立即停止后续删除。
 * @returns 所有对象均已删除时结束。
 */
async function deleteDocumentStoredObjects(
  objects: DocumentCleanupStoredObject[],
  lease: FileProcessingTaskLease,
): Promise<void> {
  const uniqueObjects = new Map(
    objects.map((object) => [
      `${object.bucket}\u0000${object.objectKey}`,
      object,
    ]),
  );
  for (const object of uniqueObjects.values()) {
    await lease.assertActive();
    await deleteStoredObject({
      bucket: object.bucket,
      objectKey: object.objectKey,
    });
    await lease.assertActive();
  }
}

/**
 * 执行已逻辑删除文档的对象与数据库清理。
 *
 * 对象全部删除后才会进入数据库事务；任一步失败都会保留文档行，使同一任务可以安全重试。
 *
 * @param context cleanup task 的文档与审计上下文。
 * @param lease 当前 worker 租约，失效后禁止提交数据库删除。
 * @returns 清理成功、失败、取消或失去 lease 后结束。
 */
export async function runDocumentCleanupTask(
  context: DocumentCleanupTaskContext,
  lease: FileProcessingTaskLease,
): Promise<void> {
  try {
    await lease.assertActive();
    const objects = await loadDocumentCleanupObjects(context.documentId);
    await deleteDocumentStoredObjects(objects, lease);
    await deleteDocumentDatabaseRows(context, lease);
  } catch (error) {
    if (
      error instanceof FileProcessingLeaseLostError ||
      (await isTaskCanceled(context.taskId))
    ) {
      return;
    }
    const message = toSafeCleanupError(error);
    const failed = await failTask(
      context.taskId,
      lease.leaseId,
      getErrorCode(message, 'DOCUMENT_CLEANUP_FAILED'),
      message,
    );
    if (!failed) return;
    throw error;
  }
}

/**
 * 读取已删除文档当前仍有数据库记录的页面和源文件对象。
 *
 * @param documentId 被逻辑删除的文档标识。
 * @returns 页面与源文件的私有对象位置；文档已被物理删除时返回空数组。
 */
async function loadDocumentCleanupObjects(
  documentId: string,
): Promise<DocumentCleanupStoredObject[]> {
  const [document] = await db
    .select({ status: schema.documents.status })
    .from(schema.documents)
    .where(eq(schema.documents.document_id, documentId))
    .limit(1);
  if (!document) return [];
  if (document.status !== 'deleted') {
    throw new Error(
      'DOCUMENT_CLEANUP_NOT_DELETED: 只有已逻辑删除的文档可以清理',
    );
  }
  const versions = await db
    .select({
      id: schema.document_versions.document_version_id,
      fileId: schema.document_versions.source_file_id,
    })
    .from(schema.document_versions)
    .where(eq(schema.document_versions.document_id, documentId));
  if (!versions.length) return [];
  const versionIds = versions.map((version) => version.id);
  const fileIds = versions.map((version) => version.fileId);
  const [pages, files] = await Promise.all([
    db
      .select({
        bucket: schema.document_preview_pages.bucket,
        objectKey: schema.document_preview_pages.object_key,
      })
      .from(schema.document_preview_pages)
      .where(
        inArray(schema.document_preview_pages.document_version_id, versionIds),
      ),
    db
      .select({
        bucket: schema.files.bucket,
        objectKey: schema.files.object_key,
      })
      .from(schema.files)
      .where(inArray(schema.files.file_id, fileIds)),
  ]);
  return [...pages, ...files];
}

/**
 * 在一个事务内删除文档领域记录，并以同一 lease 完成 cleanup task。
 *
 * @param context cleanup task 的文档和审计上下文。
 * @param lease 当前 worker 租约，事务提交前必须仍然有效。
 * @returns 数据库记录删除和任务完成状态同时提交后结束。
 */
async function deleteDocumentDatabaseRows(
  context: DocumentCleanupTaskContext,
  lease: FileProcessingTaskLease,
): Promise<void> {
  await lease.assertActive();
  await db.transaction(async (tx) => {
    const now = new Date();
    const [owned] = await tx
      .update(schema.tasks)
      .set({
        current_stage: 'cleanup-database',
        progress: 80,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(schema.tasks.task_id, context.taskId),
          eq(schema.tasks.status, 'pending'),
          eq(schema.tasks.pending_uuid, lease.leaseId),
        ),
      )
      .returning({ id: schema.tasks.task_id });
    if (!owned) throw new FileProcessingLeaseLostError();

    const [document] = await tx
      .select({ status: schema.documents.status })
      .from(schema.documents)
      .where(eq(schema.documents.document_id, context.documentId))
      .limit(1);
    if (document && document.status !== 'deleted') {
      throw new Error(
        'DOCUMENT_CLEANUP_NOT_DELETED: 文档状态已恢复，拒绝物理清理',
      );
    }
    if (document) {
      const versions = await tx
        .select({
          id: schema.document_versions.document_version_id,
          fileId: schema.document_versions.source_file_id,
        })
        .from(schema.document_versions)
        .where(eq(schema.document_versions.document_id, context.documentId));
      const versionIds = versions.map((version) => version.id);
      const fileIds = versions.map((version) => version.fileId);
      const processingTasks = await tx
        .select({ id: schema.file_processing_tasks.task_id })
        .from(schema.file_processing_tasks)
        .where(
          eq(schema.file_processing_tasks.document_id, context.documentId),
        );
      const processingTaskIds = processingTasks.map((task) => task.id);
      if (processingTaskIds.length) {
        await tx
          .delete(schema.file_processing_task_stage_runs)
          .where(
            inArray(
              schema.file_processing_task_stage_runs.task_id,
              processingTaskIds,
            ),
          );
        await tx
          .delete(schema.file_processing_tasks)
          .where(
            inArray(schema.file_processing_tasks.task_id, processingTaskIds),
          );
        await tx
          .delete(schema.tasks)
          .where(inArray(schema.tasks.task_id, processingTaskIds));
      }
      await tx
        .delete(schema.rag_dataset_documents)
        .where(
          eq(schema.rag_dataset_documents.document_id, context.documentId),
        );
      if (versionIds.length) {
        await tx
          .delete(schema.document_segments)
          .where(
            inArray(schema.document_segments.document_version_id, versionIds),
          );
        await tx
          .delete(schema.document_preview_pages)
          .where(
            inArray(
              schema.document_preview_pages.document_version_id,
              versionIds,
            ),
          );
        await tx
          .delete(schema.document_versions)
          .where(
            inArray(schema.document_versions.document_version_id, versionIds),
          );
      }
      if (fileIds.length) {
        const sessions = await tx
          .select({ id: schema.file_upload_sessions.session_id })
          .from(schema.file_upload_sessions)
          .where(inArray(schema.file_upload_sessions.file_id, fileIds));
        const sessionIds = sessions.map((session) => session.id);
        if (sessionIds.length) {
          await tx
            .delete(schema.file_upload_parts)
            .where(inArray(schema.file_upload_parts.session_id, sessionIds));
          await tx
            .delete(schema.file_upload_sessions)
            .where(inArray(schema.file_upload_sessions.session_id, sessionIds));
        }
        await tx
          .delete(schema.files)
          .where(inArray(schema.files.file_id, fileIds));
      }
      await tx
        .delete(schema.documents)
        .where(eq(schema.documents.document_id, context.documentId));
    }
    const [completed] = await tx
      .update(schema.tasks)
      .set({
        status: 'completed',
        current_stage: 'completed',
        progress: 100,
        processed_items: 1,
        total_items: 1,
        error_code: null,
        error_message: null,
        end_timestamp: now,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(schema.tasks.task_id, context.taskId),
          eq(schema.tasks.status, 'pending'),
          eq(schema.tasks.pending_uuid, lease.leaseId),
        ),
      )
      .returning({ id: schema.tasks.task_id });
    if (!completed) throw new FileProcessingLeaseLostError();
  });
}

/**
 * 将内部清理异常限制为任务中心可安全展示的短摘要。
 *
 * @param error 未知内部错误。
 * @returns 最长 500 字符的安全错误摘要。
 */
function toSafeCleanupError(error: unknown): string {
  const message = error instanceof Error ? error.message : '文档清理失败';
  return message.slice(0, 500);
}
