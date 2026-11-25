import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { db, schemas } from '@/database/index.js';
import { ROOT_ERROR, logger } from '@/configs/index.js';
import { uuidv7 } from '@/utils/index.js';
import { task } from '@/hooks/tasks/task.js';
import { taskDispatcher } from '@/hooks/tasks/dispatcher.js';
import { normalizeTaskPage } from '@/hooks/tasks/policies.js';
import { nextScheduleDates } from './policy.js';
import {
  enqueueSchedule,
  scheduleHandlers,
  validateHandler,
} from './handlers.js';
import type { ScheduleInfo, ScheduleInput, ScheduleRunInfo } from '@repo/types';
import type { TaskTransaction } from '@/hooks/tasks/types.js';

/** 复用 task 状态判定，重试和排队期间同样占用计划执行权。 */
const activeStatuses = ['queued', 'running', 'retrying'] as const;
/** 触发记录与通用任务只读连接，避免复制执行状态。 */
const runSelection = {
  id: schemas.schedule_runs.id,
  scheduleId: schemas.schedule_runs.schedule_id,
  scheduleName: schemas.schedule_runs.schedule_name,
  trigger: schemas.schedule_runs.trigger,
  plannedAt: schemas.schedule_runs.planned_at,
  taskId: schemas.schedule_runs.task_id,
  message: schemas.schedule_runs.message,
  status: schemas.tasks.status,
  error: schemas.tasks.error_message,
  startedAt: schemas.tasks.start_timestamp,
  finishedAt: schemas.tasks.end_timestamp,
  attempts: schemas.tasks.attempt_count,
};

/**
 * 按触发过滤条件连接任务状态。
 * @param condition 已验证过滤条件。
 * @returns 可继续排序和分页的查询。
 */
function runQuery(condition?: ReturnType<typeof and>) {
  return db
    .select(runSelection)
    .from(schemas.schedule_runs)
    .leftJoin(
      schemas.tasks,
      eq(schemas.tasks.task_id, schemas.schedule_runs.task_id),
    )
    .where(condition);
}
/** 数据库触发记录连接结果。 */
type RunRow = Awaited<ReturnType<typeof runQuery>>[number];

/**
 * 将数据库日期与可空任务转为稳定协议。
 * @param row 查询结果。
 * @returns HTTP 触发快照。
 */
function presentRun(row: RunRow): ScheduleRunInfo {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    scheduleName: row.scheduleName,
    trigger: row.trigger,
    plannedAt: row.plannedAt.toISOString(),
    taskId: row.taskId,
    status: row.status ?? 'skipped',
    message: row.error ?? row.message,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    attempts: row.attempts ?? 0,
  };
}

/**
 * 同事务追加操作审计。
 * @param action 操作名称。
 * @param target 安全资源标识。
 * @param actor 操作用户。
 * @param tx 可选共享事务。
 */
export async function auditMonitor(
  action: string,
  target: string,
  actor: string | null,
  tx: TaskTransaction | typeof db = db,
): Promise<void> {
  await tx.insert(schemas.monitor_audits).values({
    id: uuidv7(),
    actor_id: actor,
    action,
    target,
    created_at: new Date(),
  });
}

/**
 * 将输入归一化并校验，配置错误在保存前报告。
 * @param input 管理请求配置。
 * @returns 下次触发时间。
 */
function validateInput(input: ScheduleInput): Date | null {
  let next: Date;
  try {
    validateHandler(input.handler, input.params);
    next = nextScheduleDates(input.cron, input.timezone)[0]!;
  } catch (error) {
    throw new ROOT_ERROR(
      '非法参数',
      error instanceof Error ? error.message : '计划配置无效',
    );
  }
  if (!input.enabled) return null;
  return next;
}

/**
 * 新增或修改计划；修改时锁行，防止和调度领取互相覆盖。
 * @param input 完整配置。
 * @param actor 操作人。
 * @returns 持久标识。
 */
