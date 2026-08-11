import { and, eq, inArray, max } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { pgAdvisoryXactLock, schemas } from '@/database/index.js';
import { documentsConfig } from '../config.js';
import { documentProcessor } from '../document/index.js';
import { documentPreview } from '../preview/index.js';
import { documentRag } from '../rag/index.js';
import { completeDocumentTaskOperation, runTaskStage } from './stage.js';

import type {
  TaskCancelLifecycleInput,
  TaskCreateInput,
  TaskFailureInput,
  TaskRunInput,
} from '@/hooks/tasks/task.js';
import type { DocumentFileTaskData, DocumentTaskData } from './types.js';
import type { DocumentTaskOperationContext } from './stage.js';

export type {
  AddDocumentProcessingTaskInput,
  AddDocumentTaskInput,
  DocumentCleanupTaskData,
  DocumentFileTaskData,
} from './types.js';

/** 文档处理任务取消时使用的稳定错误码。 */
export const DOCUMENT_TASK_CANCELED_ERROR_CODE =
  'FILE_PROCESSING_TASK_CANCELED';
/** 文档处理任务取消时使用的安全摘要。 */
export const DOCUMENT_TASK_CANCELED_MESSAGE = '文件处理任务已取消';

/**
 * 执行 documents 域唯一的整体任务脚本。
 *
 * @param input 通用任务运行信息和文档业务数据组成的单对象参数。
 * @returns 选中的全部文档操作完成后结束。
 */
export default async function runDocumentTask(
  input: TaskRunInput<DocumentTaskData>,
): Promise<void> {
  const operations = resolveDocumentTaskOperations(input.data);
  if (isCleanupData(input.data)) {
    await input.progress({ stage: 'cleanup', progress: 10 });
    await input.log.info('开始文档物理清理');
    const result = await documentProcessor.cleanup({
      documentId: input.data.documentId,
      assertActive: input.throwIfCanceled,
    });
    await input.progress({
      stage: 'completed',
      progress: 100,
      processedItems: result.deletedObjectCount,
      totalItems: result.deletedObjectCount,
    });
    await input.log.info('文档物理清理完成');
    return;
  }
  if (!documentsConfig.fileProcessing.enabled) {
    throw new Error('FILE_PROCESSING_DISABLED: 文件处理任务未启用');
  }
  for (const [index, operation] of operations.entries()) {
    if (operation === 'cleanup') continue;
    const context: DocumentTaskOperationContext = {
      task: input,
      fileId: input.data.fileId,
      documentId: input.data.documentId,
      documentVersionId: input.data.documentVersionId,
      operation,
      progressStart: Math.floor((index * 100) / operations.length),
      progressEnd: Math.floor(((index + 1) * 100) / operations.length),
      userId: input.data.userId,
    };
    if (operation === 'rag') {
      const result = await runTaskStage(
        context,
        'rag',
        async ({ checkpoint, saveCheckpoint }) =>
          await documentRag.process({
            fileId: context.fileId,
            documentId: context.documentId,
            documentVersionId: context.documentVersionId,
            userId: context.userId,
            checkpoint,
            saveCheckpoint,
            assertActive: input.throwIfCanceled,
          }),
      );
      await completeDocumentTaskOperation(context, result.segmentCount, {
        capability: 'document-rag',
        documentId: context.documentId,
        documentVersionId: context.documentVersionId,
        ...result,
      });
      continue;
    }
    const result = await runTaskStage(
      context,
      'preview',
      async () =>
        await documentPreview.process({
          executionId: input.taskId,
          fileId: context.fileId,
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          userId: context.userId,
          assertActive: input.throwIfCanceled,
        }),
    );
    await completeDocumentTaskOperation(context, result.pageCount, {
      capability: 'document-preview',
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      ...result,
    });
  }
  await input.progress({ stage: 'completed', progress: 100 });
}

/**
 * 在 task.add 内部事务中准备文档领域状态和扩展记录。
 *
 * @param input 新任务标识、data 和 task 包内部事务。
 * @returns 文档创建前置状态原子保存后结束。
 */
export async function onCreate(
  input: TaskCreateInput<DocumentTaskData>,
): Promise<void> {
  resolveDocumentTaskOperations(input.data);
  if (isCleanupData(input.data)) {
    await prepareDocumentCleanup({ ...input, data: input.data });
    return;
  }
  await prepareDocumentProcessing({ ...input, data: input.data });
}

