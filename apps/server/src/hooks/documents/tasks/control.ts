import { and, eq, inArray } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';

/**
 * 取消活动文档任务，并同步收敛预览或知识库关系状态。
 *
 * 已经发布成功的页面和关系不回退；仍处于 pending/processing 的目标会标记为
 * failed，使预览入口或内容任务重试可以继续恢复。
 *
 * @param taskId 待取消的通用任务标识。
 * @param userId 当前操作用户，用于派生状态审计。
 * @returns 任务及其尚未发布的派生状态完成更新后结束。
 */
export async function cancelDocumentProcessingTask(
  taskId: string,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [fileTask] = await tx
      .select({
        taskType: schemas.file_processing_tasks.task_type,
        documentId: schemas.file_processing_tasks.document_id,
        documentVersionId:
          schemas.file_processing_tasks.document_version_id,
      })
      .from(schemas.file_processing_tasks)
      .where(eq(schemas.file_processing_tasks.task_id, taskId))
      .limit(1);
    if (!fileTask) {
      throw new ROOT_ERROR('相关文件不存在');
    }

    const now = new Date();
    const message = '文件处理任务已取消';
    const [updated] = await tx
      .update(schemas.tasks)
      .set({
        status: 'killed',
        error_code: 'FILE_PROCESSING_TASK_CANCELED',
        error_message: message,
        end_timestamp: now,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(schemas.tasks.task_id, taskId),
          inArray(schemas.tasks.status, ['to-be-started', 'pending']),
        ),
      )
      .returning({ taskId: schemas.tasks.task_id });
    if (!updated) {
      throw new ROOT_ERROR('数据异常');
    }

    await tx
      .update(schemas.file_processing_task_stage_runs)
      .set({
        status: 'killed',
        error_code: 'FILE_PROCESSING_TASK_CANCELED',
        error_message: message,
        end_timestamp: now,
      })
      .where(
        and(
          eq(schemas.file_processing_task_stage_runs.task_id, taskId),
          eq(schemas.file_processing_task_stage_runs.status, 'pending'),
        ),
      );

    if (fileTask.taskType === 'preview') {
      await tx
        .update(schemas.document_versions)
        .set({
          preview_status: 'failed',
          preview_error: message,
          last_update_user_id: userId,
          last_update_timestamp: now,
        })
        .where(
          and(
            eq(
              schemas.document_versions.document_version_id,
              fileTask.documentVersionId,
            ),
            inArray(schemas.document_versions.preview_status, [
              'pending',
              'processing',
            ]),
          ),
        );
      return;
    }

    await tx
      .update(schemas.rag_dataset_documents)
      .set({
        rag_status: 'failed',
        rag_error: message,
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(
            schemas.rag_dataset_documents.document_id,
            fileTask.documentId,
          ),
          eq(
            schemas.rag_dataset_documents.pending_version_id,
            fileTask.documentVersionId,
          ),
          inArray(schemas.rag_dataset_documents.rag_status, [
            'pending',
            'processing',
          ]),
        ),
      );
  });
}
