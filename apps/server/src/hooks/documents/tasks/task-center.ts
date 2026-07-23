import { and, eq, inArray } from 'drizzle-orm';

import { db, schema, searchFilter } from '@/database/index.js';

import type { FileProcessingTriggerSource } from '@repo/types';

/** 任务中心展示的文档处理任务摘要（供 tasks 主表列表富化）。 */
export interface FileTaskCenterInfo {
  /** 被处理文件标识。 */
  file_id: string;
  /** 文件显示名称。 */
  filename: string;
  /** 目标知识库标识。 */
  dataset_id: string | null;
  /** 目标知识库名称。 */
  dataset_name: string | null;
  /** 同一文件的执行序号。 */
  execution_no: number;
  /** 任务创建来源。 */
  trigger_source: FileProcessingTriggerSource;
  /** 处理配置组合版本。 */
  processing_config_version: string;
}

/**
 * 按文件名或目标知识库筛选文件处理任务 ID。
 *
 * 任务中心主表查询领域无关，文件域筛选条件由本函数解析为 task_id 集合后注入。
 */
export async function findFileProcessingTaskIds(filter: {
  /** 文件名关键词。 */
  file_name?: string;
  /** 目标知识库标识。 */
  dataset_id?: string;
}): Promise<string[]> {
  const rows = await db
    .select({ task_id: schema.file_processing_tasks.task_id })
    .from(schema.file_processing_tasks)
    .innerJoin(
      schema.files,
      eq(schema.files.file_id, schema.file_processing_tasks.file_id),
    )
    .where(
      and(
        filter.file_name?.trim()
          ? searchFilter(filter.file_name.trim(), [schema.files.filename])
          : undefined,
        filter.dataset_id
          ? eq(schema.file_processing_tasks.dataset_id, filter.dataset_id)
          : undefined,
      ),
    );
  return rows.map((row) => row.task_id);
}

/** 按 task_id 批量富化文件处理任务摘要(供任务中心列表展示)。 */
export async function enrichFileTaskList(
  taskIds: string[],
): Promise<Map<string, FileTaskCenterInfo>> {
  if (!taskIds.length) return new Map();
  const rows = await db
    .select({
      task_id: schema.file_processing_tasks.task_id,
      file_id: schema.file_processing_tasks.file_id,
      filename: schema.files.filename,
      dataset_id: schema.file_processing_tasks.dataset_id,
      dataset_name: schema.rag_datasets.name,
      execution_no: schema.file_processing_tasks.execution_no,
      trigger_source: schema.file_processing_tasks.trigger_source,
      processing_config_version:
        schema.file_processing_tasks.processing_config_version,
    })
    .from(schema.file_processing_tasks)
    .leftJoin(
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
    .where(inArray(schema.file_processing_tasks.task_id, taskIds));
  return new Map(
    rows.map((row) => [
      row.task_id,
      {
        file_id: row.file_id,
        filename: row.filename ?? '',
        dataset_id: row.dataset_id,
        dataset_name: row.dataset_name,
        execution_no: row.execution_no,
        trigger_source: row.trigger_source,
        processing_config_version: row.processing_config_version ?? '',
      },
    ]),
  );
}
