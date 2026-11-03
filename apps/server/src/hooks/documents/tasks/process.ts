import { db } from '@/database/index.js';
import { defineTask, TaskCanceledError } from '@/hooks/tasks/task.js';
import { lockDocument } from '../access.js';
import { documentsConfig } from '../config.js';
import { documentPreview } from '../preview/index.js';
import { documentRag } from '../rag/index.js';

import type { TaskRunContext } from '@/hooks/tasks/task.js';
import type { DbTransaction } from '@/database/index.js';
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
        executionId: `${context.taskId}:${context.attempt}`,
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
      await db.transaction(async (transaction) => {
        await lockDocument(transaction, data.documentId);
        try {
          await context.throwIfCanceled();
        } catch (cancellation) {
          if (cancellation instanceof TaskCanceledError) return;
          throw cancellation;
        }
        await failDocumentProcess(
          transaction,
          data,
          readTaskErrorMessage(error),
        );
      });
    }
    throw error;
  }
}

/**
 * 写入本任务负责的领域失败状态，供执行异常和主动取消共用。
 *
 * @param transaction 已持有文档锁的业务事务；执行异常需在锁内检查执行权。
 * @param data 任务绑定的文档版本及实际负责的操作。
 * @param message 面向用户的安全错误摘要。
 * @returns 对应领域的未完成状态更新后结束，已 ready 的结果保持不变。
 */
export async function failDocumentProcess(
  transaction: DbTransaction,
  data: DocumentProcessTaskData,
  message: string,
): Promise<void> {
  if (data.operations.includes('preview')) {
    await documentPreview.fail(transaction, data, message);
  }
  if (data.operations.includes('rag')) {
    await documentRag.fail(transaction, data, message);
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
