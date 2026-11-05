import { ROOT_ERROR } from '@/configs/index.js';
import { db } from '@/database/index.js';
import { task } from '@/hooks/tasks/task.js';
import { lockDocument } from './access.js';
import { documentsConfig } from './config.js';
import { resolveDocumentVersion } from './document/resolve-version.js';
import { documentPreview } from './preview/index.js';
import { documentRag } from './rag/index.js';
import { documentProcessTask, failDocumentProcess } from './tasks/process.js';

import type { DbTransaction } from '@/database/index.js';

import type {
  DocumentProcessResult,
  DocumentProcessTaskData,
  DocumentTaskOperation,
  FileProcessingTaskDetail,
  FileProcessingTriggerSource,
} from '@repo/types';

/** 文档处理任务由业务调用方提交的输入。 */
export interface DocumentProcessInput {
  /** 逻辑文档标识。 */
  documentId: string;
  /** 可选历史版本；为空时使用当前版本。 */
  documentVersionId?: string;
  /** 同一任务按固定顺序执行的预览和 RAG 操作。 */
  operations: DocumentTaskOperation[];
  /** 修改关系的入口必须拒绝复用，避免任务已发布后新增 pending 关系无人处理。 */
  reuseActive?: boolean;
  /** 上传、人工、重试或重新执行来源。 */
  triggerSource?: FileProcessingTriggerSource;
}

/** 文档处理任务取消时使用的稳定错误码。 */
export const DOCUMENT_PROCESS_CANCELED_ERROR_CODE =
  'FILE_PROCESSING_TASK_CANCELED';

/** 文档处理任务取消时使用的安全摘要。 */
export const DOCUMENT_PROCESS_CANCELED_MESSAGE = '文件处理任务已取消';

/**
 * 解析文档输入并创建通用文档处理任务。
 *
 * @param input 调用方提交的文档处理输入。
 * @param actorUserId 当前操作用户。
 * @param transaction 可选外层事务，使版本、关系变更与入队原子提交。
 * @returns 新建或复用的任务标识；预览已就绪时返回 null。
 */
export async function enqueueDocumentProcess(
  input: DocumentProcessInput,
  actorUserId: string,
  transaction?: DbTransaction,
): Promise<string | null> {
  if (!actorUserId) throw new ROOT_ERROR('相关文件不存在');
  if (!documentsConfig.fileProcessing.enabled) {
    throw new ROOT_ERROR('服务异常');
  }
  const operations = resolveDocumentOperations(input.operations);
  const taskId = task.createId();
  /** 外层与独立入队共用同一事务实现，不在 helper 内嵌套事务。 */
  const enqueue = async (
    transaction: DbTransaction,
  ): Promise<string | null> => {
    await lockDocument(transaction, input.documentId);
    const resolved = await resolveDocumentVersion(
      input.documentId,
      input.documentVersionId,
      actorUserId,
      transaction,
    );
    if (operations.includes('preview')) {
      const contentType =
        resolved.file.content_type ?? resolved.file.declared_content_type;
      if (!documentPreview.supports(contentType)) {
        throw new ROOT_ERROR('数据异常');
      }
    }
    const documentVersionId = resolved.version.document_version_id;
    const activeTasks = await activeDocumentProcesses(
      input.documentId,
      transaction,
    );
    for (const existing of activeTasks) {
      if (existing.data.documentVersionId !== documentVersionId) continue;
      if (
        !existing.data.operations.some((operation) =>
          operations.includes(operation),
        )
      )
        continue;
      if (
        input.reuseActive !== false &&
        operations.every((operation) =>
          existing.data.operations.includes(operation),
        )
      ) {
        return existing.task_id;
      }
      throw new ROOT_ERROR('文档处理正在进行，请稍后重试');
    }
    const triggerSource = input.triggerSource ?? 'manual';
    const forceNewTask = triggerSource === 'retry' || triggerSource === 'rerun';
    const previewReady =
      operations.length === 1 &&
      operations[0] === 'preview' &&
      resolved.version.preview_status === 'ready';
    if (previewReady && !forceNewTask) return null;
    if (forceNewTask && operations.includes('rag')) {
      await documentRag.prepareRelationsForReprocessing(
        {
          documentId: input.documentId,
          documentVersionId,
          userId: actorUserId,
        },
        transaction,
      );
    }
    if (operations.includes('preview')) {
      await documentPreview.prepare(transaction, {
        documentId: input.documentId,
        documentVersionId,
        userId: actorUserId,
      });
    }
    const data: DocumentProcessTaskData = {
      operations,
      fileId: resolved.file.file_id,
      documentId: input.documentId,
      documentVersionId,
      userId: actorUserId,
    };
    await documentProcessTask.enqueue(data, {
      actorUserId,
      taskId,
      transaction,
      correlationId: documentProcessCorrelationId(input.documentId),
      title: getDocumentProcessTitle(operations, resolved.file.filename),
    });
    return taskId;
  };
  if (transaction) return await enqueue(transaction);
  return await db.transaction(enqueue);
}

