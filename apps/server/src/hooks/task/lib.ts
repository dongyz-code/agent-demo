import { db, schemas } from '@/database/index.js';
import {
  and,
  count as countSql,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
} from 'drizzle-orm';
import { NdGz } from '@repo/utils-node';

import type { ApiSys } from '@/types/index.js';

const ndGz = new NdGz();
const jsonArrayGzbufferToJson = ndGz.gzBufferToArr.bind(ndGz);

type SqlFilter = ApiSys.TaskSqlFilter;

/**
 * 通用任务主表筛选条件。
 *
 * 查询层领域无关：仅基于 `tasks` 主表字段筛选；`file_name` 等文件域筛选
 * 由 documents 域解析为 `taskIds` 后注入，本函数不直接引用文件表。
 */
function getSqlFilter(form: SqlFilter, taskIds?: string[]) {
  const categories = form.category;
  const statuses = form.status;
  const keys = form.key;
  const stages = form.current_stage;
  const search = form.search?.trim();
  const [createdAfter, createdBefore] = form.create_timestamp ?? [];
  return and(
    categories === undefined
      ? undefined
      : Array.isArray(categories)
        ? inArray(schemas.tasks.task_category, categories)
        : eq(schemas.tasks.task_category, categories),
    statuses === undefined
      ? undefined
      : Array.isArray(statuses)
        ? inArray(schemas.tasks.status, statuses)
        : eq(schemas.tasks.status, statuses),
    search ? ilike(schemas.tasks.search_key, `%${search}%`) : undefined,
    keys === undefined
      ? undefined
      : Array.isArray(keys)
        ? inArray(schemas.tasks.task_key, keys)
        : eq(schemas.tasks.task_key, keys),
    form.trigger_method === undefined
      ? undefined
      : eq(schemas.tasks.trigger_method, form.trigger_method),
    stages === undefined
      ? undefined
      : Array.isArray(stages)
        ? inArray(schemas.tasks.current_stage, stages)
        : eq(schemas.tasks.current_stage, stages),
    form.business_id === undefined
      ? undefined
      : eq(schemas.tasks.business_id, form.business_id),
    form.execution_user_id === undefined
      ? undefined
      : eq(schemas.tasks.execution_user_id, form.execution_user_id),
    taskIds?.length ? inArray(schemas.tasks.task_id, taskIds) : undefined,
    createdAfter
      ? gte(schemas.tasks.create_timestamp, createdAfter)
      : undefined,
    createdBefore
      ? lte(schemas.tasks.create_timestamp, createdBefore)
      : undefined,
  );
}

/** 任务中心状态计数(领域无关 tasks 主表查询)。 */
export async function sqlCounts(
  form: SqlFilter = {},
  taskIds?: string[],
) {
  const data = await db
    .select({ status: schemas.tasks.status, count: countSql() })
    .from(schemas.tasks)
    .where(getSqlFilter(form, taskIds))
    .groupBy(schemas.tasks.status);
  return data.map(({ status, count }) => ({ count, status }));
}

/** 任务中心日志(领域无关 tasks 主表查询)。 */
export async function sqlLogsById(task_id: string) {
  const [item] = await db
    .select({ logs: schemas.tasks.logs })
    .from(schemas.tasks)
    .where(eq(schemas.tasks.task_id, task_id))
    .limit(1);
  return item?.logs
    ? await jsonArrayGzbufferToJson<string>({ buffer: item.logs })
    : null;
}

/** 任务中心列表(领域无关 tasks 主表查询;文件域字段由 documents 域富化)。 */
export async function sqlList({
  limit = [0, 10],
  withCount = false,
  form = {},
  taskIds,
}: {
  limit?: number[];
  withCount?: boolean;
  form?: SqlFilter;
  /** 文件域筛选解析出的 task_id 集合。 */
  taskIds?: string[];
}) {
  const where = getSqlFilter(form, taskIds);

  const getCount = async () => {
    if (withCount) {
      const [row] = await db
        .select({ value: countSql() })
        .from(schemas.tasks)
        .where(where);
      return row?.value ?? 0;
    }
    return 0;
  };

  const [list, count] = await Promise.all([
    db
      .select({
        task_id: schemas.tasks.task_id,
        create_timestamp: schemas.tasks.create_timestamp,
        end_timestamp: schemas.tasks.end_timestamp,
        execution_user_id: schemas.tasks.execution_user_id,
        trigger_method: schemas.tasks.trigger_method,
        start_timestamp: schemas.tasks.start_timestamp,
        status: schemas.tasks.status,
        task_key: schemas.tasks.task_key,
        task_name: schemas.tasks.task_name,
        search_key: schemas.tasks.search_key,
        pending_uuid: schemas.tasks.pending_uuid,
        task_category: schemas.tasks.task_category,
        business_type: schemas.tasks.business_type,
        business_id: schemas.tasks.business_id,
        current_stage: schemas.tasks.current_stage,
        progress: schemas.tasks.progress,
        processed_items: schemas.tasks.processed_items,
        total_items: schemas.tasks.total_items,
        error_code: schemas.tasks.error_code,
        error_message: schemas.tasks.error_message,
        last_update_timestamp: schemas.tasks.last_update_timestamp,
      })
      .from(schemas.tasks)
      .where(where)
      .orderBy(desc(schemas.tasks.create_timestamp))
      .offset(limit[0])
      .limit(limit[1] - limit[0]),
    getCount(),
  ]);

  return { list, count };
}
