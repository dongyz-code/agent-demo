import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  sql,
} from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
import { toStoredFileInfo } from './file-service.js';

import type {
  FileProcessingStage,
  ManagedFileInfo,
  ManagedFileTaskSummary,
  StoredFileStatus,
  TaskStatus,
} from '@repo/types';
import type { UploadActor as FileActor } from '../upload/index.js';

/** 查询文件管理页面需要的文件基础信息和任务摘要。 */
export async function listManagedFiles(
  form: {
    /** 文件名关键词。 */
    search?: string;
    /** 文件可信状态筛选。 */
    status?: StoredFileStatus[];
    /** 文件处理任务状态筛选。 */
    processingStatus?: TaskStatus[];
    /** 目标知识库筛选。 */
    datasetId?: string;
    /** 文件创建时间范围。 */
    createdAt?: (Date | null)[];
    /** 左闭右开的分页范围。 */
    limit?: number[];
    /** 是否返回总数。 */
    withCount?: boolean;
  },
  actor: FileActor,
) {
  const [start = 0, end = 20] = form.limit ?? [];
  const [createdStart, createdEnd] = form.createdAt ?? [];
  const processingFilter = form.processingStatus?.length
    ? sql`exists (
        select 1
        from file_processing_tasks fpt
        inner join tasks t on t.task_id = fpt.task_id
        where fpt.file_id = ${schema.files.file_id}
          and t.status in (${sql.join(
            form.processingStatus.map((status) => sql`${status}`),
            sql`, `,
          )})
      )`
    : undefined;
  const datasetFilter = form.datasetId
    ? sql`exists (
        select 1
        from file_processing_tasks fpt
        where fpt.file_id = ${schema.files.file_id}
          and fpt.dataset_id = ${form.datasetId}
      )`
    : undefined;
  const where = and(
    eq(schema.files.tenant_id, actor.tenantId),
    eq(schema.files.create_user_id, actor.userId),
    ne(schema.files.status, 'deleted'),
    form.search?.trim()
      ? ilike(schema.files.filename, `%${form.search.trim()}%`)
      : undefined,
    form.status?.length ? inArray(schema.files.status, form.status) : undefined,
    createdStart ? gte(schema.files.create_timestamp, createdStart) : undefined,
    createdEnd ? lte(schema.files.create_timestamp, createdEnd) : undefined,
    processingFilter,
    datasetFilter,
  );
  const [files, count] = await Promise.all([
    db
      .select()
      .from(schema.files)
      .where(where)
      .orderBy(desc(schema.files.create_timestamp))
      .offset(start)
      .limit(Math.max(0, end - start)),
    form.withCount ? countRows(schema.files, where) : Promise.resolve(0),
  ]);
  if (!files.length) return { list: [], count };

  const fileIds = files.map((file) => file.file_id);
  const [taskRows, sessions] = await Promise.all([
    db
      .select({
        task: schema.tasks,
        fileTask: schema.file_processing_tasks,
        dataset: schema.rag_datasets,
      })
      .from(schema.file_processing_tasks)
      .innerJoin(
        schema.tasks,
        eq(schema.tasks.task_id, schema.file_processing_tasks.task_id),
      )
      .leftJoin(
        schema.rag_datasets,
        eq(
          schema.rag_datasets.dataset_id,
          schema.file_processing_tasks.dataset_id,
        ),
      )
      .where(inArray(schema.file_processing_tasks.file_id, fileIds))
      .orderBy(desc(schema.tasks.create_timestamp)),
    db
      .select({
        fileId: schema.file_upload_sessions.file_id,
        enterRag: schema.file_upload_sessions.enter_rag,
      })
      .from(schema.file_upload_sessions)
      .where(inArray(schema.file_upload_sessions.file_id, fileIds)),
  ]);
  const sessionsByFile = new Map(
    sessions.map((session) => [session.fileId, session.enterRag]),
  );
  const tasksByFile = new Map<string, typeof taskRows>();
  for (const row of taskRows) {
    const list = tasksByFile.get(row.fileTask.file_id) ?? [];
    list.push(row);
    tasksByFile.set(row.fileTask.file_id, list);
  }

  return {
    list: files.map((file): ManagedFileInfo => {
      const rows = tasksByFile.get(file.file_id) ?? [];
      const summaries = rows.map(toTaskSummary);
      const datasets = new Map<string, string>();
      for (const row of rows) {
        if (row.fileTask.dataset_id && row.dataset) {
          datasets.set(row.fileTask.dataset_id, row.dataset.name);
        }
      }
      return {
        ...toStoredFileInfo(file),
        enterRag: sessionsByFile.get(file.file_id) ?? rows.length > 0,
        activeTask:
          summaries.find((task) =>
            ['to-be-started', 'pending'].includes(task.status),
          ) ?? null,
        latestTask: summaries[0] ?? null,
        executionCount: summaries.length,
        lastSuccessfulTask:
          summaries.find((task) => task.status === 'completed') ?? null,
        datasets: [...datasets].map(([datasetId, name]) => ({
          datasetId,
          name,
        })),
      };
    }),
    count,
  };
}

/** 转换文件任务联合行为列表摘要。 */
function toTaskSummary(row: {
  task: typeof schema.tasks.$inferSelect;
  fileTask: typeof schema.file_processing_tasks.$inferSelect;
  dataset: typeof schema.rag_datasets.$inferSelect | null;
}): ManagedFileTaskSummary {
  return {
    taskId: row.task.task_id,
    executionNo: row.fileTask.execution_no,
    status: row.task.status,
    stage: (row.task.current_stage ?? 'queued') as FileProcessingStage,
    progress: row.task.progress,
    triggerSource: row.fileTask.trigger_source,
    datasetId: row.fileTask.dataset_id,
    datasetName: row.dataset?.name ?? null,
    createdAt: row.task.create_timestamp,
  };
}
