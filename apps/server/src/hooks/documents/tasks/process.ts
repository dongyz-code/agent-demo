import { and, eq, inArray } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import { defineTask, TaskCanceledError } from '@/hooks/tasks/task.js';
import { documentsConfig } from '../config.js';
import { documentPreview } from '../preview/index.js';
import { documentRag } from '../rag/index.js';

import type { TaskRunContext, TaskTransaction } from '@/hooks/tasks/task.js';
import type {
  DocumentProcessResult,
  DocumentProcessTaskData,
} from '@repo/types';

/** 文档处理任务策略。 */
export const documentProcessTask = defineTask<DocumentProcessTaskData>({
  script: import.meta.url,
  group: 'document',
  concurrency: documentsConfig.fileProcessing.concurrency,
  retry: {
    times: documentsConfig.fileProcessing.maxRetries,
    delayMs: documentsConfig.fileProcessing.retryDelayMs,
  },
  timeoutMs: documentsConfig.fileProcessing.timeoutMs,
});

export default runDocumentProcess;

/**
 * 按固定顺序执行文档预览和 RAG，并把结果交给通用任务中心保存。
 *
 * @param data 已持久化的文档处理快照。
 * @param context 通用任务运行上下文。
 * @returns 预览和 RAG 的可序列化结果。
 */
async function runDocumentProcess(
  data: DocumentProcessTaskData,
  context: TaskRunContext,
): Promise<DocumentProcessResult> {
  try {
    if (!documentsConfig.fileProcessing.enabled) {
      throw new Error('FILE_PROCESSING_DISABLED: 文件处理任务未启用');
    }
    const result: DocumentProcessResult = {};
    if (data.operations.includes('preview')) {
      await context.progress({ stage: 'preview', progress: 10 });
      await context.log.info('开始生成文档预览');
      const preview = await documentPreview.process({
        executionId: context.taskId,
        fileId: data.fileId,
        documentId: data.documentId,
        documentVersionId: data.documentVersionId,
        userId: data.userId,
        assertActive: context.throwIfCanceled,
      });
      result.preview = { ...preview };
      await context.progress({
        stage: 'preview',
        progress: 50,
        processedItems: preview.pageCount,
        totalItems: preview.pageCount,
      });
      await context.log.info(`文档预览完成，共 ${preview.pageCount} 页`);
    }
    if (data.operations.includes('rag')) {
      await context.progress({ stage: 'rag', progress: 60 });
      await context.log.info('开始文档 RAG 预处理');
      const rag = await documentRag.process({
        fileId: data.fileId,
        documentId: data.documentId,
        documentVersionId: data.documentVersionId,
        userId: data.userId,
        checkpoint: context.checkpoint,
        saveCheckpoint: context.saveCheckpoint,
        assertActive: context.throwIfCanceled,
      });
      result.rag = { ...rag };
      await context.progress({
        stage: 'rag',
        progress: 95,
        processedItems: rag.segmentCount,
        totalItems: rag.segmentCount,
      });
      await context.log.info(
        `文档 RAG 预处理完成，共生成 ${rag.segmentCount} 个 Segment`,
      );
    }
    await context.progress({ stage: 'completed', progress: 100 });
    return result;
  } catch (error) {
    if (!(error instanceof TaskCanceledError)) {
      await settleDocumentProcessingState(
        db,
        data,
        readTaskErrorMessage(error),
      );
    }
    throw error;
  }
}

/**
 * 把文档预览和 RAG 状态收敛到失败。
 *
 * @param executor 当前数据库或事务执行器。
 * @param data 文档处理任务快照。
 * @param errorMessage 安全错误摘要。
 * @returns 领域状态更新完成后结束。
 */
export async function settleDocumentProcessingState(
  executor: Pick<typeof db, 'update'> | TaskTransaction,
  data: DocumentProcessTaskData,
  errorMessage: string,
): Promise<void> {
  const now = new Date();
  if (data.operations.includes('preview')) {
    await executor
      .update(schemas.document_versions)
      .set({
        preview_status: 'failed',
        preview_error: errorMessage,
        last_update_user_id: data.userId,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(
            schemas.document_versions.document_version_id,
            data.documentVersionId,
          ),
          inArray(schemas.document_versions.preview_status, [
            'pending',
            'processing',
          ]),
        ),
      );
  }
  if (data.operations.includes('rag')) {
    await executor
      .update(schemas.rag_dataset_documents)
      .set({
        rag_status: 'failed',
        rag_error: errorMessage,
        last_update_user_id: data.userId,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(schemas.rag_dataset_documents.document_id, data.documentId),
          eq(
            schemas.rag_dataset_documents.pending_version_id,
            data.documentVersionId,
          ),
          inArray(schemas.rag_dataset_documents.rag_status, [
            'pending',
            'processing',
          ]),
        ),
      );
  }
}

/**
 * 读取任务异常中的安全摘要。
 *
 * @param error 任务抛出的未知异常。
 * @returns 最多 500 个字符的错误消息。
 */
function readTaskErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }
  return '文档处理失败';
}
