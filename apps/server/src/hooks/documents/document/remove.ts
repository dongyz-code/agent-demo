import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
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
        name: schema.documents.name,
        status: schema.documents.status,
      })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.document_id, documentId),
          eq(schema.documents.create_user_id, userId),
        ),
      )
      .limit(1);
    if (!document) return false;
    const versionRows = await tx
      .select({ id: schema.document_versions.document_version_id })
      .from(schema.document_versions)
      .where(eq(schema.document_versions.document_id, documentId));
    const versionIds = versionRows.map((row) => row.id);
    const now = new Date();
    if (document.status !== 'deleted') {
      await tx
        .update(schema.documents)
        .set({
          status: 'deleted',
          last_update_user_id: userId,
          last_update_timestamp: now,
        })
        .where(eq(schema.documents.document_id, documentId));
    }
    await tx
      .delete(schema.rag_dataset_documents)
      .where(eq(schema.rag_dataset_documents.document_id, documentId));
    if (versionIds.length) {
      const taskRows = await tx
        .select({ id: schema.file_processing_tasks.task_id })
        .from(schema.file_processing_tasks)
        .where(
          inArray(
            schema.file_processing_tasks.document_version_id,
            versionIds,
          ),
        );
      const taskIds = taskRows.map((row) => row.id);
      if (taskIds.length) {
        await tx
          .update(schema.tasks)
          .set({
            status: 'killed',
            end_timestamp: now,
            last_update_timestamp: now,
          })
          .where(
            and(
              inArray(schema.tasks.task_id, taskIds),
              inArray(schema.tasks.status, ['to-be-started', 'pending']),
            ),
          );
      }
    }
    const [cleanupTask] = await tx
      .select({
        id: schema.tasks.task_id,
        status: schema.tasks.status,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.task_key, DOCUMENT_CLEANUP_TASK_KEY),
          eq(schema.tasks.business_type, 'document'),
          eq(schema.tasks.business_id, documentId),
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
          .update(schema.tasks)
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
          .where(eq(schema.tasks.task_id, cleanupTask.id));
      }
      return cleanupTask.status !== 'completed';
    }
    await tx.insert(schema.tasks).values({
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
