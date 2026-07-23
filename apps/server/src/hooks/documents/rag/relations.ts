import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';

import type { RagDatasetSegmentInfo } from '@repo/types';

/** 校验文档存在、未删除且属于当前操作用户。 */
async function assertOwnedDocument(
  documentId: string,
  userId: string,
): Promise<void> {
  const [document] = await db
    .select({ id: schema.documents.document_id })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.document_id, documentId),
        eq(schema.documents.create_user_id, userId),
        ne(schema.documents.status, 'deleted'),
      ),
    )
    .limit(1);
  if (!document) {
    throw new ROOT_ERROR('相关文件不存在', 'DOCUMENT_NOT_FOUND: 文档不存在');
  }
}

/**
 * 幂等建立知识库与文档关系，并把指定版本设为待处理目标。
 *
 * @param datasetId 目标知识库标识。
 * @param documentId 文档标识。
 * @param documentVersionId 待处理版本标识。
 * @param userId 当前操作用户。
 */
export async function ensureDocumentDatasetRelation(
  datasetId: string,
  documentId: string,
  documentVersionId: string,
  userId: string,
) {
  const [dataset] = await db
    .select({ status: schema.rag_datasets.status })
    .from(schema.rag_datasets)
    .where(eq(schema.rag_datasets.dataset_id, datasetId))
    .limit(1);
  if (!dataset) {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'RAG_DATASET_NOT_FOUND: 知识库不存在',
    );
  }
  if (dataset.status !== 'active') {
    throw new ROOT_ERROR(
      '数据异常',
      'RAG_DATASET_DISABLED: 停用知识库不能加入文档',
    );
  }
  await assertOwnedDocument(documentId, userId);
  const now = new Date();
  await db
    .insert(schema.rag_dataset_documents)
    .values({
      dataset_document_id: randomUUID(),
      dataset_id: datasetId,
      document_id: documentId,
      active_version_id: null,
      pending_version_id: documentVersionId,
      rag_status: 'pending',
      rag_error: null,
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.rag_dataset_documents.dataset_id,
        schema.rag_dataset_documents.document_id,
      ],
      set: {
        pending_version_id: documentVersionId,
        rag_status: 'pending',
        rag_error: null,
        last_update_user_id: userId,
        last_update_timestamp: now,
      },
    });
}

/**
 * 为失败重试或成功重跑准备仍然存在且版本未被覆盖的知识库关系。
 *
 * @param datasetId 目标知识库标识。
 * @param documentId 文档标识。
 * @param documentVersionId 原任务绑定的不可变版本。
 * @param userId 当前操作用户。
 * @returns 关系仍允许重试时结束；关系已删除或有更新 pending 版本时拒绝。
 */
export async function prepareExistingRagRelationRetry(
  datasetId: string,
  documentId: string,
  documentVersionId: string,
  userId: string,
): Promise<void> {
  const now = new Date();
  const [updated] = await db
    .update(schema.rag_dataset_documents)
    .set({
      pending_version_id: documentVersionId,
      rag_status: 'pending',
      rag_error: null,
      last_update_user_id: userId,
      last_update_timestamp: now,
    })
    .where(
      and(
        eq(schema.rag_dataset_documents.dataset_id, datasetId),
        eq(schema.rag_dataset_documents.document_id, documentId),
        or(
          eq(
            schema.rag_dataset_documents.pending_version_id,
            documentVersionId,
          ),
          and(
            isNull(schema.rag_dataset_documents.pending_version_id),
            eq(
              schema.rag_dataset_documents.active_version_id,
              documentVersionId,
            ),
          ),
        ),
      ),
    )
    .returning({ id: schema.rag_dataset_documents.dataset_document_id });
  if (!updated) {
    throw new ROOT_ERROR(
      '数据异常',
      'RAG_RELATION_VERSION_CONFLICT: 知识库关系已删除或已有更新的待处理版本',
    );
  }
}

