import { and, eq, inArray } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import { lockDocument, requireDocument } from '../access.js';

import type { DbTransaction } from '@/database/index.js';

/** 索引状态迁移使用的文档版本。 */
export interface DocumentRagVersionInput {
  /** 逻辑文档标识。 */
  documentId: string;
  /** 正在处理的不可变版本。 */
  documentVersionId: string;
  /** 状态更新的审计用户。 */
  userId: string;
  /** 获取文档锁后重新确认执行没有取消或失效。 */
  assertActive: () => Promise<void>;
}

/**
 * 把仍在等待的版本标成处理中。
 *
 * @param input 文档、版本和审计用户。
 * @returns 实际更新的版本数量。
 */
export async function markDocumentVersionProcessing(
  input: DocumentRagVersionInput,
): Promise<number> {
  return await db.transaction(async (transaction) => {
    await lockDocument(transaction, input.documentId);
    await input.assertActive();
    await requireDocument(
      input.documentId,
      input.userId,
      transaction,
      false,
      'exists',
    );
    const rows = await transaction
      .update(schemas.document_versions)
      .set({
        rag_status: 'processing',
        rag_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: new Date(),
      })
      .where(
        and(
          eq(
            schemas.document_versions.document_version_id,
            input.documentVersionId,
          ),
          eq(schemas.document_versions.document_id, input.documentId),
          eq(schemas.document_versions.rag_status, 'pending'),
        ),
      )
      .returning({ id: schemas.document_versions.document_version_id });
    return rows.length;
  });
}

/**
 * 索引成功后发布可检索版本。失败过的旧版本指针保持到这一步才切换。
 *
 * @param input 文档、成功版本和审计用户。
 * @returns 成功切换时返回 1。
 */
export async function publishIndexedDocumentVersion(
  input: DocumentRagVersionInput,
): Promise<number> {
  return await db.transaction(async (transaction) => {
    await lockDocument(transaction, input.documentId);
    await input.assertActive();
    await requireDocument(
      input.documentId,
      input.userId,
      transaction,
      false,
      'exists',
    );
    const now = new Date();
    const versions = await transaction
      .update(schemas.document_versions)
      .set({
        rag_status: 'ready',
        rag_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(
            schemas.document_versions.document_version_id,
            input.documentVersionId,
          ),
          eq(schemas.document_versions.document_id, input.documentId),
          inArray(schemas.document_versions.rag_status, [
            'pending',
            'processing',
          ]),
        ),
      )
      .returning({ id: schemas.document_versions.document_version_id });
    if (!versions.length) return 0;
    await transaction
      .update(schemas.documents)
      .set({
        indexed_version_id: input.documentVersionId,
        last_update_user_id: input.userId,
        last_update_timestamp: now,
      })
      .where(eq(schemas.documents.document_id, input.documentId));
    return 1;
  });
}

/**
 * 为重新处理把版本放回等待，不清空已经发布的可检索版本。
 *
 * @param input 文档版本和审计用户。
 * @param transaction 调用方已持有文档锁的事务。
 * @returns 版本状态更新后结束。
 */
export async function prepareDocumentVersionForReprocessing(
  input: Omit<DocumentRagVersionInput, 'assertActive'>,
  transaction: DbTransaction,
): Promise<void> {
  await transaction
    .update(schemas.document_versions)
    .set({
      rag_status: 'pending',
      rag_error: null,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(
          schemas.document_versions.document_version_id,
          input.documentVersionId,
        ),
        eq(schemas.document_versions.document_id, input.documentId),
      ),
    );
}

/**
 * 记录版本索引失败，保留文档上已经发布的可检索版本。
 *
 * @param transaction 已持有文档锁的事务。
 * @param input 文档版本和审计用户。
 * @param message 面向用户的安全错误摘要。
 * @returns 未完成版本被标成失败后结束。
 */
export async function failDocumentVersionIndex(
  transaction: DbTransaction,
  input: Omit<DocumentRagVersionInput, 'assertActive'>,
  message: string,
): Promise<void> {
  await transaction
    .update(schemas.document_versions)
    .set({
      rag_status: 'failed',
      rag_error: message,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(
          schemas.document_versions.document_version_id,
          input.documentVersionId,
        ),
        eq(schemas.document_versions.document_id, input.documentId),
        inArray(schemas.document_versions.rag_status, [
          'pending',
          'processing',
        ]),
      ),
    );
}
