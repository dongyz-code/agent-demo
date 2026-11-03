import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { lockDocument, requireDocument } from '../access.js';

import type { DbTransaction } from '@/database/index.js';

/** 知识库关系集合变更方式。 */
export type DocumentDatasetRelationMode = 'add' | 'remove' | 'replace';

/** 批量修改文档知识库关系的输入。 */
export interface UpdateDocumentDatasetRelationsInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 加入或保留关系本次应处理的文档版本。 */
  documentVersionId: string;
  /** 本次加入、移出或作为完整结果的知识库标识。 */
  datasetIds: string[];
  /** 加入、移出或全量替换。 */
  mode: DocumentDatasetRelationMode;
  /** 当前操作用户。 */
  userId: string;
}

/**
 * 原子批量加入、移出或替换文档知识库关系。
 *
 * 加入和替换会把目标关系指向同一个待处理版本，但不会创建按知识库重复的 RAG 任务。
 * 移除关系本身就是迟到发布的屏障，不取消可能仍服务其他知识库的版本 RAG 任务。
 *
 * @param input 文档版本、知识库集合、变更方式和审计用户。
 * @param transaction 可选外层事务，与关系处理任务共享提交边界。
 * @returns 实际新增和移除的知识库标识。
 */
export async function updateDocumentDatasetRelations(
  input: UpdateDocumentDatasetRelationsInput,
  transaction?: DbTransaction,
): Promise<{ addedDatasetIds: string[]; removedDatasetIds: string[] }> {
  if (!transaction) {
    return await db.transaction(
      async (tx) => await updateDocumentDatasetRelations(input, tx),
    );
  }
  const tx = transaction;
  await lockDocument(tx, input.documentId);
  await requireDocument(input.documentId, input.userId, tx);
  const [version] = await tx
    .select({ id: schemas.document_versions.document_version_id })
    .from(schemas.document_versions)
    .where(
      and(
        eq(schemas.document_versions.document_id, input.documentId),
        eq(
          schemas.document_versions.document_version_id,
          input.documentVersionId,
        ),
      ),
    )
    .limit(1);
  if (!version) throw new ROOT_ERROR('相关文件不存在');
  const requestedDatasetIds = [...new Set(input.datasetIds)];
  if (input.mode !== 'remove' && requestedDatasetIds.length) {
    const datasetRows = await tx
      .select({
        id: schemas.rag_datasets.dataset_id,
        status: schemas.rag_datasets.status,
      })
      .from(schemas.rag_datasets)
      .where(inArray(schemas.rag_datasets.dataset_id, requestedDatasetIds))
      .for('share');
    if (
      datasetRows.length !== requestedDatasetIds.length ||
      datasetRows.some((dataset) => dataset.status !== 'active')
    ) {
      throw new ROOT_ERROR('数据异常');
    }
  }

  const existingRows = await tx
    .select({
      relationId: schemas.rag_dataset_documents.dataset_document_id,
      datasetId: schemas.rag_dataset_documents.dataset_id,
    })
    .from(schemas.rag_dataset_documents)
    .where(eq(schemas.rag_dataset_documents.document_id, input.documentId));
  const existingIds = new Set(existingRows.map((row) => row.datasetId));
  let targetIds = new Set(requestedDatasetIds);
  if (input.mode === 'add') {
    targetIds = new Set([...existingIds, ...requestedDatasetIds]);
  } else if (input.mode === 'remove') {
    targetIds = new Set(
      [...existingIds].filter(
        (datasetId) => !requestedDatasetIds.includes(datasetId),
      ),
    );
  }
  const addedDatasetIds = [...targetIds].filter(
    (datasetId) => !existingIds.has(datasetId),
  );
  const removedRows = existingRows.filter(
    (row) => !targetIds.has(row.datasetId),
  );
  const removedDatasetIds = removedRows.map((row) => row.datasetId);
  const now = new Date();

  if (removedRows.length) {
    await tx.delete(schemas.rag_dataset_documents).where(
      inArray(
        schemas.rag_dataset_documents.dataset_document_id,
        removedRows.map((row) => row.relationId),
      ),
    );
  }
  if (addedDatasetIds.length) {
    await tx.insert(schemas.rag_dataset_documents).values(
      addedDatasetIds.map((datasetId) => ({
        dataset_document_id: randomUUID(),
        dataset_id: datasetId,
        document_id: input.documentId,
        active_version_id: null,
        pending_version_id: input.documentVersionId,
        rag_status: 'pending' as const,
        rag_error: null,
        create_user_id: input.userId,
        create_timestamp: now,
        last_update_user_id: input.userId,
        last_update_timestamp: now,
      })),
    );
  }

  let processingDatasetIds: string[] = [];
  if (input.mode === 'replace') processingDatasetIds = [...targetIds];
  else if (input.mode === 'add') processingDatasetIds = requestedDatasetIds;
  if (processingDatasetIds.length) {
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.rag_dataset_documents.document_id, input.documentId),
        inArray(schemas.rag_dataset_documents.dataset_id, processingDatasetIds),
      );
    });
    await tx
      .update(schemas.rag_dataset_documents)
      .set({
        pending_version_id: input.documentVersionId,
        rag_status: 'pending',
        rag_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: now,
      })
      .where(where);
  }
  return { addedDatasetIds, removedDatasetIds };
}

