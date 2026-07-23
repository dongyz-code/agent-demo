import { eq, ilike, inArray } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';

import type { FileProcessingTriggerSource } from '@repo/types';

/** 任务中心展示的文档处理任务摘要（供 tasks 主表列表富化）。 */
export interface FileTaskCenterInfo {
  /** 被处理文件标识。 */
  file_id: string;
  /** 文件显示名称。 */
  filename: string;
  /** 同一文件的执行序号。 */
  execution_no: number;
  /** 任务创建来源。 */
  trigger_source: FileProcessingTriggerSource;
  /** 预览转换或版本内容处理配置。 */
  processing_config_version: string;
}

/**
 * 按文件名筛选文件处理任务 ID。
 *
 * 任务中心主表查询领域无关，文件域筛选条件由本函数解析为 task_id 集合后注入。
 */
export async function findFileProcessingTaskIds(filter: {
  /** 文件名关键词。 */
  file_name?: string;
}): Promise<string[]> {
  const rows = await db
    .select({ task_id: schemas.file_processing_tasks.task_id })
    .from(schemas.file_processing_tasks)
    .innerJoin(
      schemas.files,
      eq(schemas.files.file_id, schemas.file_processing_tasks.file_id),
    )
    .where(
      filter.file_name?.trim()
        ? ilike(schemas.files.filename, `%${filter.file_name.trim()}%`)
        : undefined,
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
      task_id: schemas.file_processing_tasks.task_id,
      file_id: schemas.file_processing_tasks.file_id,
      filename: schemas.files.filename,
      execution_no: schemas.file_processing_tasks.execution_no,
      trigger_source: schemas.file_processing_tasks.trigger_source,
      processing_config_version:
        schemas.file_processing_tasks.processing_config_version,
    })
    .from(schemas.file_processing_tasks)
    .leftJoin(
      schemas.files,
      eq(schemas.files.file_id, schemas.file_processing_tasks.file_id),
    )
    .where(inArray(schemas.file_processing_tasks.task_id, taskIds));
  return new Map(
    rows.map((row) => [
      row.task_id,
      {
        file_id: row.file_id,
        filename: row.filename ?? '',
        execution_no: row.execution_no,
        trigger_source: row.trigger_source,
        processing_config_version: row.processing_config_version ?? '',
      },
    ]),
  );
}
