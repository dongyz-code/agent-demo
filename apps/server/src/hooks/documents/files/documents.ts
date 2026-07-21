import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { getReadableFile } from './queries.js';

import type { DocumentInfo } from '@repo/types';

/** 创建文档首版本时由处理模块提供的版本信息。 */
interface EnsureDocumentForFileInput {
  /** 已验证的源文件标识。 */
  fileId: string;
  /** 文档显示名称；为空时使用文件名。 */
  name?: string;
  /** 当前标准化规则版本。 */
  normalizerVersion: string;
  /** 当前 Segment 配置版本。 */
  segmentProfileVersion: string;
}

/**
 * 为文件幂等创建文档与首个版本，但不创建任何处理任务。
 *
 * 文件处理统一由 `processing` worker 承载，本函数仅负责文档实体与首版本落库，
 * 并把源文件以 document.version 引用绑定（文件已由 getReadableFile 校验为 verified）。
 *
 * @param input 源文件、显示名称及调用方使用的处理版本。
 * @param userId 当前操作用户。
 * @returns 已存在或新建的文档、版本标识及创建标记。
 */
export async function ensureDocumentForFile(
  input: EnsureDocumentForFileInput,
  userId: string,
) {
  const file = await getReadableFile(input.fileId);
  const [existing] = await selectDocumentRows(
    and(
      eq(schema.document_versions.source_file_id, input.fileId),
      ne(schema.documents.status, 'deleted'),
    ),
  ).limit(1);
  if (existing) {
    return {
      document: toDocumentInfo(existing),
      documentVersionId: existing.version.document_version_id,
      created: false,
    };
  }
  const now = new Date();
  const documentId = randomUUID();
  const versionId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(schema.documents).values({
      document_id: documentId,
      name: input.name?.trim() || file.filename,
      active_version_id: versionId,
      status: 'queued',
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    });
    await tx.insert(schema.document_versions).values({
      document_version_id: versionId,
      document_id: documentId,
      version: 1,
      source_file_id: input.fileId,
      status: 'queued',
      parser_version: 'pending',
      normalizer_version: input.normalizerVersion,
      segment_profile_version: input.segmentProfileVersion,
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    });
  });

  try {
    await db
      .insert(schema.file_references)
      .values({
        reference_id: randomUUID(),
        file_id: input.fileId,
        namespace: 'document.version',
        owner_id: versionId,
        role: 'source',
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .onConflictDoNothing({
        target: [
          schema.file_references.namespace,
          schema.file_references.owner_id,
          schema.file_references.role,
          schema.file_references.file_id,
        ],
      });
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.document_versions)
        .where(eq(schema.document_versions.document_version_id, versionId));
      await tx
        .delete(schema.documents)
        .where(eq(schema.documents.document_id, documentId));
    });
    throw error;
  }

  return {
    document: await getDocument(documentId, userId),
    documentVersionId: versionId,
    created: true,
  };
}

/** 按标识批量查询文档，供 RAG 等消费者组合业务视图。 */
export async function listDocumentsByIds(
  documentIds: string[],
  userId: string,
) {
  if (!documentIds.length) return [];
  const rows = await selectDocumentRows(
    and(
      inArray(schema.documents.document_id, documentIds),
      ne(schema.documents.status, 'deleted'),
    ),
  );
  const byId = new Map(
    rows.map((row) => [row.document.document_id, toDocumentInfo(row)]),
  );
  return documentIds.flatMap((documentId) => {
    const document = byId.get(documentId);
    return document ? [document] : [];
  });
}

/** 查询单个文档。 */
export async function getDocument(documentId: string, userId: string) {
  const [row] = await selectDocumentRows(
    and(
      eq(schema.documents.document_id, documentId),
      ne(schema.documents.status, 'deleted'),
    ),
  ).limit(1);
  if (!row) {
    throw new ROOT_ERROR('相关文件不存在', 'DOCUMENT_NOT_FOUND: 文档不存在');
  }
  return toDocumentInfo(row);
}

/** 构造文档与当前版本联合查询。 */
function selectDocumentRows(where: ReturnType<typeof and>) {
  return db
    .select({
      document: schema.documents,
      version: schema.document_versions,
    })
    .from(schema.documents)
    .innerJoin(
      schema.document_versions,
      eq(
        schema.document_versions.document_version_id,
        schema.documents.active_version_id,
      ),
    )
    .where(where);
}

/** 转换文档和当前版本为公共信息。 */
function toDocumentInfo(row: {
  document: typeof schema.documents.$inferSelect;
  version: typeof schema.document_versions.$inferSelect;
}): DocumentInfo {
  return {
    documentId: row.document.document_id,
    name: row.document.name,
    sourceFileId: row.version.source_file_id,
    status: row.document.status,
    version: row.version.version,
    createdAt: row.document.create_timestamp,
  };
}
