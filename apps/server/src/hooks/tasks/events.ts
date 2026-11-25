import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { sql } from 'drizzle-orm';
import { ROOT, logger } from '@/configs/index.js';
import type { TaskTransaction } from './types.js';

/** 按业务 schema 隔离任务通知，不包含凭据。 */
const channel = `tasks_${createHash('sha256').update(ROOT.pg.path).digest('hex').slice(0, 32)}`;

/**
 * 事务提交后唤醒各实例；回滚时 PostgreSQL 不会发出通知。
 * @param tx 入队、取消或执行结束所用的事务。
 * @param taskId 已发生变化的任务标识。
 */
export async function notifyTaskChange(
  tx: TaskTransaction,
  taskId: string,
): Promise<void> {
  await tx.execute(sql`select pg_notify(${channel}, ${taskId})`);
}

/** 通过数据库事件唤醒任务执行，不周期查询任务表。 */
export class TaskEvents {
  private client: Client | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  /**
   * 保存事件处理函数，订阅重建后同样唤醒一次以补读断线期间已提交的任务。
   * @param onChange 任务变化时处理取消状态并尝试领取队列。
   */
  constructor(private readonly onChange: (taskId?: string) => Promise<void>) {}

  /** 建立订阅；启动失败直接报告，不伪装成已运行。 */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      await this.connect();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  /** 关闭订阅和异常重连等待；停止后不再处理通知。 */
  stop(): void {
    this.started = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const client = this.client;
    this.client = undefined;
    void client?.end().catch(() => undefined);
  }

  /** 先完成 LISTEN，再读取队列，避免启动或重连时漏掉并发入队。 */
  private async connect(): Promise<void> {
    const client = new Client({
      host: ROOT.pg.host,
      port: ROOT.pg.port,
      database: ROOT.pg.database,
      user: ROOT.pg.user,
      password: ROOT.pg.password,
      connectionTimeoutMillis: 5000,
    });
    this.client = client;
    client.on('error', (error: Error) => {
      logger.error(
        { event: 'task.events_error', err: error },
        '任务事件连接异常',
      );
      void client.end().catch(() => undefined);
    });
    client.on('end', () => {
      if (this.client !== client) return;
      this.client = undefined;
      this.reconnect();
    });
    client.on('notification', (message) => {
      if (
        this.client !== client ||
        !this.started ||
        message.channel !== channel
      )
        return;
      void this.onChange(message.payload).catch((error: unknown) => {
        logger.error(
          { event: 'task.event_failed', err: error },
          '任务事件处理失败',
        );
        void client.end().catch(() => undefined);
      });
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${channel}`);
      if (this.started && this.client === client) await this.onChange();
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }
  }

  /** 仅连接故障时安排一次重连；正常空闲时没有后台计时器。 */
  private reconnect(): void {
    if (!this.started || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error: unknown) => {
        logger.error(
          { event: 'task.events_reconnect_failed', err: error },
          '任务事件重连失败',
        );
        this.reconnect();
      });
    }, 2000);
    this.reconnectTimer.unref();
  }
}