/**
 * 在通用取消事务内终结文档处理阶段和领域状态。
 *
 * @param input 被取消任务的 data、用户和 task 包内部事务。
 * @returns 领域取消状态写入完成后结束。
 */
export async function onCancel(
  input: TaskCancelLifecycleInput<DocumentTaskData>,
): Promise<void> {
  if (isCleanupData(input.data)) return;
  await settleFileProcessingDomain(input, input.data, {
    stageStatus: 'canceled',
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  });
}

/**
 * 在通用重试耗尽事务内终结文档处理阶段和领域状态。
 *
 * @param input 最终错误、任务 data 与 task 包内部事务。
 * @returns 领域失败状态写入完成后结束。
 */
export async function onTerminalFailure(
  input: TaskFailureInput<DocumentTaskData>,
): Promise<void> {
  if (isCleanupData(input.data)) return;
  let stageStatus: 'failed' | 'interrupted' = 'failed';
  if (input.reason === 'interrupted') stageStatus = 'interrupted';
  await settleFileProcessingDomain(input, input.data, {
    stageStatus,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  });
}

/** 文件处理任务收敛时需要持久化的稳定错误。 */
interface FileProcessingTerminalError {
  /** 活动阶段最终状态。 */
  stageStatus: 'failed' | 'canceled' | 'interrupted';
  /** 稳定错误码。 */
  errorCode: string;
  /** 面向任务中心的安全错误摘要。 */
  errorMessage: string;
}

/**
 * 在 task.add 事务中创建文件处理领域扩展。
 *
 * @param input 新通用任务和文件处理数据。
 * @returns 领域扩展与预览 pending 状态保存后结束。
 */
async function prepareDocumentProcessing(
  input: TaskCreateInput<DocumentFileTaskData>,
): Promise<void> {
  for (const operation of input.data.operations) {
    if (!input.data.operationConfigVersions[operation]) {
      throw new Error(
        `DOCUMENT_TASK_CONFIG_REQUIRED: ${operation} 缺少配置版本`,
      );
    }
  }
  await pgAdvisoryXactLock(
    input.transaction,
    'document-process',
    input.data.documentVersionId,
  );
  const [lastExecution] = await input.transaction
    .select({ value: max(schemas.file_processing_tasks.execution_no) })
    .from(schemas.file_processing_tasks)
    .where(
      eq(
        schemas.file_processing_tasks.document_version_id,
        input.data.documentVersionId,
      ),
    );
  const now = new Date();
  if (input.data.operations.includes('preview')) {
    await input.transaction
      .update(schemas.document_versions)
      .set({
        preview_status: 'pending',
        preview_page_count: 0,
        preview_error: null,
        preview_converter_version: null,
        last_update_user_id: input.data.userId,
        last_update_timestamp: now,
      })
      .where(
        eq(
          schemas.document_versions.document_version_id,
          input.data.documentVersionId,
        ),
      );
  }
  await input.transaction.insert(schemas.file_processing_tasks).values({
    task_id: input.taskId,
    file_id: input.data.fileId,
    document_id: input.data.documentId,
    document_version_id: input.data.documentVersionId,
    task_parts: input.data.operations,
    execution_no: (lastExecution?.value ?? 0) + 1,
    trigger_source: input.data.triggerSource,
    content_config_version: input.data.operationConfigVersions.rag ?? null,
    preview_config_version: input.data.operationConfigVersions.preview ?? null,
    result_summary: null,
    create_user_id: input.data.userId,
    create_timestamp: now,
    last_update_user_id: input.data.userId,
    last_update_timestamp: now,
  });
}

/**
 * 在 task.add 事务中逻辑删除文档，为独占清理脚本准备数据。
 *
 * @param input 新通用任务和文档清理数据。
 * @returns 文档逻辑删除和 RAG 关系移除完成后结束。
 */
async function prepareDocumentCleanup(
  input: TaskCreateInput<
    Extract<DocumentTaskData, { operations: ['cleanup'] }>
  >,
): Promise<void> {
  await pgAdvisoryXactLock(
    input.transaction,
    'document-cleanup',
    input.data.documentId,
  );
  const [document] = await input.transaction
    .select({ status: schemas.documents.status })
    .from(schemas.documents)
    .where(
      and(
        eq(schemas.documents.document_id, input.data.documentId),
        eq(schemas.documents.create_user_id, input.data.userId),
      ),
    )
    .limit(1);
  if (!document) throw new ROOT_ERROR('相关文件不存在');
  const now = new Date();
  if (document.status !== 'deleted') {
    await input.transaction
      .update(schemas.documents)
      .set({
        status: 'deleted',
        last_update_user_id: input.data.userId,
        last_update_timestamp: now,
      })
      .where(eq(schemas.documents.document_id, input.data.documentId));
  }
  await input.transaction
    .delete(schemas.rag_dataset_documents)
    .where(
      eq(schemas.rag_dataset_documents.document_id, input.data.documentId),
    );
}

