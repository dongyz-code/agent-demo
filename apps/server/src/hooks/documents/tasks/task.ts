import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { task } from '@/hooks/tasks/task.js';
import { documentsConfig } from '../config.js';
import { resolveDocumentVersion } from '../document/read.js';
import { DEFAULT_DOCUMENT_CONTENT_CONFIG_VERSION } from '../document/content/definition.js';
import { prepareDocumentRagRelationsForReprocessing } from '../rag/relations.js';
import {
  DOCUMENT_PREVIEW_CONVERTER_VERSION,
  documentPageConverter,
} from '../preview/converter.js';
import {
  DOCUMENT_TASK_CANCELED_ERROR_CODE,
  DOCUMENT_TASK_CANCELED_MESSAGE,
} from './runtime.js';

import type {
  DocumentProcessingTaskPart,
  FileProcessingTaskDetail,
  FileProcessingTaskInfo,
  FileProcessingTriggerSource,
} from '@repo/types';

/** documents 域唯一的通用任务名称。 */
const DOCUMENT_TASK_NAME = 'document.process';
/** documents 整体任务的子进程脚本模块。 */
const DOCUMENT_TASK_SCRIPT = new URL('./runtime.js', import.meta.url).href;

/** 文档内容或预览任务的数据快照。 */
export interface DocumentFileTaskData {
  /** 同一任务实例内按顺序执行的内容与预览部分。 */
  parts: DocumentProcessingTaskPart[];
  /** 被处理的源文件标识。 */
  fileId: string;
  /** 逻辑文档标识。 */
  documentId: string;
  /** 本次处理绑定的不可变文档版本。 */
  documentVersionId: string;
  /** 上传、人工、重试或重新执行。 */
  triggerSource: FileProcessingTriggerSource;
  /** 各处理部分对应的配置版本。 */
  processingConfigVersions: Partial<
    Record<DocumentProcessingTaskPart, string>
  >;
  /** 创建任务的审计用户。 */
  userId: string;
}

/** 文档逻辑删除后的物理清理任务数据。 */
export interface DocumentCleanupTaskData {
  /** 清理必须独占整个任务实例。 */
  parts: ['cleanup'];
  /** 被逻辑删除的文档标识。 */
  documentId: string;
  /** 发起删除的审计用户。 */
  userId: string;
}

/** documents 域唯一脚本接受的判别式数据。 */
export type DocumentTaskData =
  | DocumentFileTaskData
  | DocumentCleanupTaskData;

/** 创建整体文档处理任务时由业务方提供的输入。 */
export interface CreateDocumentProcessingTaskInput {
  /** 逻辑文档标识。 */
  documentId: string;
  /** 可选历史版本；为空时使用当前版本。 */
  documentVersionId?: string;
  /** 需要执行的部分；未提供时依次执行内容和预览。 */
  parts?: DocumentProcessingTaskPart[];
  /** 上传、人工、重试或重新执行。 */
  triggerSource?: FileProcessingTriggerSource;
  /** 可选内容处理配置；未提供时使用当前默认配置。 */
  contentConfigVersion?: string;
}

/** 创建文档物理清理任务时需要的数据。 */
export interface AddDocumentCleanupTaskInput {
  /** 被逻辑删除的文档标识。 */
  documentId: string;
  /** 发起删除的审计用户。 */
  userId: string;
}

/**
 * 创建一个可组合或跳过部分的整体文档处理任务。
 *
 * @param input 文档版本、可选 parts、触发来源和内容配置。
 * @param userId 当前操作用户，用于数据范围和审计。
 * @returns 新建任务摘要；无需重复生成就绪预览时返回 null。
 */