/**
 * 取消文档处理任务并收敛预览与 RAG 领域状态。
 *
 * @param taskId 文档处理任务标识。
 * @param userId 发起取消的用户。
 * @param options 可选稳定错误码和安全摘要。
 * @returns 实际取消活动任务时返回 true。
 */
export async function cancelDocumentProcessingTask(
  taskId: string,
  userId: string,
  options: {
    /** 稳定取消错误码。 */
    errorCode?: string;
    /** 面向任务中心的安全取消原因。 */
    message?: string;
  } = {},
): Promise<boolean> {
  const detail = await getDocumentProcessingTask(taskId);
  const errorCode = options.errorCode ?? DOCUMENT_PROCESS_CANCELED_ERROR_CODE;
  const errorMessage = options.message ?? DOCUMENT_PROCESS_CANCELED_MESSAGE;
  const canceled = await db.transaction(async (transaction) => {
    await lockDocument(transaction, detail.data.documentId);
    const canceledInTransaction = await task.cancel(taskId, {
      transaction,
      userId,
      errorCode,
      message: errorMessage,
    });
    if (!canceledInTransaction) return false;
    await failDocumentProcess(transaction, detail.data, errorMessage);
    return true;
  });
  if (canceled) task.interrupt(taskId);
  return canceled;
}

/**
 * 在文档删除事务中撤销全部活动处理，与逻辑删除和清理入队一并提交。
 *
 * @param transaction 已持有文档锁的逻辑删除事务。
 * @param documentId 即将删除的文档。
 * @param userId 发起删除的审计用户。
 * @returns 提交后需要通知本机停止的任务标识；跨实例通过 lease 检查停止。
 */
export async function cancelDocumentProcessesForRemoval(
  transaction: DbTransaction,
  documentId: string,
  userId: string,
): Promise<string[]> {
  const canceledIds: string[] = [];
  const message = '文档已删除，文件处理任务已取消';
  for (const item of await activeDocumentProcesses(documentId, transaction)) {
    const canceled = await task.cancel(item.task_id, {
      transaction,
      userId,
      errorCode: 'DOCUMENT_REMOVED',
      message,
    });
    if (!canceled) continue;
    await failDocumentProcess(transaction, item.data, message);
    canceledIds.push(item.task_id);
  }
  return canceledIds;
}

/**
 * 查询文档处理任务详情。
 *
 * @param taskId 文档处理任务标识。
 * @returns 通用任务详情、文档输入和自动 attempt。
 */
export async function getDocumentProcessingTask(
  taskId: string,
): Promise<FileProcessingTaskDetail> {
  const detail = await task.get<DocumentProcessTaskData, DocumentProcessResult>(
    taskId,
  );
  if (
    !detail ||
    detail.correlation_id !==
      documentProcessCorrelationId(detail.data?.documentId ?? '')
  ) {
    throw new ROOT_ERROR('相关文件不存在');
  }
  return detail;
}

