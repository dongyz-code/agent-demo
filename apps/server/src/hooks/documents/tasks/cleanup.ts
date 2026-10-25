import { and, eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, pgAdvisoryXactLock, schemas } from '@/database/index.js';
import { defineTask, task } from '@/hooks/tasks/task.js';
import { documentsConfig } from '../config.js';
import { documentProcessor } from '../document/index.js';

import type { TaskRunContext } from '@/hooks/tasks/task.js';

/** 文档物理清理任务由业务调用方提交的输入。 */
export interface DocumentCleanupInput {
  /** 已逻辑删除或等待逻辑删除的文档标识。 */
  documentId: string;
}

/** 文档物理清理任务持久化的最小执行数据。 */
export interface DocumentCleanupTaskData {
  /** 被物理清理的文档标识。 */
  documentId: string;
  /** 发起删除的审计用户。 */
  userId: string;
}

/**
 * 逻辑删除文档、移除 RAG 关系并原子创建物理清理任务。
 *
 * @param documentId 文档标识。
 * @param actorUserId 发起删除的审计用户。
 * @returns 新建的物理清理任务标识。
 */
export async function enqueueDocumentCleanup(
  documentId: string,
  actorUserId: string,
): Promise<string> {
  if (!actorUserId || !documentId.trim()) {
    throw new ROOT_ERROR('相关文件不存在');
  }
  const taskId = task.createId();
  return await db.transaction(async (transaction) => {
    await pgAdvisoryXactLock(transaction, 'document-cleanup', documentId);
    const [document] = await transaction
      .select({ status: schemas.documents.status })
      .from(schemas.documents)
      .where(
        and(
          eq(schemas.documents.document_id, documentId),
          eq(schemas.documents.create_user_id, actorUserId),
        ),
      )
      .limit(1);
    if (!document) throw new ROOT_ERROR('相关文件不存在');
    const now = new Date();
    if (document.status !== 'deleted') {
      await transaction
        .update(schemas.documents)
        .set({
          status: 'deleted',
          last_update_user_id: actorUserId,
          last_update_timestamp: now,
        })
        .where(eq(schemas.documents.document_id, documentId));
    }
    await transaction
      .delete(schemas.rag_dataset_documents)
      .where(eq(schemas.rag_dataset_documents.document_id, documentId));
    const data: DocumentCleanupTaskData = { documentId, userId: actorUserId };
    await documentCleanupTask.enqueue(data, {
      actorUserId,
      taskId,
      transaction,
      correlationId: `document-cleanup:${documentId}`,
      title: '删除文档',
    });
    return taskId;
  });
}

/**
 * 清理文档对象存储和领域数据库行。
 *
 * @param data 已逻辑删除文档的执行数据。
 * @param context 通用任务运行上下文。
 * @returns 物理清理完成后结束。
 */
async function runDocumentCleanup(
  data: DocumentCleanupTaskData,
  context: TaskRunContext,
): Promise<void> {
  await context.progress({ stage: 'cleanup', progress: 10 });
  await context.log.info('开始删除文档');
  const result = await documentProcessor.cleanup({
    documentId: data.documentId,
    assertActive: context.throwIfCanceled,
  });
  await context.progress({
    stage: 'completed',
    progress: 100,
    processedItems: result.deletedObjectCount,
    totalItems: result.deletedObjectCount,
  });
  await context.log.info(
    `文档删除完成，共删除 ${result.deletedObjectCount} 个存储对象`,
  );
}

/** 文档物理清理任务策略。 */
export const documentCleanupTask = defineTask<DocumentCleanupTaskData>({
  script: import.meta.url,
  group: 'document',
  concurrency: documentsConfig.fileProcessing.concurrency,
  retry: {
    times: documentsConfig.fileProcessing.maxRetries,
    delayMs: documentsConfig.fileProcessing.retryDelayMs,
  },
  timeoutMs: documentsConfig.fileProcessing.timeoutMs,
});

export default runDocumentCleanup;