export async function saveSchedule(
  input: ScheduleInput,
  actor: string,
): Promise<{ id: string }> {
  const next = validateInput(input);
  const id = input.id ?? uuidv7();
  await db.transaction(async (tx) => {
    if (input.id) {
      const [old] = await tx
        .select()
        .from(schemas.schedules)
        .where(
          and(
            eq(schemas.schedules.id, id),
            eq(schemas.schedules.deleted, false),
          ),
        )
        .for('update');
      if (!old) throw new ROOT_ERROR('定时任务不存在');
    }
    const data = {
      name: input.name.trim(),
      handler: input.handler,
      cron: input.cron.trim(),
      timezone: input.timezone,
      enabled: input.enabled,
      params: input.params,
      description: input.description,
      next_run_at: next,
      updated_at: new Date(),
    };
    if (input.id)
      await tx
        .update(schemas.schedules)
        .set(data)
        .where(eq(schemas.schedules.id, id));
    else
      await tx
        .insert(schemas.schedules)
        .values({ ...data, id, created_at: new Date() });
    await auditMonitor('schedule.save', id, actor, tx);
  });
  return { id };
}

/**
 * 事务锁下获取未删除计划。
 * @param tx 当前事务。
 * @param id 计划标识。
 * @returns 计划行。
 */
async function lockedSchedule(tx: TaskTransaction, id: string) {
  const [plan] = await tx
    .select()
    .from(schemas.schedules)
    .where(
      and(eq(schemas.schedules.id, id), eq(schemas.schedules.deleted, false)),
    )
    .for('update');
  if (!plan) throw new ROOT_ERROR('定时任务不存在');
  return plan;
}

/**
 * 持久启停或软删除，保留历史并不取消已提交任务。
 * @param id 计划标识。
 * @param enabled 启停意愿。
 * @param actor 操作人。
 * @param remove 是否软删除。
 */
export async function toggleSchedule(
  id: string,
  enabled: boolean,
  actor: string,
  remove = false,
): Promise<void> {
  await db.transaction(async (tx) => {
    const plan = await lockedSchedule(tx, id);
    let next: Date | null = null;
    if (enabled && !remove)
      next = nextScheduleDates(plan.cron, plan.timezone)[0]!;
    await tx
      .update(schemas.schedules)
      .set({
        enabled,
        deleted: remove,
        next_run_at: next,
        updated_at: new Date(),
      })
      .where(eq(schemas.schedules.id, id));
    let action = 'schedule.toggle';
    if (remove) action = 'schedule.remove';
    await auditMonitor(action, id, actor, tx);
  });
}

/**
 * 检查计划是否有活动任务，调用方须持有同一计划行锁。
 * @param tx 当前事务。
 * @param id 计划标识。
 * @returns 是否仍有活动执行。
 */
