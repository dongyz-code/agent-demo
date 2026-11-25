import assert from 'node:assert/strict';
import { test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ROOT } from '../src/configs/env.js';
import { db, schemas, closeDatabase } from '../src/database/index.js';
import { nextScheduleDates } from '../src/hooks/schedules/policy.js';
import {
  listScheduleRuns,
  listSchedules,
  runSchedule,
  saveSchedule,
  tickSchedules,
  toggleSchedule,
} from '../src/hooks/schedules/index.js';

/** 每次验证使用独立前缀，禁止触及现有业务缓存。 */
const testPrefix = `agent-demo:test:${randomUUID()}`;
ROOT.redis.prefix = testPrefix;
const {
  redis,
  cacheSpaces,
  cacheKey,
  clearCache,
  invalidateCache,
  loadCached,
  redisOverview,
  scanCache,
} = await import('../src/hooks/cache/index.js');

await test('Cron 校验、IANA 时区和未来五次执行使用真实解析器', () => {
  const dates = nextScheduleDates(
    '0 0 * * *',
    'Asia/Shanghai',
    new Date('2026-11-24T15:59:00Z'),
  );
  assert.equal(dates.length, 5);
  assert.equal(dates[0]?.toISOString(), '2026-11-24T16:00:00.000Z');
  assert.throws(() => nextScheduleDates('not cron', 'UTC'));
  assert.throws(() => nextScheduleDates('* * * * *', 'not/a-timezone'));
});

await test('真实 Redis：缓存复用、TTL、并发回源、空间隔离、清理和离线回源', async () => {
  await redis.connect();
  const originalTtl = cacheSpaces[0]!.ttl;
  const foreign = `${testPrefix}:foreign:keep`;
  try {
    let loads = 0;
    const factory = async () => {
      loads += 1;
      return { enabled: true, revision: loads };
    };
    const first = await loadCached('system.settings', 'settings', factory);
    assert.deepEqual(
      await loadCached('system.settings', 'settings', factory),
      first,
    );
    assert.equal(loads, 1);
    assert.ok((await redis.ttl(cacheKey('system.settings', 'settings'))) > 0);
    await redis.set(foreign, 'untouched', { EX: 60 });
    const page = await scanCache('system.settings');
    assert.ok(
      page.list.some(
        (entry) => entry.key === 'settings' && entry.type === 'string',
      ),
    );
    assert.equal((await redisOverview()).connected, true);
    await invalidateCache('system.settings', 'settings');
    await loadCached('system.settings', 'settings', factory);
    assert.equal(loads, 2);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        loadCached('system.settings', 'parallel', async () => {
          loads += 1;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return 'one';
        }),
      ),
    );
    assert.equal(loads, 3);
    let release: () => void = () => {};
    let signal: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const racing = loadCached('system.settings', 'racing', async () => {
      signal();
      await hold;
      return 'old';
    });
    await started;
    await invalidateCache('system.settings', 'racing');
    release();
    assert.equal(await racing, 'old');
    assert.equal(await redis.get(cacheKey('system.settings', 'racing')), null);
    cacheSpaces[0]!.ttl = 1;
    await loadCached('system.settings', 'expires', async () => 'temporary');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(await redis.get(cacheKey('system.settings', 'expires')), null);
    await assert.rejects(() => scanCache('not-registered'));
    let cursor = '0';
    do {
      cursor = (await clearCache('system.settings', undefined, cursor)).cursor;
    } while (cursor !== '0');
    assert.equal(await redis.get(foreign), 'untouched');
    assert.equal((await scanCache('system.settings')).list.length, 0);
    await redis.del(foreign);
    const keys = await redis.scan('0', {
      MATCH: `${testPrefix}:*`,
      COUNT: 1000,
    });
    if (keys.keys.length) await redis.unlink(keys.keys);
    redis.destroy();
    assert.equal(
      await loadCached('system.settings', 'offline', async () => 'source'),
      'source',
    );
    assert.equal((await redisOverview()).connected, false);
  } finally {
    cacheSpaces[0]!.ttl = originalTtl;
    if (redis.isOpen) redis.destroy();
  }
});

