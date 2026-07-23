import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import { DOCUMENT_CLEANUP_TASK_KEY } from '../tasks/definition.js';

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
  const shouldNotifyWorker = await db.transaction(async (tx) => {
    const lockKey = `document-cleanup:${documentId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [document] = await tx
      .select({
        name: schemas.documents.name,
        status: schemas.documents.status,
      })
      .from(schemas.documents)
      .where(
        and(
          eq(schemas.documents.document_id, documentId),
          eq(schemas.documents.create_user_id, userId),
        ),
      )
      .limit(1);
    if (!document) return false;
    const versionRows = await tx
      .select({ id: schemas.document_versions.document_version_id })
      .from(schemas.document_versions)
      .where(eq(schemas.document_versions.document_id, documentId));
    const versionIds = versionRows.map((row) => row.id);
    const now = new Date();
    if (document.status !== 'deleted') {
      await tx
        .update(schemas.documents)
        .set({
          status: 'deleted',
          last_update_user_id: userId,
          last_update_timestamp: now,
        })
        .where(eq(schemas.documents.document_id, documentId));
    }
    await tx
      .delete(schemas.rag_dataset_documents)
      .where(eq(schemas.rag_dataset_documents.document_id, documentId));
    if (versionIds.length) {
      const taskRows = await tx
        .select({ id: schemas.file_processing_tasks.task_id })
        .from(schemas.file_processing_tasks)
        .where(
          inArray(
            schemas.file_processing_tasks.document_version_id,
            versionIds,
          ),
        );
      const taskIds = taskRows.map((row) => row.id);
      if (taskIds.length) {
        await tx
          .update(schemas.tasks)
          .set({
            status: 'killed',
            end_timestamp: now,
            last_update_timestamp: now,
          })
          .where(
            and(
              inArray(schemas.tasks.task_id, taskIds),
              inArray(schemas.tasks.status, ['to-be-started', 'pending']),
            ),
          );
      }
    }
    const [cleanupTask] = await tx
      .select({
        id: schemas.tasks.task_id,
        status: schemas.tasks.status,
      })
      .from(schemas.tasks)
      .where(
        and(
          eq(schemas.tasks.task_key, DOCUMENT_CLEANUP_TASK_KEY),
          eq(schemas.tasks.business_type, 'document'),
          eq(schemas.tasks.business_id, documentId),
        ),
      )
      .limit(1);
    if (cleanupTask) {
      if (
        cleanupTask.status === 'failed' ||
        cleanupTask.status === 'killed' ||
        cleanupTask.status === 'deleted'
      ) {
        await tx
          .update(schemas.tasks)
          .set({
            status: 'to-be-started',
            current_stage: 'queued',
            pending_uuid: lockKey,
            progress: 0,
            processed_items: 0,
            total_items: 0,
            error_code: null,
            error_message: null,
            start_timestamp: null,
            end_timestamp: null,
            last_update_timestamp: now,
          })
          .where(eq(schemas.tasks.task_id, cleanupTask.id));
      }
      return cleanupTask.status !== 'completed';
    }
    await tx.insert(schemas.tasks).values({
      task_id: randomUUID(),
      task_key: DOCUMENT_CLEANUP_TASK_KEY,
      task_name: `${document.name} / 文档清理`,
      search_key: document.name,
      pending_uuid: lockKey,
      task_category: 'file-processing',
      business_type: 'document',
      business_id: documentId,
      current_stage: 'queued',
      progress: 0,
      processed_items: 0,
      total_items: 0,
      error_code: null,
      error_message: null,
      args: null,
      status: 'to-be-started',
      execution_user_id: userId,
      trigger_method: 'auto',
      create_timestamp: now,
      start_timestamp: null,
      end_timestamp: null,
      logs: null,
      last_update_timestamp: now,
    });
    return true;
  });
  if (shouldNotifyWorker) {
    const { notifyFileProcessingWorker } = await import('../tasks/worker.js');
    notifyFileProcessingWorker();
  }
  return 'ok';
}