export async function createDocumentProcessingTask(
  input: CreateDocumentProcessingTaskInput,
  userId: string,
): Promise<FileProcessingTaskInfo | null> {
  if (!documentsConfig.fileProcessing.enabled) {
    throw new ROOT_ERROR('服务异常');
  }
  const parts = normalizeProcessingParts(
    input.parts ?? ['content', 'preview'],
  );
  const resolved = await resolveDocumentVersion(
    input.documentId,
    input.documentVersionId,
    userId,
  );
  if (parts.includes('preview')) {
    const contentType =
      resolved.file.content_type ?? resolved.file.declared_content_type;
    if (!documentPageConverter.supports(contentType)) {
      throw new ROOT_ERROR('数据异常');
    }
  }
  const documentVersionId = resolved.version.document_version_id;
  const triggerSource = input.triggerSource ?? 'manual';
  const forceNewTask = triggerSource === 'retry' || triggerSource === 'rerun';
  const previewReady =
    parts.length === 1 &&
    parts[0] === 'preview' &&
    resolved.version.preview_status === 'ready' &&
    resolved.version.preview_converter_version ===
      DOCUMENT_PREVIEW_CONVERTER_VERSION;
  if (previewReady && !forceNewTask) return null;
  if (forceNewTask && parts.includes('content')) {
    await prepareDocumentRagRelationsForReprocessing({
      documentId: input.documentId,
      documentVersionId,
      userId,
    });
  }
  const processingConfigVersions: Partial<
    Record<DocumentProcessingTaskPart, string>
  > = {};
  if (parts.includes('content')) {
    processingConfigVersions.content =
      input.contentConfigVersion ?? DEFAULT_DOCUMENT_CONTENT_CONFIG_VERSION;
  }
  if (parts.includes('preview')) {
    processingConfigVersions.preview = DOCUMENT_PREVIEW_CONVERTER_VERSION;
  }
  const data: DocumentFileTaskData = {
    parts,
    fileId: resolved.file.file_id,
    documentId: input.documentId,
    documentVersionId,
    triggerSource,
    processingConfigVersions,
    userId,
  };
  const taskId = await task.add({
    name: DOCUMENT_TASK_NAME,
    script: DOCUMENT_TASK_SCRIPT,
    data,
    retry: {
      times: documentsConfig.fileProcessing.maxRetries,
      delay: documentsConfig.fileProcessing.retryDelayMs,
    },
    timeout: documentsConfig.fileProcessing.timeoutMs,
    concurrency: documentsConfig.fileProcessing.concurrency,
  });
  return await getDocumentProcessingTask(taskId);
}

/**
 * 创建独占的文档物理清理任务。
 *
 * @param input 文档和审计用户。
 * @returns 新建清理任务标识。
 */
export async function addDocumentCleanupTask(
  input: AddDocumentCleanupTaskInput,
): Promise<string> {
  return await task.add({
    name: DOCUMENT_TASK_NAME,
    script: DOCUMENT_TASK_SCRIPT,
    data: {
      parts: ['cleanup'],
      documentId: input.documentId,
      userId: input.userId,
    } satisfies DocumentCleanupTaskData,
    retry: {
      times: documentsConfig.fileProcessing.maxRetries,
      delay: documentsConfig.fileProcessing.retryDelayMs,
    },
    timeout: documentsConfig.fileProcessing.timeoutMs,
    concurrency: documentsConfig.fileProcessing.concurrency,
  });
}

/**
 * 查询文档处理任务详情及阶段时间线。
 *
 * @param taskId 通用任务标识。
 * @returns 文件、状态、结果摘要、阶段记录和自动 attempt。
 */
export async function getDocumentProcessingTask(
  taskId: string,
): Promise<FileProcessingTaskDetail> {
  const genericTask = await task.get(taskId);
  if (!genericTask) throw new ROOT_ERROR('相关文件不存在');
  const [row] = await db
    .select({
      fileTask: schemas.file_processing_tasks,
      filename: schemas.files.filename,
    })
    .from(schemas.file_processing_tasks)
    .leftJoin(
      schemas.files,
      eq(schemas.files.file_id, schemas.file_processing_tasks.file_id),
    )
    .where(eq(schemas.file_processing_tasks.task_id, taskId))
    .limit(1);
  if (!row) throw new ROOT_ERROR('相关文件不存在');
  const stageRuns = await db
    .select()
    .from(schemas.file_processing_task_stage_runs)
    .where(eq(schemas.file_processing_task_stage_runs.task_id, taskId))
    .orderBy(
      schemas.file_processing_task_stage_runs.start_timestamp,
      schemas.file_processing_task_stage_runs.attempt,
    );
  return {
    ...toTaskInfo(genericTask, row),
    processingConfigVersions: {
      content: row.fileTask.content_config_version ?? undefined,
      preview: row.fileTask.preview_config_version ?? undefined,
    },
    resultSummary: row.fileTask.result_summary
      ? (JSON.parse(row.fileTask.result_summary) as Record<string, unknown>)
      : null,
    stageRuns: stageRuns.map((stage) => ({
      stage: stage.stage,
      attempt: stage.attempt,
      status: stage.status,
      processedItems: stage.processed_items,
      totalItems: stage.total_items,
      errorCode: stage.error_code,
      errorMessage: stage.error_message,
      startedAt: stage.start_timestamp,
      endedAt: stage.end_timestamp,
    })),
    attempts: genericTask.attempts,
  };
}