async function hasActive(
  tx: TaskTransaction | typeof db,
  id: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: schemas.tasks.task_id })
    .from(schemas.schedule_runs)
    .innerJoin(
      schemas.tasks,
      eq(schemas.tasks.task_id, schemas.schedule_runs.task_id),
    )
    .where(
      and(
        eq(schemas.schedule_runs.schedule_id, id),
        inArray(schemas.tasks.status, [...activeStatuses]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * 人工触发和自动触发持有同一行锁，客户端重试使用 requestId 幂等。
 * @param id 计划标识。
 * @param requestId 一次操作的唯一标识。
 * @param actor 操作人。
 * @returns 创建或已有任务标识。
 */
export async function runSchedule(
  id: string,
  requestId: string,
  actor: string,
): Promise<{ taskId: string }> {
  const taskId = await db.transaction(async (tx) => {
    const plan = await lockedSchedule(tx, id);
    const [existing] = await tx
      .select()
      .from(schemas.schedule_runs)
      .where(
        and(
          eq(schemas.schedule_runs.schedule_id, id),
          eq(schemas.schedule_runs.trigger, 'manual'),
          eq(schemas.schedule_runs.dedupe_key, requestId),
        ),
      );
    if (existing?.task_id) return existing.task_id;
    if (await hasActive(tx, id))
      throw new ROOT_ERROR(
        '定时任务正在执行',
        '计划已有排队、执行或重试中的任务',
      );
    const now = new Date();
    const taskId = await enqueueSchedule(plan.handler, plan.params, {
      actorUserId: actor,
      title: plan.name,
      correlationId: `schedule:${id}`,
      transaction: tx,
    });
    await tx.insert(schemas.schedule_runs).values({
      id: uuidv7(),
      schedule_id: id,
      schedule_name: plan.name,
      trigger: 'manual',
      dedupe_key: requestId,
      planned_at: now,
      task_id: taskId,
      created_at: now,
    });
    await auditMonitor('schedule.run', id, actor, tx);
    return taskId;
  });
  taskDispatcher.notify();
  return { taskId };
}

/**
 * 领取最多 50 个到期计划，锁行、入队、触发记录和推进时间在同一事务。
 * @param now 统一计算时钟，测试可注入。
 * @returns 本轮入队数量。
 */
export async function tickSchedules(now = new Date()): Promise<number> {
  const enqueued = await db.transaction(async (tx) => {
    const plans = await tx
      .select()
      .from(schemas.schedules)
      .where(
        and(
          eq(schemas.schedules.enabled, true),
          eq(schemas.schedules.deleted, false),
          lte(schemas.schedules.next_run_at, now),
        ),
      )
      .orderBy(schemas.schedules.next_run_at)
      .limit(50)
      .for('update', { skipLocked: true });
    let enqueued = 0;
    for (const plan of plans) {
      const plannedAt = plan.next_run_at!;
      let message: string | null = null;
      let taskId: string | null = null;
      let next: Date | null = null;
      try {
        validateHandler(plan.handler, plan.params);
        next = nextScheduleDates(plan.cron, plan.timezone, now, 1)[0]!;
        if (now.getTime() - plannedAt.getTime() > 5000)
          message = '错过计划时间，按停机不补跑策略跳过';
      } catch {
        next = null;
        message = '处理器或计划配置已失效，已自动停用，请检查配置';
      }
      if (!message && (await hasActive(tx, plan.id)))
        message = '上一次任务尚未结束，本次触发跳过';
      // 数据库与入队错误不能作为配置错误吞掉，必须回滚领取和时间推进。
      if (!message) {
        taskId = await enqueueSchedule(plan.handler, plan.params, {
          actorUserId: null,
          title: plan.name,
          correlationId: `schedule:${plan.id}`,
          transaction: tx,
        });
        enqueued += 1;
      }
      await tx.insert(schemas.schedule_runs).values({
        id: uuidv7(),
        schedule_id: plan.id,
        schedule_name: plan.name,
        trigger: 'scheduled',
        dedupe_key: plannedAt.toISOString(),
        planned_at: plannedAt,
        task_id: taskId,
        message,
        created_at: now,
      });
      await tx
        .update(schemas.schedules)
        .set({ next_run_at: next, enabled: next !== null, updated_at: now })
        .where(eq(schemas.schedules.id, plan.id));
    }
    return enqueued;
  });
  if (enqueued) taskDispatcher.notify();
  return enqueued;
}

/**
 * 查询计划和全局摘要，列表分页上限沿用任务中心。
 * @param input 名称、启停与分页。
 * @returns 配置与最近状态。
 */
export async function listSchedules(input: {
  search?: string;
  enabled?: boolean;
  limit?: number[];
}) {
  const conditions = [eq(schemas.schedules.deleted, false)];
  if (input.search)
    conditions.push(ilike(schemas.schedules.name, `%${input.search}%`));
  if (input.enabled !== undefined)
    conditions.push(eq(schemas.schedules.enabled, input.enabled));
  const page = normalizeTaskPage(input.limit);
  const [plans, totals, all, enabled, active, failed] = await Promise.all([
    db
      .select()
      .from(schemas.schedules)
      .where(and(...conditions))
      .orderBy(desc(schemas.schedules.created_at))
      .limit(page.size)
      .offset(page.offset),
    db
      .select({ count: count() })
      .from(schemas.schedules)
      .where(and(...conditions)),
    db
      .select({ count: count() })
      .from(schemas.schedules)
      .where(eq(schemas.schedules.deleted, false)),
    db
      .select({ count: count() })
      .from(schemas.schedules)
      .where(
        and(
          eq(schemas.schedules.deleted, false),
          eq(schemas.schedules.enabled, true),
        ),
      ),
    db
      .select({
        count: sql<number>`count(distinct ${schemas.schedule_runs.schedule_id})::int`,
      })
      .from(schemas.schedule_runs)
      .innerJoin(
        schemas.tasks,
        eq(schemas.tasks.task_id, schemas.schedule_runs.task_id),
      )
      .where(inArray(schemas.tasks.status, [...activeStatuses])),
    db
      .select({ count: count() })
      .from(schemas.schedule_runs)
      .innerJoin(
        schemas.tasks,
        eq(schemas.tasks.task_id, schemas.schedule_runs.task_id),
      )
      .where(
        and(
          gte(schemas.tasks.end_timestamp, new Date(Date.now() - 86_400_000)),
          inArray(schemas.tasks.status, ['failed', 'timed_out']),
        ),
      ),
  ]);
  const ids = plans.map((plan) => plan.id);
  // 当前页批量读取最近触发与活动计划，避免列表产生每行两次查询。
  const latest = new Map<string, RunRow>();
  const activeIds = new Set<string>();
  if (ids.length) {
    const [recentRows, activeRows] = await Promise.all([
      db
        .selectDistinctOn([schemas.schedule_runs.schedule_id], runSelection)
        .from(schemas.schedule_runs)
        .leftJoin(
          schemas.tasks,
          eq(schemas.tasks.task_id, schemas.schedule_runs.task_id),
        )
        .where(inArray(schemas.schedule_runs.schedule_id, ids))
        .orderBy(
          schemas.schedule_runs.schedule_id,
          desc(schemas.schedule_runs.planned_at),
          desc(schemas.schedule_runs.id),
        ),
      db
        .selectDistinct({ id: schemas.schedule_runs.schedule_id })
        .from(schemas.schedule_runs)
        .innerJoin(
          schemas.tasks,
          eq(schemas.tasks.task_id, schemas.schedule_runs.task_id),
        )
        .where(
          and(
            inArray(schemas.schedule_runs.schedule_id, ids),
            inArray(schemas.tasks.status, [...activeStatuses]),
          ),
        ),
    ]);
    for (const row of recentRows) latest.set(row.scheduleId, row);
    for (const row of activeRows) activeIds.add(row.id);
  }
  const list: ScheduleInfo[] = plans.map((plan) => {
    const recent = latest.get(plan.id);
    let lastRun: ScheduleRunInfo | null = null;
    if (recent) lastRun = presentRun(recent);
    return {
      id: plan.id,
      name: plan.name,
      handler: plan.handler,
      handlerLabel:
        scheduleHandlers.find((item) => item.key === plan.handler)?.label ??
        '处理器已下线',
      cron: plan.cron,
      timezone: plan.timezone,
      enabled: plan.enabled,
      params: plan.params,
      description: plan.description,
      nextRunAt: plan.next_run_at?.toISOString() ?? null,
      active: activeIds.has(plan.id),
      lastRun,
    };
  });
  return {
    list,
    count: totals[0]?.count ?? 0,
    summary: {
      total: all[0]?.count ?? 0,
      enabled: enabled[0]?.count ?? 0,
      active: active[0]?.count ?? 0,
      failed24h: failed[0]?.count ?? 0,
    },
  };
}

/**
 * 过滤触发台账，查询任务实际状态而不是内存快照。
 * @param input 搜索、状态、时间和分页。
 * @returns 当前页及匹配总数。
 */
export async function listScheduleRuns(input: {
  scheduleId?: string;
  search?: string;
  status?: string;
  trigger?: string;
  from?: string;
  to?: string;
  limit?: number[];
}) {
  const filters = [];
  if (input.scheduleId)
    filters.push(eq(schemas.schedule_runs.schedule_id, input.scheduleId));
  if (input.search)
    filters.push(
      ilike(schemas.schedule_runs.schedule_name, `%${input.search}%`),
    );
  if (input.status === 'skipped')
    filters.push(sql`${schemas.schedule_runs.task_id} is null`);
  else if (input.status)
    filters.push(sql`${schemas.tasks.status} = ${input.status}`);
  if (input.trigger)
    filters.push(sql`${schemas.schedule_runs.trigger} = ${input.trigger}`);
  if (input.from)
    filters.push(gte(schemas.schedule_runs.planned_at, new Date(input.from)));
  if (input.to)
    filters.push(lte(schemas.schedule_runs.planned_at, new Date(input.to)));
  const condition = and(...filters);
  const page = normalizeTaskPage(input.limit);
  const [rows, totals] = await Promise.all([
    runQuery(condition)
      .orderBy(
        desc(schemas.schedule_runs.planned_at),
        desc(schemas.schedule_runs.id),
      )
      .limit(page.size)
      .offset(page.offset),
    db
      .select({ count: count() })
      .from(schemas.schedule_runs)
      .leftJoin(
        schemas.tasks,
        eq(schemas.tasks.task_id, schemas.schedule_runs.task_id),
      )
      .where(condition),
  ]);
  return { list: rows.map(presentRun), count: totals[0]?.count ?? 0 };
}

/**
 * 仅通过触发标识访问其关联任务，防止借监控权限查看其他业务任务。
 * @param id 触发标识。
 * @returns 触发、任务与结构化日志。
 */
export async function scheduleRunDetail(id: string) {
  const [row] = await runQuery(eq(schemas.schedule_runs.id, id)).limit(1);
  if (!row) throw new ROOT_ERROR('定时任务不存在', '执行记录不存在');
  if (!row.taskId) return { run: presentRun(row), task: null, logs: [] };
  const [detail, logs] = await Promise.all([
    task.get(row.taskId),
    task.logs(row.taskId),
  ]);
  return { run: presentRun(row), task: detail, logs };
}

/** 分批删除 30 天前已终结的调度执行与日志；活动任务永远保留。 */
async function pruneHistory(): Promise<void> {
  const before = new Date(Date.now() - 30 * 86_400_000);
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: schemas.schedule_runs.id,
        taskId: schemas.schedule_runs.task_id,
      })
      .from(schemas.schedule_runs)
      .leftJoin(
        schemas.tasks,
        eq(schemas.tasks.task_id, schemas.schedule_runs.task_id),
      )
      .where(
        and(
          lt(schemas.schedule_runs.planned_at, before),
          or(
            sql`${schemas.schedule_runs.task_id} is null`,
            and(
              isNotNull(schemas.tasks.end_timestamp),
              lt(schemas.tasks.end_timestamp, before),
            ),
          ),
        ),
      )
      .limit(100);
    const taskIds = rows.flatMap((row) => (row.taskId ? [row.taskId] : []));
    if (taskIds.length) {
      await tx
        .delete(schemas.task_logs)
        .where(inArray(schemas.task_logs.task_id, taskIds));
      await tx
        .delete(schemas.task_attempts)
        .where(inArray(schemas.task_attempts.task_id, taskIds));
      await tx
        .delete(schemas.tasks)
        .where(inArray(schemas.tasks.task_id, taskIds));
    }
    if (rows.length)
      await tx.delete(schemas.schedule_runs).where(
        inArray(
          schemas.schedule_runs.id,
          rows.map((row) => row.id),
        ),
      );
    // 审计按同样的批次预算保留 90 天。
    const audits = await tx
      .select({ id: schemas.monitor_audits.id })
      .from(schemas.monitor_audits)
      .where(
        lt(
          schemas.monitor_audits.created_at,
          new Date(Date.now() - 90 * 86_400_000),
        ),
      )
      .limit(100);
    if (audits.length)
      await tx.delete(schemas.monitor_audits).where(
        inArray(
          schemas.monitor_audits.id,
          audits.map((row) => row.id),
        ),
      );
  });
}

