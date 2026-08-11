import { sql } from 'drizzle-orm';

import { db } from './client.js';

/** drizzle 事务对象类型,仓库公共别名(database 层此前缺失)。 */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 在当前事务内获取命名空间 advisory 锁。
 *
 * parts 以 ':' 拼接为 lockKey,单 part(裸标识或常量)与多 part 均与原内联写法等价,
 * 不改变锁空间。锁随事务结束自动释放。
 *
 * @param tx 当前事务对象。
 * @param parts 组成 lockKey 的命名空间与标识片段。
 */
export async function pgAdvisoryXactLock(
  tx: DbTransaction,
  ...parts: string[]
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${parts.join(':')}))`);
}
