import { and } from 'drizzle-orm';

/** Drizzle 可参与 AND 运算的查询条件。 */
type WhereCondition = Parameters<typeof and>[number];

/**
 * 收集查询条件并构造 where 方法的最终入参。
 *
 * @param callback 同步追加固定条件和可选条件。
 * @returns 使用 AND 组合的条件；没有有效条件时返回 undefined。
 */
export function buildWhere(
  callback: (filter: WhereCondition[]) => void,
): ReturnType<typeof and> {
  const filter: WhereCondition[] = [];
  callback(filter);
  return and(...filter);
}