/** 知识库关系集合变更方式。 */
export type DocumentDatasetRelationMode = 'add' | 'remove' | 'replace';

/** 批量修改文档知识库关系的输入。 */
export interface UpdateDocumentDatasetRelationsInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 新关系处理时使用的文档版本。 */
  documentVersionId: string;
  /** 本次加入、移出或替换后的知识库标识。 */
  datasetIds: string[];
  /** 加入、移出或全量替换。 */
  mode: DocumentDatasetRelationMode;
  /** 当前操作用户。 */
  userId: string;
}

/**
 * 原子批量加入、移出或替换一个文档的知识库关系。
 *
 * 移除关系会同时取消仍在等待或运行的 RAG 任务；关系删除本身是迟到任务的发布屏障。
 *
 * @param input 文档版本、目标知识库集合、变更方式和审计用户。
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
        id: schema.rag_datasets.dataset_id,
        status: schema.rag_datasets.status,
      })
      .from(schema.rag_datasets)
      .where(inArray(schema.rag_datasets.dataset_id, requestedDatasetIds));
    if (
      datasetRows.length !== requestedDatasetIds.length ||
      datasetRows.some((dataset) => dataset.status !== 'active')
    ) {
      throw new ROOT_ERROR(
        '数据异常',
        'RAG_DATASET_INVALID: 目标知识库不存在或已停用',
      );
    }
  }

  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`document-datasets:${input.documentId}`}))`,
    );
    const existingRows = await tx
      .select({
        relationId: schema.rag_dataset_documents.dataset_document_id,
        datasetId: schema.rag_dataset_documents.dataset_id,
      })
      .from(schema.rag_dataset_documents)
      .where(eq(schema.rag_dataset_documents.document_id, input.documentId));
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
      await tx.delete(schema.rag_dataset_documents).where(
        inArray(
          schema.rag_dataset_documents.dataset_document_id,
          removedRows.map((row) => row.relationId),
        ),
      );
      const removedTaskRows = await tx
        .select({ taskId: schema.file_processing_tasks.task_id })
        .from(schema.file_processing_tasks)
        .where(
          and(
            eq(schema.file_processing_tasks.task_type, 'rag'),
            eq(schema.file_processing_tasks.document_id, input.documentId),
            inArray(schema.file_processing_tasks.dataset_id, removedDatasetIds),
          ),
        );
      if (removedTaskRows.length) {
        await tx
          .update(schema.tasks)
          .set({
            status: 'killed',
            end_timestamp: now,
            last_update_timestamp: now,
          })
          .where(
            and(
              inArray(
                schema.tasks.task_id,
                removedTaskRows.map((row) => row.taskId),
              ),
              inArray(schema.tasks.status, ['to-be-started', 'pending']),
            ),
          );
      }
    }
    if (addedDatasetIds.length) {
      await tx.insert(schema.rag_dataset_documents).values(
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
    return { addedDatasetIds, removedDatasetIds };
  });
}

/**
 * 读取知识库当前实际生效版本的 Segment。
 *
 * pending 或失败的新版本不会参与结果；关系删除后也无法通过此入口召回旧 Segment。
 *
 * @param datasetId 目标知识库标识。
 * @param documentIds 可选文档范围；为空时读取知识库全部 active 文档。
 * @returns 按文档和位置稳定排序、携带索引版本元数据的 Segment。
 */
