import { and, desc, eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';

import type {
  FileProcessingTaskDetail,
  FileProcessingTaskInfo,
} from '@repo/types';

/**
 * 查询文档处理任务详情及阶段时间线。
 *
 * @param taskId 通用任务标识。
 * @returns 文件、知识库、状态、结果摘要和阶段执行记录。
 */
export async function getFileProcessingTask(
  taskId: string,
): Promise<FileProcessingTaskDetail> {
  const [row] = await selectTaskRows(
    and(eq(schema.tasks.task_id, taskId)),
  ).limit(1);
  if (!row) {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'FILE_PROCESSING_TASK_NOT_FOUND: 文件处理任务不存在',
    );
  }
  const stageRuns = await db
    .select()
    .from(schema.file_processing_task_stage_runs)
    .where(eq(schema.file_processing_task_stage_runs.task_id, taskId))
    .orderBy(
      schema.file_processing_task_stage_runs.start_timestamp,
      schema.file_processing_task_stage_runs.attempt,
    );
  return {
    ...toTaskInfo(row),
    processingConfigVersion: row.fileTask.processing_config_version,
    resultSummary: row.fileTask.result_summary
      ? (JSON.parse(row.fileTask.result_summary) as Record<string, unknown>)
      : null,
    stageRuns: stageRuns.map((stage) => ({
      stage: stage.stage,
      attempt: stage.attempt,
      status: stage.status as FileProcessingTaskInfo['status'],
      processedItems: stage.processed_items,
      totalItems: stage.total_items,
      errorCode: stage.error_code,
      errorMessage: stage.error_message,
      startedAt: stage.start_timestamp,
      endedAt: stage.end_timestamp,
    })),
  };
}

/** 构造任务、源文件、知识库和文档任务扩展的联合查询。 */
function selectTaskRows(where: ReturnType<typeof and>) {
  return db
    .select({
      task: schema.tasks,
      fileTask: schema.file_processing_tasks,
      file: schema.files,
      dataset: schema.rag_datasets,
    })
    .from(schema.file_processing_tasks)
    .innerJoin(
      schema.tasks,
      eq(schema.tasks.task_id, schema.file_processing_tasks.task_id),
    )
    .innerJoin(
      schema.files,
      eq(schema.files.file_id, schema.file_processing_tasks.file_id),
    )
    .leftJoin(
      schema.rag_datasets,
      eq(
        schema.rag_datasets.dataset_id,
        schema.file_processing_tasks.dataset_id,
      ),
    )
    .where(where)
    .orderBy(desc(schema.tasks.create_timestamp));
}

/** 将数据库联合行转换为任务中心公共摘要。 */
function toTaskInfo(
  row: Awaited<ReturnType<typeof selectTaskRows>>[number],
): FileProcessingTaskInfo {
  return {
    taskId: row.task.task_id,
    documentId: row.fileTask.document_id!,
    documentVersionId: row.fileTask.document_version_id!,
    taskType: row.fileTask.task_type,
    filename: row.file.filename,
    datasetId: row.fileTask.dataset_id,
    datasetName: row.dataset?.name ?? null,
    executionNo: row.fileTask.execution_no,
    triggerSource: row.fileTask.trigger_source,
    status: row.task.status as FileProcessingTaskInfo['status'],
    stage: (row.task.current_stage ??
      'queued') as FileProcessingTaskInfo['stage'],
    progress: row.task.progress,
    processedItems: row.task.processed_items,
    totalItems: row.task.total_items,
    errorCode: row.task.error_code,
    errorMessage: row.task.error_message,
    retryable: ['failed', 'completed'].includes(row.task.status),
    createdAt: row.task.create_timestamp,
    startedAt: row.task.start_timestamp,
    endedAt: row.task.end_timestamp,
  };
}
