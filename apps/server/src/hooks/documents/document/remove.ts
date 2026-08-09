import { eq, inArray } from 'drizzle-orm';

import { buildWhere, db, schemas } from '@/database/index.js';
import {
  addDocumentCleanupTask,
  cancelDocumentTasksForRemoval,
} from '../tasks/task.js';

/**
 * 幂等逻辑删除整个文档并阻止现有 RAG 关系继续生效。
 *
 * @param documentId 文档稳定标识。
 * @param userId 当前操作用户。
 * @returns 固定成功结果；已经删除时同样成功。
 */
export async function removeDocument(
  documentId: string,
  userId: string,
): Promise<'ok'> {
  const documentWhere = buildWhere((filter) => {
    filter.push(
      eq(schemas.documents.document_id, documentId),
      eq(schemas.documents.create_user_id, userId),
    );
  });
  const [document] = await db
    .select({ id: schemas.documents.document_id })
    .from(schemas.documents)
    .where(documentWhere)
    .limit(1);
  if (!document) return 'ok';
  const versionRows = await db
    .select({ id: schemas.document_versions.document_version_id })
    .from(schemas.document_versions)
    .where(eq(schemas.document_versions.document_id, documentId));
  const versionIds = versionRows.map((row) => row.id);
  let processingTaskIds: string[] = [];
  if (versionIds.length) {
    const taskRows = await db
      .select({ id: schemas.file_processing_tasks.task_id })
      .from(schemas.file_processing_tasks)
      .where(
        inArray(
          schemas.file_processing_tasks.document_version_id,
          versionIds,
        ),
      );
    processingTaskIds = taskRows.map((row) => row.id);
  }
  await addDocumentCleanupTask({ documentId, userId });
  await cancelDocumentTasksForRemoval(processingTaskIds, userId);
  return 'ok';
}