/**
 * 为内容失败重试或成功重跑重新准备仍指向该版本的全部知识库关系。
 *
 * @param input 文档、不可变版本和审计用户。
 * @param executor 已持有文档锁的入队事务，关系重置与新任务必须同事务提交。
 * @returns 被重新设为 pending 的关系数量。
 */
export async function prepareDocumentRagRelationsForReprocessing(
  input: {
    /** 文档稳定标识。 */
    documentId: string;
    /** 本次重新处理的文档版本。 */
    documentVersionId: string;
    /** 当前操作用户。 */
    userId: string;
  },
  executor: DbTransaction,
): Promise<number> {
  const where = buildWhere((filter) => {
    filter.push(
      eq(schemas.rag_dataset_documents.document_id, input.documentId),
      or(
        eq(
          schemas.rag_dataset_documents.pending_version_id,
          input.documentVersionId,
        ),
        and(
          isNull(schemas.rag_dataset_documents.pending_version_id),
          eq(
            schemas.rag_dataset_documents.active_version_id,
            input.documentVersionId,
          ),
        ),
      ),
    );
  });
  const rows = await executor
    .update(schemas.rag_dataset_documents)
    .set({
      pending_version_id: input.documentVersionId,
      rag_status: 'pending',
      rag_error: null,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(where)
    .returning({ id: schemas.rag_dataset_documents.dataset_document_id });
  return rows.length;
}

/**
 * 将仍以指定版本为 pending 的全部知识库关系标记为处理中。
 *
 * @param input 文档版本和审计用户。
 * @returns 实际更新的知识库关系数量。
 */
export async function markDocumentRagRelationsProcessing(
  input: DocumentRagVersionInput,
): Promise<number> {
  return await db.transaction(async (transaction) => {
    await lockDocument(transaction, input.documentId);
    await input.assertActive();
    await requireDocument(input.documentId, input.userId, transaction);
    const rows = await transaction
      .update(schemas.rag_dataset_documents)
      .set({
        rag_status: 'processing',
        rag_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: new Date(),
      })
      .where(pendingRelationWhere(input))
      .returning({ id: schemas.rag_dataset_documents.dataset_document_id });
    return rows.length;
  });
}

/**
 * 原子发布所有仍以指定版本为 pending 的知识库关系。
 *
 * @param input 文档、成功版本和审计用户。
 * @returns 成功切换的知识库关系数量。
 */
export async function publishDocumentRagRelations(
  input: DocumentRagVersionInput,
): Promise<number> {
  return await db.transaction(async (transaction) => {
    await lockDocument(transaction, input.documentId);
    await input.assertActive();
    await requireDocument(input.documentId, input.userId, transaction);
    const rows = await transaction
      .update(schemas.rag_dataset_documents)
      .set({
        active_version_id: input.documentVersionId,
        pending_version_id: null,
        rag_status: 'ready',
        rag_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: new Date(),
      })
      .where(pendingRelationWhere(input))
      .returning({ id: schemas.rag_dataset_documents.dataset_document_id });
    return rows.length;
  });
}

/** RAG 状态迁移依赖的版本范围和执行存活检查。 */
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
 * 只匹配仍等待当前版本的关系，不恢复已移除或已切换版本的关系。
 *
 * @param input 当前执行的文档与版本。
 * @returns 关系状态迁移共用的条件。
 */
function pendingRelationWhere(
  input: Pick<DocumentRagVersionInput, 'documentId' | 'documentVersionId'>,
) {
  return and(
    eq(schemas.rag_dataset_documents.document_id, input.documentId),
    eq(
      schemas.rag_dataset_documents.pending_version_id,
      input.documentVersionId,
    ),
  );
}

/**
 * 收敛当前版本尚未完成的关系，保留已发布的 active 结果。
 *
 * @param transaction 已持有文档锁的调用方事务。
 * @param input 文档、版本和审计信息。
 * @param message 面向用户的安全错误摘要。
 * @returns 当前版本待处理关系更新完成后结束。
 */
export async function failDocumentRagRelations(
  transaction: DbTransaction,
  input: Pick<
    DocumentRagVersionInput,
    'documentId' | 'documentVersionId' | 'userId'
  >,
  message: string,
): Promise<void> {
  await transaction
    .update(schemas.rag_dataset_documents)
    .set({
      rag_status: 'failed',
      rag_error: message.slice(0, 500),
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        pendingRelationWhere(input),
        inArray(schemas.rag_dataset_documents.rag_status, [
          'pending',
          'processing',
        ]),
      ),
    );
}

/**
 * 在切换展示版本的同一事务中对齐所有已关联知识库。
 *
 * @param transaction 已持有文档锁的版本切换事务。
 * @param input 目标文档版本与审计用户。
 * @returns 需要创建版本级处理任务的关系数量。
 */
export async function setDocumentRagPendingVersion(
  transaction: DbTransaction,
  input: Pick<
    DocumentRagVersionInput,
    'documentId' | 'documentVersionId' | 'userId'
  >,
): Promise<number> {
  const rows = await transaction
    .update(schemas.rag_dataset_documents)
    .set({
      pending_version_id: input.documentVersionId,
      rag_status: 'pending',
      rag_error: null,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(eq(schemas.rag_dataset_documents.document_id, input.documentId))
    .returning({ id: schemas.rag_dataset_documents.dataset_document_id });
  return rows.length;
}