/**
 * 以原文档任务的输入创建人工重试任务。
 *
 * @param taskId 已终结的文档处理任务标识。
 * @param userId 当前操作用户。
 * @returns 新任务详情。
 */
export async function retryDocumentProcessingTask(
  taskId: string,
  userId: string,
): Promise<FileProcessingTaskDetail> {
  const source = await getDocumentProcessingTask(taskId);
  if (
    !['succeeded', 'failed', 'canceled', 'timed_out'].includes(source.status)
  ) {
    throw new ROOT_ERROR('数据异常');
  }
  const retriedTaskId = await enqueueDocumentProcess(
    {
      documentId: source.data.documentId,
      documentVersionId: source.data.documentVersionId,
      operations: source.data.operations,
      triggerSource: source.status === 'succeeded' ? 'rerun' : 'retry',
    },
    userId,
  );
  if (!retriedTaskId) throw new ROOT_ERROR('数据异常');
  return await getDocumentProcessingTask(retriedTaskId);
}

/**
 * 生成文档处理任务的稳定关联键，供本模块的入队、查询和取消共用。
 *
 * @param documentId 文档稳定标识。
 * @returns 通用任务关联键。
 */
function documentProcessCorrelationId(documentId: string): string {
  return `document-process:${documentId}`;
}

/**
 * 在文档锁内分页读取活动任务，为入队去重和删除前撤销提供完整快照。
 *
 * @param documentId 文档稳定标识。
 * @param transaction 已持有文档锁的业务事务。
 * @returns 当前文档仍可执行的任务，不加载 attempt 历史。
 */
async function activeDocumentProcesses(
  documentId: string,
  transaction: DbTransaction,
) {
  const tasks = [];
  for (let offset = 0; ; offset += 200) {
    const result = await task.list({
      filter: {
        correlation_id: documentProcessCorrelationId(documentId),
      },
      transaction,
      limit: [offset, offset + 200],
    });
    const snapshots = await task.getMany<DocumentProcessTaskData>(
      result.list.map((item) => item.task_id),
      transaction,
    );
    // 不在分页条件中筛状态：Worker 结束会使活动集合缩小，offset 分页可能漏任务。
    tasks.push(
      ...snapshots.filter((item) =>
        ['queued', 'running', 'retrying'].includes(item.status),
      ),
    );
    if (result.list.length < 200) break;
  }
  return tasks;
}

/**
 * 校验并规范化文档处理操作。
 *
 * @param requestedOperations 调用方提交的预览和 RAG 操作。
 * @returns 按预览、RAG 顺序去重后的操作。
 */
function resolveDocumentOperations(
  requestedOperations: DocumentTaskOperation[],
): DocumentTaskOperation[] {
  if (!Array.isArray(requestedOperations) || !requestedOperations.length) {
    throw new Error('DOCUMENT_TASK_OPERATIONS_REQUIRED: 至少选择一个操作');
  }
  const invalid = requestedOperations.some(
    (operation) => operation !== 'preview' && operation !== 'rag',
  );
  if (invalid) {
    throw new Error('DOCUMENT_TASK_OPERATIONS_INVALID: 文档处理操作无效');
  }
  return (['preview', 'rag'] as const).filter((operation) =>
    requestedOperations.includes(operation),
  );
}

/**
 * 生成文档处理任务的展示名称。
 *
 * @param operations 已规范化的操作。
 * @param filename 源文件名称。
 * @returns 不超过任务表限制的中文名称。
 */
function getDocumentProcessTitle(
  operations: DocumentTaskOperation[],
  filename: string,
): string {
  let operation = '预处理 RAG';
  if (operations.length === 2) operation = '生成预览并预处理 RAG';
  else if (operations[0] === 'preview') operation = '生成预览';
  return `文档${operation}：${filename}`.slice(0, 255);
}
