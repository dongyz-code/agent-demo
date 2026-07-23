import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { FileProcessingLeaseLostError } from '../tasks/runtime.js';

/** 校验文档存在、未删除且属于当前操作用户。 */
async function assertOwnedDocument(
  documentId: string,
  userId: string,
): Promise<void> {
  const [document] = await db
    .select({ id: schemas.documents.document_id })
    .from(schemas.documents)
    .where(
      and(
        eq(schemas.documents.document_id, documentId),
        eq(schemas.documents.create_user_id, userId),
        ne(schemas.documents.status, 'deleted'),
      ),
    )
    .limit(1);
  if (!document) {
    throw new ROOT_ERROR('相关文件不存在');
  }
}

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
 * 加入和替换会把目标关系指向同一个待处理版本，但不会创建按知识库重复的内容任务。
 * 移除关系本身就是迟到发布的屏障，不取消可能仍服务其他知识库的版本内容任务。
 *
 * @param input 文档版本、知识库集合、变更方式和审计用户。
 * @returns 实际新增和移除的知识库标识。
 */
export async function updateDocumentDatasetRelations(
  input: UpdateDocumentDatasetRelationsInput,
): Promise<{ addedDatasetIds: string[]; removedDatasetIds: string[] }> {
  await assertOwnedDocument(input.documentId, input.userId);
  const requestedDatasetIds = [...new Set(input.datasetIds)];
  if (input.mode !== 'remove' && requestedDatasetIds.length) {
    const datasetRows = await db
      .select({
        id: schemas.rag_datasets.dataset_id,
        status: schemas.rag_datasets.status,
      })
      .from(schemas.rag_datasets)
      .where(inArray(schemas.rag_datasets.dataset_id, requestedDatasetIds));
    if (
      datasetRows.length !== requestedDatasetIds.length ||
      datasetRows.some((dataset) => dataset.status !== 'active')
    ) {
      throw new ROOT_ERROR('数据异常');
    }
  }

  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`document-datasets:${input.documentId}`}))`,
    );
    const existingRows = await tx
      .select({
        relationId: schemas.rag_dataset_documents.dataset_document_id,
        datasetId: schemas.rag_dataset_documents.dataset_id,
      })
      .from(schemas.rag_dataset_documents)
      .where(eq(schemas.rag_dataset_documents.document_id, input.documentId));
    const existingIds = new Set(existingRows.map((row) => row.datasetId));
    const targetIds =
      input.mode === 'replace'
        ? new Set(requestedDatasetIds)
        : input.mode === 'add'
          ? new Set([...existingIds, ...requestedDatasetIds])
          : new Set(
              [...existingIds].filter(
                (datasetId) => !requestedDatasetIds.includes(datasetId),
              ),
            );
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

    const processingDatasetIds =
      input.mode === 'replace'
        ? [...targetIds]
        : input.mode === 'add'
          ? requestedDatasetIds
          : [];
    if (processingDatasetIds.length) {
      await tx
        .update(schemas.rag_dataset_documents)
        .set({
          pending_version_id: input.documentVersionId,
          rag_status: 'pending',
          rag_error: null,
          last_update_user_id: input.userId,
          last_update_timestamp: now,
        })
        .where(
          and(
            eq(
              schemas.rag_dataset_documents.document_id,
              input.documentId,
            ),
            inArray(
              schemas.rag_dataset_documents.dataset_id,
              processingDatasetIds,
            ),
          ),
        );
    }
    return { addedDatasetIds, removedDatasetIds };
  });
}

/**
 * 为内容失败重试或成功重跑重新准备仍指向该版本的全部知识库关系。
 *
 * @param input 文档、不可变版本和审计用户。
 * @returns 被重新设为 pending 的关系数量。
 */
export async function prepareDocumentRagRelationsForReprocessing(input: {
  /** 文档稳定标识。 */
  documentId: string;
  /** 本次重新处理的文档版本。 */
  documentVersionId: string;
  /** 当前操作用户。 */
  userId: string;
}): Promise<number> {
  const rows = await db
    .update(schemas.rag_dataset_documents)
    .set({
      pending_version_id: input.documentVersionId,
      rag_status: 'pending',
      rag_error: null,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.rag_dataset_documents.document_id, input.documentId),
        or(
          eq(
            schemas.rag_dataset_documents.pending_version_id,
            input.documentVersionId,
          ),
          eq(
            schemas.rag_dataset_documents.active_version_id,
            input.documentVersionId,
          ),
        ),
      ),
    )
    .returning({ id: schemas.rag_dataset_documents.dataset_document_id });
  return rows.length;
}

/** 将仍以指定版本为 pending 的全部知识库关系标记为处理中。 */
export async function markDocumentRagRelationsProcessing(input: {
  /** 当前内容任务标识。 */
  taskId: string;
  /** 当前 worker 持有的任务 lease。 */
  leaseId: string;
  /** 文档稳定标识。 */
  documentId: string;
  /** 本次处理的文档版本。 */
  documentVersionId: string;
  /** 当前操作用户。 */
  userId: string;
}): Promise<number> {
  return await db.transaction(async (tx) => {
    const now = new Date();
    const [owned] = await tx
      .update(schemas.tasks)
      .set({ last_update_timestamp: now })
      .where(
        and(
          eq(schemas.tasks.task_id, input.taskId),
          eq(schemas.tasks.status, 'pending'),
          eq(schemas.tasks.pending_uuid, input.leaseId),
        ),
      )
      .returning({ taskId: schemas.tasks.task_id });
    if (!owned) throw new FileProcessingLeaseLostError();
    const rows = await tx
      .update(schemas.rag_dataset_documents)
      .set({
        rag_status: 'processing',
        rag_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(schemas.rag_dataset_documents.document_id, input.documentId),
          eq(
            schemas.rag_dataset_documents.pending_version_id,
            input.documentVersionId,
          ),
        ),
      )
      .returning({ id: schemas.rag_dataset_documents.dataset_document_id });
    return rows.length;
  });
}

/**
 * 仅在内容任务仍持有 lease 时发布匹配的知识库关系。
 *
 * @param input 任务 lease、文档版本和审计用户。
 * @returns 成功切换的知识库关系数量。
 */
export async function publishDocumentRagRelationsForTask(input: {
  /** 当前内容任务标识。 */
  taskId: string;
  /** 当前 worker 持有的任务 lease。 */
  leaseId: string;
  /** 文档稳定标识。 */
  documentId: string;
  /** 本次成功处理的文档版本。 */
  documentVersionId: string;
  /** 当前操作用户。 */
  userId: string;
}): Promise<number> {
  return await db.transaction(async (tx) => {
    const now = new Date();
    const [owned] = await tx
      .update(schemas.tasks)
      .set({ last_update_timestamp: now })
      .where(
        and(
          eq(schemas.tasks.task_id, input.taskId),
          eq(schemas.tasks.status, 'pending'),
          eq(schemas.tasks.pending_uuid, input.leaseId),
        ),
      )
      .returning({ taskId: schemas.tasks.task_id });
    if (!owned) throw new FileProcessingLeaseLostError();
    const rows = await tx
      .update(schemas.rag_dataset_documents)
      .set({
        active_version_id: input.documentVersionId,
        pending_version_id: null,
        rag_status: 'ready',
        rag_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(schemas.rag_dataset_documents.document_id, input.documentId),
          eq(
            schemas.rag_dataset_documents.pending_version_id,
            input.documentVersionId,
          ),
        ),
      )
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
export async function publishDocumentRagRelations(input: {
  /** 文档稳定标识。 */
  documentId: string;
  /** 本次成功处理的文档版本。 */
  documentVersionId: string;
  /** 当前操作用户。 */
  userId: string;
}): Promise<number> {
  const rows = await db
    .update(schemas.rag_dataset_documents)
    .set({
      active_version_id: input.documentVersionId,
      pending_version_id: null,
      rag_status: 'ready',
      rag_error: null,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.rag_dataset_documents.document_id, input.documentId),
        eq(
          schemas.rag_dataset_documents.pending_version_id,
          input.documentVersionId,
        ),
      ),
    )
    .returning({ id: schemas.rag_dataset_documents.dataset_document_id });
  return rows.length;
}

/** 记录指定版本的全部待处理关系失败，同时保留各自旧 active 版本。 */
export async function failDocumentRagRelations(input: {
  /** 文档稳定标识。 */
  documentId: string;
  /** 本次失败的目标版本。 */
  documentVersionId: string;
  /** 面向用户的安全错误摘要。 */
  error: string;
  /** 当前操作用户。 */
  userId: string;
}): Promise<void> {
  await db
    .update(schemas.rag_dataset_documents)
    .set({
      rag_status: 'failed',
      rag_error: input.error,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.rag_dataset_documents.document_id, input.documentId),
        eq(
          schemas.rag_dataset_documents.pending_version_id,
          input.documentVersionId,
        ),
      ),
    );
}