/**
 * 收敛内容或预览阶段以及对应的 RAG 或页面预览状态。
 *
 * @param input 任务、用户和 task 包内部事务。
 * @param data 创建任务时保存的文件处理数据。
 * @param error 阶段终态与安全错误。
 * @returns 阶段和领域状态完成原子更新后结束。
 */
async function settleFileProcessingDomain(
  input:
    | TaskCancelLifecycleInput<DocumentTaskData>
    | TaskFailureInput<DocumentTaskData>,
  data: DocumentFileTaskData,
  error: FileProcessingTerminalError,
): Promise<void> {
  const now = new Date();
  let auditUserId = data.userId;
  if ('userId' in input && input.userId) auditUserId = input.userId;
  await input.transaction
    .update(schemas.file_processing_task_stage_runs)
    .set({
      status: error.stageStatus,
      error_code: error.errorCode,
      error_message: error.errorMessage,
      end_timestamp: now,
    })
    .where(
      and(
        eq(schemas.file_processing_task_stage_runs.task_id, input.taskId),
        eq(schemas.file_processing_task_stage_runs.status, 'running'),
      ),
    );
  if (data.operations.includes('preview')) {
    await input.transaction
      .update(schemas.document_versions)
      .set({
        preview_status: 'failed',
        preview_error: error.errorMessage,
        last_update_user_id: auditUserId,
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
    await input.transaction
      .update(schemas.rag_dataset_documents)
      .set({
        rag_status: 'failed',
        rag_error: error.errorMessage,
        last_update_user_id: auditUserId,
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
 * 校验并解析从 PostgreSQL JSONB 恢复的文档任务操作。
 *
 * @param data 静态类型为判别式联合、运行时仍需防御非法数据的输入。
 * @returns 按固定顺序排列的处理操作；非法输入抛出稳定错误。
 */
function resolveDocumentTaskOperations(
  data: DocumentTaskData,
): Array<'preview' | 'rag' | 'cleanup'> {
  if (!data || typeof data !== 'object') {
    throw new Error('DOCUMENT_TASK_CONTEXT_INVALID: 文档任务参数无效');
  }
  if (!isNonEmptyString(data.documentId) || !isNonEmptyString(data.userId)) {
    throw new Error('DOCUMENT_TASK_CONTEXT_INVALID: 文档任务参数不完整');
  }
  if (!Array.isArray(data.operations) || !data.operations.length) {
    throw new Error('DOCUMENT_TASK_CONTEXT_INVALID: 文档任务未指定处理操作');
  }
  const invalidOperation = data.operations.some(
    (operation) => !['preview', 'rag', 'cleanup'].includes(operation),
  );
  if (invalidOperation) {
    throw new Error('DOCUMENT_TASK_CONTEXT_INVALID: 文档任务操作无效');
  }
  const operations = data.operations as Array<'preview' | 'rag' | 'cleanup'>;
  if (operations.includes('cleanup')) {
    if (operations.length !== 1) {
      throw new Error('DOCUMENT_TASK_CONTEXT_INVALID: 清理操作必须独占任务');
    }
    return ['cleanup'];
  }
  const fileData = data as DocumentFileTaskData;
  if (
    !isNonEmptyString(fileData.fileId) ||
    !isNonEmptyString(fileData.documentVersionId)
  ) {
    throw new Error('DOCUMENT_TASK_CONTEXT_INVALID: 文件处理参数不完整');
  }
  return (['preview', 'rag'] as const).filter((operation) =>
    fileData.operations.includes(operation),
  );
}

/**
 * 判断整体任务是否为独占的物理清理任务。
 *
 * @param data 已完成基础校验的文档任务数据。
 * @returns operations 只包含 cleanup 时返回 true。
 */
function isCleanupData(
  data: DocumentTaskData,
): data is Extract<DocumentTaskData, { operations: ['cleanup'] }> {
  return data.operations.length === 1 && data.operations[0] === 'cleanup';
}

/**
 * 判断任务字段是否为非空字符串。
 *
 * @param value JSONB data 中的未知字段值。
 * @returns 字段可作为领域标识使用时返回 true。
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
