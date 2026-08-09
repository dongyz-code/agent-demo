import { eq, inArray } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { objectStorage } from '../file/objects.js';

import type { TaskRunInput } from '@/hooks/tasks/task.js';

/** 需要由文档清理任务删除的私有对象位置。 */
interface DocumentCleanupStoredObject {
  /** 对象所在 Bucket。 */
  bucket: string;
  /** 对象私有路径。 */
  objectKey: string;
}

/** 文档清理 worker 所需的最小任务上下文。 */
interface DocumentCleanupTaskContext {
  /** 被逻辑删除的文档标识。 */
  documentId: string;
  /** 发起删除的审计用户。 */
  userId: string;
}

/**
 * 顺序删除去重后的文档对象，并在每次远程动作前后检查取消。
 *
 * @param objects 页面和源文件对象位置。
 * @param taskContext 当前清理任务公共运行上下文。
 * @returns 所有对象均已删除时结束。
 */
async function deleteDocumentStoredObjects(
  objects: DocumentCleanupStoredObject[],
  taskContext: TaskRunInput,
): Promise<void> {
  const uniqueObjects = new Map(
    objects.map((object) => [
      `${object.bucket}\u0000${object.objectKey}`,
      object,
    ]),
  );
  for (const object of uniqueObjects.values()) {
    await taskContext.throwIfCanceled();
    await objectStorage.remove({
      bucket: object.bucket,
      objectKey: object.objectKey,
    });
    await taskContext.throwIfCanceled();
  }
}

/**
 * 执行已逻辑删除文档的对象与数据库清理。
 *
 * 对象全部删除后才会进入数据库事务；任一步失败都会保留文档行，使同一任务可以安全重试。
 *
 * @param context cleanup task 的文档与审计上下文。
 * @param taskContext 通用任务公共运行上下文。
 * @returns 正常返回时由任务框架自动完成；异常交由框架重试或终结。
 */
export async function runDocumentCleanupTask(
  context: DocumentCleanupTaskContext,
  taskContext: TaskRunInput,
): Promise<void> {
  await taskContext.throwIfCanceled();
  const objects = await loadDocumentCleanupObjects(context.documentId);
  await taskContext.progress({
    stage: 'cleanup-objects',
    progress: 10,
    processedItems: 0,
    totalItems: objects.length,
  });
  await taskContext.log.info(`开始清理文档对象，共 ${objects.length} 个`);
  await deleteDocumentStoredObjects(objects, taskContext);
  await taskContext.progress({
    stage: 'cleanup-database',
    progress: 80,
    processedItems: objects.length,
    totalItems: objects.length,
  });
  await deleteDocumentDatabaseRows(context, taskContext);
  await taskContext.progress({
    stage: 'completed',
    progress: 100,
    processedItems: objects.length,
    totalItems: objects.length,
  });
  await taskContext.log.info('文档物理清理完成');
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
    .select({ status: schemas.documents.status })
    .from(schemas.documents)
    .where(eq(schemas.documents.document_id, documentId))
    .limit(1);
  if (!document) return [];
  if (document.status !== 'deleted') {
    throw new ROOT_ERROR('只有已逻辑删除的文档可以清理');
  }
  const versions = await db
    .select({
      id: schemas.document_versions.document_version_id,
      fileId: schemas.document_versions.source_file_id,
    })
    .from(schemas.document_versions)
    .where(eq(schemas.document_versions.document_id, documentId));
  if (!versions.length) return [];
  const versionIds = versions.map((version) => version.id);
  const fileIds = versions.map((version) => version.fileId);
  const [pages, files] = await Promise.all([
    db
      .select({
        bucket: schemas.document_preview_pages.bucket,
        objectKey: schemas.document_preview_pages.object_key,
      })
      .from(schemas.document_preview_pages)
      .where(
        inArray(schemas.document_preview_pages.document_version_id, versionIds),
      ),
    db
      .select({
        bucket: schemas.files.bucket,
        objectKey: schemas.files.object_key,
      })
      .from(schemas.files)
      .where(inArray(schemas.files.file_id, fileIds)),
  ]);
  return [...pages, ...files];
}

/**
 * 在一个事务内删除文档领域记录并确认任务仍有效。
 *
 * @param context cleanup task 的文档和审计上下文。
 * @param taskContext 通用任务公共运行上下文。
 * @returns 数据库记录删除完成后结束，通用任务历史始终保留。
 */
async function deleteDocumentDatabaseRows(
  context: DocumentCleanupTaskContext,
  taskContext: TaskRunInput,
): Promise<void> {
  await taskContext.throwIfCanceled();
  await db.transaction(async (tx) => {
    const [document] = await tx
      .select({ status: schemas.documents.status })
      .from(schemas.documents)
      .where(eq(schemas.documents.document_id, context.documentId))
      .limit(1);
    if (document && document.status !== 'deleted') {
      throw new ROOT_ERROR('文档状态已恢复，拒绝物理清理');
    }
    if (document) {
      const versions = await tx
        .select({
          id: schemas.document_versions.document_version_id,
          fileId: schemas.document_versions.source_file_id,
        })
        .from(schemas.document_versions)
        .where(eq(schemas.document_versions.document_id, context.documentId));
      const versionIds = versions.map((version) => version.id);
      const fileIds = versions.map((version) => version.fileId);
      await tx
        .delete(schemas.rag_dataset_documents)
        .where(
          eq(schemas.rag_dataset_documents.document_id, context.documentId),
        );
      if (versionIds.length) {
        await tx
          .delete(schemas.document_segments)
          .where(
            inArray(schemas.document_segments.document_version_id, versionIds),
          );
        await tx
          .delete(schemas.document_preview_pages)
          .where(
            inArray(
              schemas.document_preview_pages.document_version_id,
              versionIds,
            ),
          );
        await tx
          .delete(schemas.document_versions)
          .where(
            inArray(schemas.document_versions.document_version_id, versionIds),
          );
      }
      if (fileIds.length) {
        await tx
          .delete(schemas.file_upload_sessions)
          .where(inArray(schemas.file_upload_sessions.file_id, fileIds));
        await tx
          .delete(schemas.files)
          .where(inArray(schemas.files.file_id, fileIds));
      }
      await tx
        .delete(schemas.documents)
        .where(eq(schemas.documents.document_id, context.documentId));
    }
  });
}
