import { and, eq, ne } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, pgAdvisoryXactLock, schemas } from '@/database/index.js';

import type { DbTransaction } from '@/database/index.js';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/** 领域查询可以复用的数据库或事务执行器。 */
export type DocumentReader = Pick<typeof db, 'select'>;

/**
 * 构造创建人数据范围；系统管理员不受创建人限制。
 *
 * @param column 目标表的创建人字段。
 * @param userId 当前操作用户。
 * @returns 普通用户的所有权条件，管理员返回空条件供 and 忽略。
 */
export function documentOwnerScope(column: AnyPgColumn, userId: string) {
  if (userId === ROOT.SYS_ADMIN_USER_ID) return undefined;
  return eq(column, userId);
}

/**
 * 统一文档查询范围，避免不同入口遗漏管理员或生命周期规则。
 *
 * @param userId 当前操作用户。
 * @param documentId 可选文档标识；列表查询不传。
 * @param includeDeleted 删除幂等入口允许读取已逻辑删除文档。
 * @returns 文档所有权、标识与生命周期的组合条件。
 */
export function documentAccessWhere(
  userId: string,
  documentId?: string,
  includeDeleted = false,
) {
  let idCondition;
  if (documentId !== undefined) {
    idCondition = eq(schemas.documents.document_id, documentId);
  }
  let lifecycleCondition;
  if (!includeDeleted) {
    lifecycleCondition = ne(schemas.documents.status, 'deleted');
  }
  return and(
    idCondition,
    documentOwnerScope(schemas.documents.create_user_id, userId),
    lifecycleCondition,
  );
}

/**
 * 在已有事务中串行化文档变更，所有生命周期写入共用同一锁空间。
 *
 * @param transaction 调用方持有的业务事务。
 * @param documentId 文档稳定标识。
 * @returns 获取锁后结束；锁在事务提交或回滚时释放。
 */
export async function lockDocument(
  transaction: DbTransaction,
  documentId: string,
): Promise<void> {
  await pgAdvisoryXactLock(transaction, 'document', documentId);
}

/**
 * 校验文档存在且在当前用户可访问范围内，不自行开启事务。
 *
 * @param documentId 文档稳定标识。
 * @param userId 当前操作用户。
 * @param executor 调用方数据库或事务；写流程应先获取文档锁。
 * @param includeDeleted 删除幂等入口是否允许已删除状态。
 * @returns 文档完整行；不可访问时抛出统一业务错误。
 */
export async function requireDocument(
  documentId: string,
  userId: string,
  executor: DocumentReader = db,
  includeDeleted = false,
) {
  const [document] = await executor
    .select()
    .from(schemas.documents)
    .where(documentAccessWhere(userId, documentId, includeDeleted))
    .limit(1);
  if (!document) throw new ROOT_ERROR('相关文件不存在');
  return document;
}