/**
 * 取消一个活动文档处理任务并收敛领域状态。
 *
 * @param taskId 文档处理通用任务标识。
 * @param userId 当前操作用户。
 * @returns 取消提交完成后结束；任务不存在或已终结时抛出业务错误。
 */
export async function cancelDocumentProcessingTask(
  taskId: string,
  userId: string,
): Promise<void> {
  const [fileTask] = await db
    .select({ id: schemas.file_processing_tasks.task_id })
    .from(schemas.file_processing_tasks)
    .where(eq(schemas.file_processing_tasks.task_id, taskId))
    .limit(1);
  if (!fileTask) throw new ROOT_ERROR('相关文件不存在');
  const canceled = await task.cancel(taskId, {
    errorCode: DOCUMENT_TASK_CANCELED_ERROR_CODE,
    message: DOCUMENT_TASK_CANCELED_MESSAGE,
    userId,
  });
  if (!canceled) throw new ROOT_ERROR('数据异常');
}

/**
 * 因文档删除批量取消关联的文件处理任务。
 *
 * @param taskIds 文档版本关联的全部文件处理任务标识。
 * @param userId 发起文档删除的审计用户。
 * @returns 所有取消请求提交后结束。
 */
export async function cancelDocumentTasksForRemoval(
  taskIds: string[],
  userId: string,
): Promise<void> {
  for (const taskId of taskIds) {
    await task.cancel(taskId, {
      errorCode: 'DOCUMENT_REMOVED',
      message: '文档已删除，文件处理任务已取消',
      userId,
    });
  }
}

/**
 * 将通用任务和 documents 扩展记录组合为业务任务摘要。
 *
 * @param genericTask 通过公共 task API 读取的任务和 attempt。
 * @param row documents 扩展与可选源文件名称。
 * @returns 不暴露通用任务内部表结构的文档处理摘要。
 */
function toTaskInfo(
  genericTask: NonNullable<Awaited<ReturnType<typeof task.get>>>,
  row: {
    /** 文档任务领域扩展。 */
    fileTask: typeof schemas.file_processing_tasks.$inferSelect;
    /** 文档被物理清理后为空。 */
    filename: string | null;
  },
): FileProcessingTaskInfo {
  const retryableStatuses = [
    'succeeded',
    'failed',
    'canceled',
    'timed_out',
  ];
  return {
    taskId: genericTask.task_id,
    documentId: row.fileTask.document_id,
    documentVersionId: row.fileTask.document_version_id,
    parts: row.fileTask.task_parts,
    filename: row.filename ?? '已删除文件',
    executionNo: row.fileTask.execution_no,
    triggerSource: row.fileTask.trigger_source,
    status: genericTask.status,
    stage: (genericTask.current_stage ??
      'queued') as FileProcessingTaskInfo['stage'],
    progress: genericTask.progress,
    processedItems: genericTask.processed_items,
    totalItems: genericTask.total_items,
    errorCode: genericTask.error_code,
    errorMessage: genericTask.error_message,
    retryable:
      row.fileTask.task_parts.includes('content') &&
      retryableStatuses.includes(genericTask.status),
    createdAt: genericTask.create_timestamp,
    startedAt: genericTask.start_timestamp,
    endedAt: genericTask.end_timestamp,
  };
}

/**
 * 去重并校验整体文档任务选择的处理部分。
 *
 * @param parts 调用方希望按顺序执行的内容与预览部分。
 * @returns 保留首次出现顺序的非空部分列表。
 */
function normalizeProcessingParts(
  parts: DocumentProcessingTaskPart[],
): DocumentProcessingTaskPart[] {
  const normalized = [...new Set(parts)];
  if (!normalized.length) {
    throw new Error('DOCUMENT_TASK_PARTS_REQUIRED: 至少选择一个处理部分');
  }
  return normalized;
}