export async function listActiveDatasetSegments(
  datasetId: string,
  documentIds?: string[],
): Promise<RagDatasetSegmentInfo[]> {
  if (documentIds && !documentIds.length) return [];
  const rows = await db
    .select({
      relation: schema.rag_dataset_documents,
      segment: schema.document_segments,
    })
    .from(schema.rag_dataset_documents)
    .innerJoin(
      schema.documents,
      and(
        eq(
          schema.documents.document_id,
          schema.rag_dataset_documents.document_id,
        ),
        eq(schema.documents.status, 'active'),
      ),
    )
    .innerJoin(
      schema.document_segments,
      eq(
        schema.document_segments.document_version_id,
        schema.rag_dataset_documents.active_version_id,
      ),
    )
    .where(
      and(
        eq(schema.rag_dataset_documents.dataset_id, datasetId),
        isNotNull(schema.rag_dataset_documents.active_version_id),
        documentIds?.length
          ? inArray(schema.rag_dataset_documents.document_id, documentIds)
          : undefined,
      ),
    )
    .orderBy(
      asc(schema.rag_dataset_documents.document_id),
      asc(schema.document_segments.position),
    );
  return rows.map((row) => ({
    datasetId: row.relation.dataset_id,
    documentId: row.relation.document_id,
    documentVersionId: row.segment.document_version_id,
    segmentProfileVersion: row.segment.segment_profile_version,
    segmentId: row.segment.segment_id,
    parentSegmentId: row.segment.parent_segment_id,
    content: row.segment.content,
    embeddingContent: row.segment.embedding_content,
    contentHash: row.segment.content_hash,
    headingPath: JSON.parse(row.segment.heading_path) as string[],
    page: row.segment.page,
    position: row.segment.position,
    tokenCount: row.segment.token_count,
  }));
}

/** 将匹配 pending 版本的知识库关系标记为处理中。 */
export async function markRagVersionProcessing(input: {
  /** 知识库标识。 */
  datasetId: string;
  /** 文档标识。 */
  documentId: string;
  /** 本次处理的文档版本。 */
  documentVersionId: string;
  /** 当前操作用户。 */
  userId: string;
}) {
  const [updated] = await db
    .update(schema.rag_dataset_documents)
    .set({
      rag_status: 'processing',
      rag_error: null,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.rag_dataset_documents.dataset_id, input.datasetId),
        eq(schema.rag_dataset_documents.document_id, input.documentId),
        eq(
          schema.rag_dataset_documents.pending_version_id,
          input.documentVersionId,
        ),
      ),
    )
    .returning({ id: schema.rag_dataset_documents.dataset_document_id });
  return Boolean(updated);
}

/**
 * 原子发布仍是 pending 目标的 RAG 版本。
 *
 * @returns 成功切换时为 true；目标已变化或关系已删除时为 false。
 */
export async function publishRagVersion(input: {
  /** 知识库标识。 */
  datasetId: string;
  /** 文档标识。 */
  documentId: string;
  /** 本次成功处理的文档版本。 */
  documentVersionId: string;
  /** 当前操作用户。 */
  userId: string;
}) {
  const [updated] = await db
    .update(schema.rag_dataset_documents)
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
        eq(schema.rag_dataset_documents.dataset_id, input.datasetId),
        eq(schema.rag_dataset_documents.document_id, input.documentId),
        eq(
          schema.rag_dataset_documents.pending_version_id,
          input.documentVersionId,
        ),
      ),
    )
    .returning({ id: schema.rag_dataset_documents.dataset_document_id });
  return Boolean(updated);
}

/** 记录目标版本失败，同时保留旧 active 版本。 */
export async function failRagVersion(input: {
  /** 知识库标识。 */
  datasetId: string;
  /** 文档标识。 */
  documentId: string;
  /** 本次失败的目标版本。 */
  documentVersionId: string;
  /** 面向用户的安全错误摘要。 */
  error: string;
  /** 当前操作用户。 */
  userId: string;
}) {
  await db
    .update(schema.rag_dataset_documents)
    .set({
      rag_status: 'failed',
      rag_error: input.error,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.rag_dataset_documents.dataset_id, input.datasetId),
        eq(schema.rag_dataset_documents.document_id, input.documentId),
        eq(
          schema.rag_dataset_documents.pending_version_id,
          input.documentVersionId,
        ),
      ),
    );
}
