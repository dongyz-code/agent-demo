import { createHash } from 'node:crypto';
import { Cron } from 'croner';
import { Client } from 'pg';
import { and, eq, sql } from 'drizzle-orm';
import { ROOT, logger } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import type { TaskTransaction } from '@/hooks/tasks/types.js';

/** Croner 回调只负责提交指定计划的本次触发，业务执行交给任务中心。 */
type ScheduleTrigger = (
  /** 计划持久标识。 */
  id: string,
  /** 创建计时器时的表达式，用于拒绝过期回调。 */
  cron: string,
  /** 创建计时器时的时区。 */
  timezone: string,
  /** Croner 原先安排的触发时间，不使用回调延迟后的当前时间去重。 */
  plannedAt: Date,
) => Promise<number>;

/** 一个启用计划对应一个 Croner 实例。 */
interface ScheduledJob {
  /** 判断修改表达式后是否需要替换计时器。 */
  cron: string;
  /** 判断修改时区后是否需要替换计时器。 */
  timezone: string;
  /** 由 Croner 管理下一次触发和计时器生命周期。 */
  job: Cron;
}

/** 按数据库 schema 隔离配置通知，避免共享数据库的不同环境互相干扰。 */
const channel = `schedules_${createHash('sha256').update(ROOT.pg.path).digest('hex').slice(0, 32)}`;
const jobs = new Map<string, ScheduledJob>();
let trigger: ScheduleTrigger | undefined;
let listener: Client | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
/** 停止或重连后废弃仍在读取配置的旧异步流程。 */
let generation = 0;
/** 串行读取配置，防止较早的数据库响应覆盖刚保存的配置。 */
let refreshing = Promise.resolve();

/**
 * 配置提交成功后由 PostgreSQL 通知所有服务实例；事务回滚时不会发出通知。
 * @param tx 保存、启停或删除计划的同一事务。
 * @param id 需要重新读取的计划标识。
 */
export async function notifyScheduleChange(
  tx: TaskTransaction,
  id: string,
): Promise<void> {
  await tx.execute(sql`select pg_notify(${channel}, ${id})`);
}

/**
 * 从持久配置恢复或替换 Croner 任务；停用和删除立即停止计时器。
 * @param id 指定计划；省略时恢复全部计划，用于启动和通知连接重建。
 */
export function refreshScheduleJobs(id?: string): Promise<void> {
  const currentTrigger = trigger;
  const currentGeneration = generation;
  if (!currentTrigger) return Promise.resolve();
  const pending = refreshing.then(async () => {
    if (generation !== currentGeneration || !trigger) return;
    const plans = await db
      .select()
      .from(schemas.schedules)
      .where(
        and(
          eq(schemas.schedules.deleted, false),
          eq(schemas.schedules.enabled, true),
          id ? eq(schemas.schedules.id, id) : undefined,
        ),
      );
    if (generation !== currentGeneration || !trigger) return;
    const enabledIds = new Set(plans.map((plan) => plan.id));
    for (const [key, entry] of jobs) {
      if ((!id || key === id) && !enabledIds.has(key)) {
        entry.job.stop();
        jobs.delete(key);
      }
    }
    for (const plan of plans) {
      const old = jobs.get(plan.id);
      if (old?.cron === plan.cron && old.timezone === plan.timezone) continue;
      old?.job.stop();
      jobs.delete(plan.id);
      const job = new Cron(
        plan.cron,
        {
          timezone: plan.timezone,
          unref: true,
          // 触发提交较慢时由 Croner 跳过重入，并同步推进待记录的触发时间。
          protect: (blockedJob) => {
            plannedAt = blockedJob.nextRun();
          },
          catch: (error) => {
            logger.error(
              {
                event: 'schedule.trigger_failed',
                scheduleId: plan.id,
                err: error,
              },
              '定时任务触发失败',
            );
          },
        },
        async () => {
          const scheduledAt = plannedAt;
          plannedAt = job.nextRun();
          if (generation !== currentGeneration || !trigger || !scheduledAt)
            return;
          await currentTrigger(plan.id, plan.cron, plan.timezone, scheduledAt);
        },
      );
      let plannedAt = job.nextRun();
      jobs.set(plan.id, { cron: plan.cron, timezone: plan.timezone, job });
    }
  });
  refreshing = pending.catch(() => undefined);
  return pending;
}

/** 断线期间停止本实例计时器；重新订阅后完整恢复，避免漏掉停用或修改通知。 */
function reconnect(): void {
  if (!trigger || reconnectTimer) return;
  generation += 1;
  for (const entry of jobs.values()) entry.job.stop();
  jobs.clear();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connectListener().catch((error: unknown) => {
      logger.error(
        { event: 'schedule.listen_failed', err: error },
        '定时配置订阅失败，稍后重连',
      );
      reconnect();
    });
  }, 2000);
  reconnectTimer.unref();
}

/** 先订阅再读取配置，确保启动及重连时不会漏掉并发保存的变更。 */
async function connectListener(): Promise<void> {
  const currentGeneration = generation;
  const client = new Client({
    host: ROOT.pg.host,
    port: ROOT.pg.port,
    database: ROOT.pg.database,
    user: ROOT.pg.user,
    password: ROOT.pg.password,
    connectionTimeoutMillis: 5000,
  });
  listener = client;
  client.on('error', (error: Error) => {
    logger.error(
      { event: 'schedule.listen_error', err: error },
      '定时配置订阅连接异常',
    );
    void client.end().catch(() => undefined);
  });
  client.on('end', () => {
    if (listener !== client) return;
    listener = undefined;
    reconnect();
  });
  client.on('notification', (message) => {
    if (message.channel !== channel || !message.payload) return;
    void refreshScheduleJobs(message.payload).catch((error: unknown) => {
      logger.error(
        { event: 'schedule.refresh_failed', err: error },
        '定时配置刷新失败，将重建订阅',
      );
      void client.end().catch(() => undefined);
    });
  });
  try {
    await client.connect();
    await client.query(`LISTEN ${channel}`);
    if (generation !== currentGeneration || !trigger) return;
    await refreshScheduleJobs();
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}

/**
 * 启动配置订阅并为所有启用计划创建 Croner 计时器。
 * @param onTrigger 到点后锁定计划并向任务中心提交的回调。
 */
export async function startScheduleJobs(
  onTrigger: ScheduleTrigger,
): Promise<void> {
  if (trigger) return;
  trigger = onTrigger;
  try {
    await connectListener();
  } catch (error) {
    stopScheduleJobs();
    throw error;
  }
}

/** 停止全部 Croner 计时器及配置订阅，不取消已入队的业务任务。 */
export function stopScheduleJobs(): void {
  generation += 1;
  trigger = undefined;
  clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  for (const entry of jobs.values()) entry.job.stop();
  jobs.clear();
  const client = listener;
  listener = undefined;
  void client?.end().catch(() => undefined);
}