/** 当前进程只保留轮询标识，所有业务状态均在数据库。 */
let timer: ReturnType<typeof setInterval> | undefined;
/** 防止同一进程重复轮询，跨实例通过数据库行锁协调。 */
let ticking = false;
/** 最近一次历史清理时间。 */
let lastPrunedAt = 0;

/** 启动幂等种子与轮询；已有配置和删除意愿绝不覆盖。 */
export async function startSchedules(): Promise<void> {
  if (timer) return;
  const now = new Date();
  await db
    .insert(schemas.schedules)
    .values({
      id: 'builtin.upload.cleanup',
      name: '上传过期清理',
      handler: 'upload.cleanup',
      cron: '*/10 * * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
      params: {},
      description: '回收过期上传会话与临时对象',
      next_run_at: nextScheduleDates('*/10 * * * *', 'Asia/Shanghai')[0]!,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing();
  timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void (async () => {
      await tickSchedules();
      if (Date.now() - lastPrunedAt > 60_000) {
        await pruneHistory();
        lastPrunedAt = Date.now();
      }
    })()
      .catch((error: unknown) =>
        logger.error(
          { event: 'schedule.tick_failed', err: error },
          '计划调度失败，将在下一轮重试',
        ),
      )
      .finally(() => {
        ticking = false;
      });
  }, 1000);
  timer.unref();
}

/** 停止轮询，不取消已入队任务，供优雅关闭和集成验证使用。 */
export function stopSchedules(): void {
  clearInterval(timer);
  timer = undefined;
}
