import { and, eq, ne } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, pgAdvisoryXactLock, schemas } from '@/database/index.js';
import {
  documentLibraryManageExists,
  documentLibraryReadExists,
} from './library-access.js';

import type { DbTransaction } from '@/database/index.js';

/** 领域查询可以复用的数据库或事务执行器。 */
export type DocumentReader = Pick<typeof db, 'select'>;

/** 文档访问级别。任务内部只确认文档存在，不读取授权。 */
export type DocumentAccessLevel = 'read' | 'manage' | 'exists';

/**
 * 统一文档查询范围。阅读和维护都按资料库身份判断，系统管理员不受限制。
 *
 * @param userId 当前操作用户。
 * @param documentId 可选文档标识；列表查询不传。
 * @param includeDeleted 删除幂等入口允许读取已逻辑删除文档。
 * @param access 阅读、维护或仅确认存在。
 * @returns 文档标识、生命周期和资料库身份的组合条件。
 */
export function documentAccessWhere(
  userId: string,
  documentId?: string,
  includeDeleted = false,
  access: DocumentAccessLevel = 'read',
) {
  let idCondition;
  if (documentId !== undefined) {
    idCondition = eq(schemas.documents.document_id, documentId);
  }
  let lifecycleCondition;
  if (!includeDeleted) {
    lifecycleCondition = ne(schemas.documents.status, 'deleted');
  }
  let libraryCondition;
  if (access === 'manage') {
    libraryCondition = documentLibraryManageExists(userId);
  } else if (access === 'read') {
    libraryCondition = documentLibraryReadExists(userId);
  }
  return and(idCondition, lifecycleCondition, libraryCondition);
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
 * 维护动作在用户只能阅读时返回权限不足，避免把存在的文档伪装成不存在。
 *
 * @param documentId 文档稳定标识。
 * @param userId 当前操作用户。
 * @param executor 调用方数据库或事务；写流程应先获取文档锁。
 * @param includeDeleted 删除幂等入口是否允许已删除状态。
 * @param access 阅读、维护或仅确认存在。
 * @returns 文档完整行；不可访问时抛出统一业务错误。
 */
export async function requireDocument(
  documentId: string,
  userId: string,
  executor: DocumentReader = db,
  includeDeleted = false,
  access: DocumentAccessLevel = 'read',
) {
  const [document] = await executor
    .select()
    .from(schemas.documents)
    .where(documentAccessWhere(userId, documentId, includeDeleted, access))
    .limit(1);
  if (document) return document;
  if (access === 'manage') {
    const [readable] = await executor
      .select({ id: schemas.documents.document_id })
      .from(schemas.documents)
      .where(documentAccessWhere(userId, documentId, includeDeleted, 'read'))
      .limit(1);
    if (readable) throw new ROOT_ERROR('认证: 权限不足');
  }
  throw new ROOT_ERROR('相关文件不存在');
}