await test('真实 PostgreSQL：原子触发、重复请求、重叠防护、停机跳过和配置持久化', async () => {
  const ids: string[] = [];
  const actor = 'test.monitor';
  try {
    const created = await saveSchedule(
      {
        name: '集成验证计划',
        handler: 'upload.cleanup',
        cron: '* * * * *',
        timezone: 'UTC',
        enabled: false,
        params: {},
        description: '仅验证入队，不启动 Worker',
      },
      actor,
    );
    ids.push(created.id);
    await toggleSchedule(created.id, true, actor);
    const now = new Date();
    await db
      .update(schemas.schedules)
      .set({ next_run_at: now })
      .where(eq(schemas.schedules.id, created.id));
    const ticks = await Promise.all([tickSchedules(now), tickSchedules(now)]);
    assert.equal(
      ticks.reduce((sum, value) => sum + value, 0),
      1,
    );
    let runs = await listScheduleRuns({ scheduleId: created.id });
    assert.equal(runs.count, 1);
    assert.equal(runs.list[0]?.status, 'queued');
    await assert.rejects(() => runSchedule(created.id, randomUUID(), actor));
    await db
      .update(schemas.schedules)
      .set({ next_run_at: new Date(now.getTime() + 1000) })
      .where(eq(schemas.schedules.id, created.id));
    assert.equal(await tickSchedules(new Date(now.getTime() + 1000)), 0);
    runs = await listScheduleRuns({ scheduleId: created.id });
    assert.ok(
      runs.list.some(
        (run) => run.status === 'skipped' && run.message?.includes('上一次'),
      ),
    );
    const firstId = runs.list.find((run) => run.taskId)?.taskId;
    assert.ok(firstId);
    await db
      .update(schemas.tasks)
      .set({ status: 'succeeded', end_timestamp: now })
      .where(eq(schemas.tasks.task_id, firstId));
    const requestId = randomUUID();
    const manual = await Promise.all([
      runSchedule(created.id, requestId, actor),
      runSchedule(created.id, requestId, actor),
    ]);
    assert.equal(manual[0]?.taskId, manual[1]?.taskId);
    await toggleSchedule(created.id, false, actor);
    const persisted = await listSchedules({
      search: '集成验证计划',
      limit: [0, 20],
    });
    assert.equal(persisted.list[0]?.enabled, false);
    assert.equal(persisted.list[0]?.nextRunAt, null);
    assert.equal(persisted.list[0]?.active, true);
    await toggleSchedule(created.id, true, actor);
    await db
      .update(schemas.schedules)
      .set({ next_run_at: new Date(now.getTime() - 60_000) })
      .where(eq(schemas.schedules.id, created.id));
    assert.equal(await tickSchedules(now), 0);
    runs = await listScheduleRuns({ scheduleId: created.id });
    assert.ok(runs.list.some((run) => run.message?.includes('停机')));
    await toggleSchedule(created.id, false, actor, true);
    assert.equal((await listSchedules({ search: '集成验证计划' })).count, 0);
    assert.ok((await listScheduleRuns({ scheduleId: created.id })).count > 0);
  } finally {
    for (const id of ids) {
      const runs = await db
        .select()
        .from(schemas.schedule_runs)
        .where(eq(schemas.schedule_runs.schedule_id, id));
      const taskIds = runs.flatMap((run) => (run.task_id ? [run.task_id] : []));
      if (taskIds.length) {
        await db
          .delete(schemas.task_logs)
          .where(inArray(schemas.task_logs.task_id, taskIds));
        await db
          .delete(schemas.task_attempts)
          .where(inArray(schemas.task_attempts.task_id, taskIds));
        await db
          .delete(schemas.tasks)
          .where(inArray(schemas.tasks.task_id, taskIds));
      }
      await db
        .delete(schemas.schedule_runs)
        .where(eq(schemas.schedule_runs.schedule_id, id));
      await db
        .delete(schemas.monitor_audits)
        .where(
          and(
            eq(schemas.monitor_audits.actor_id, actor),
            eq(schemas.monitor_audits.target, id),
          ),
        );
      await db.delete(schemas.schedules).where(eq(schemas.schedules.id, id));
    }
  }
});
await closeDatabase();
