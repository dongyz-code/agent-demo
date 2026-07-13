import {
  db,
  listFilter,
  rangeFilter,
  schema,
  searchFilter,
  whereAll,
} from '@/database/index.js';
import { and, count as countSql, desc, eq, inArray } from 'drizzle-orm';
import { NdGz } from '@repo/utils-node';

import type { ApiSys } from '@/types/index.js';

const ndGz = new NdGz();
const jsonArrayGzbufferToJson = ndGz.gzBufferToArr.bind(ndGz);

type SqlFilter = ApiSys.TaskSqlFilter;

/** 任务中心列表的可见范围。 */
type Visibility = { userId?: string; tenantId?: string };

/**
 * 通用任务主表筛选条件。
 *
 * 查询层领域无关:仅基于 `tasks` 主表字段筛选;`file_name`/`dataset_id` 等
 * 文件域筛选由 documents 域解析为 `taskIds` 后注入,本函数不直接引用文件表。
 */
function getSqlFilter(
  form: SqlFilter,
  visibility: Visibility = {},
  taskIds?: string[],
) {
  return whereAll(
    listFilter(schema.tasks.task_category, form.category),
    listFilter(schema.tasks.status, form.status),
    searchFilter(form.search?.trim(), [schema.tasks.search_key]),
    listFilter(schema.tasks.task_key, form.key),
    listFilter(schema.tasks.trigger_method, form.trigger_method),
    listFilter(schema.tasks.current_stage, form.current_stage),
    listFilter(schema.tasks.business_id, form.business_id),
    listFilter(schema.tasks.execution_user_id, form.execution_user_id),
    visibility.userId
      ? eq(schema.tasks.execution_user_id, visibility.userId)
      : undefined,
    visibility.tenantId
      ? eq(schema.tasks.tenant_id, visibility.tenantId)
      : undefined,
    taskIds?.length ? inArray(schema.tasks.task_id, taskIds) : undefined,
    rangeFilter(schema.tasks.create_timestamp, form.create_timestamp),
  );
}

/** 任务中心状态计数(领域无关 tasks 主表查询)。 */
export async function sqlCounts(
  form: SqlFilter = {},
  visibility: Visibility = {},
  taskIds?: string[],
) {
  const data = await db
    .select({ status: schema.tasks.status, count: countSql() })
    .from(schema.tasks)
    .where(getSqlFilter(form, visibility, taskIds))
    .groupBy(schema.tasks.status);
  return data.map(({ status, count }) => ({ count, status }));
}

/** 任务中心日志(领域无关 tasks 主表查询)。 */
export async function sqlLogsById(
  task_id: string,
  visibility: Visibility = {},
) {
  if (visibility.userId || visibility.tenantId) {
    const [visible] = await db
      .select({ taskId: schema.tasks.task_id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.task_id, task_id),
          visibility.userId
            ? eq(schema.tasks.execution_user_id, visibility.userId)
            : undefined,
          visibility.tenantId
            ? eq(schema.tasks.tenant_id, visibility.tenantId)
            : undefined,
        ),
      )
      .limit(1);
    if (!visible) return null;
  }
  const [item] = await db
    .select({ logs: schema.tasks.logs })
    .from(schema.tasks)
    .where(eq(schema.tasks.task_id, task_id))
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
  visibility,
  taskIds,
}: {
  limit?: number[];
  withCount?: boolean;
  form?: SqlFilter;
  /** 非系统管理员使用的用户或租户任务范围。 */
  visibility?: Visibility;
  /** 文件域筛选解析出的 task_id 集合。 */
  taskIds?: string[];
}) {
  const where = getSqlFilter(form, visibility, taskIds);

  const getCount = async () => {
    if (withCount) {
      const [row] = await db
        .select({ value: countSql() })
        .from(schema.tasks)
        .where(where);
      return row?.value ?? 0;
    }
    return 0;
  };

  const [list, count] = await Promise.all([
    db
      .select({
        task_id: schema.tasks.task_id,
        create_timestamp: schema.tasks.create_timestamp,
        end_timestamp: schema.tasks.end_timestamp,
        execution_user_id: schema.tasks.execution_user_id,
        trigger_method: schema.tasks.trigger_method,
        start_timestamp: schema.tasks.start_timestamp,
        status: schema.tasks.status,
        task_key: schema.tasks.task_key,
        task_name: schema.tasks.task_name,
        search_key: schema.tasks.search_key,
        pending_uuid: schema.tasks.pending_uuid,
        tenant_id: schema.tasks.tenant_id,
        task_category: schema.tasks.task_category,
        business_type: schema.tasks.business_type,
        business_id: schema.tasks.business_id,
        current_stage: schema.tasks.current_stage,
        progress: schema.tasks.progress,
        processed_items: schema.tasks.processed_items,
        total_items: schema.tasks.total_items,
        error_code: schema.tasks.error_code,
        error_message: schema.tasks.error_message,
        last_update_timestamp: schema.tasks.last_update_timestamp,
      })
      .from(schema.tasks)
      .where(where)
      .orderBy(desc(schema.tasks.create_timestamp))
      .offset(limit[0])
      .limit(limit[1] - limit[0]),
    getCount(),
  ]);

  return { list, count };
}
