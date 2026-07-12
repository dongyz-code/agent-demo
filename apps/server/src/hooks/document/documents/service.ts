import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, inArray, ne } from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
import {
  bindFile,
  getReadableFile,
  releaseFile,
} from '@/hooks/upload/index.js';
import { createDocumentError } from '../errors.js';
import {
  DEFAULT_DOCUMENT_PROCESSING_CONFIG_VERSION,
  scheduleDocumentProcessing,
} from '../processing/runner.js';
import { NORMALIZER_VERSION } from '../normalization/normalize.js';
import { getDefaultSegmentProfile } from '../segmentation/profiles.js';

import type { DocumentInfo, DocumentStatus } from '@repo/types';
import type { DocumentActor } from '../types.js';

/** 使用已验证通用文件创建与知识库无关的文档及首个版本。 */
export async function createDocument(
  input: { fileId: string; name?: string },
  actor: DocumentActor,
) {
  const file = await getReadableFile(input.fileId, actor.tenantId);
  const [existing] = await selectDocumentRows(
    and(
      eq(schema.documents.tenant_id, actor.tenantId),
      eq(schema.document_versions.source_file_id, input.fileId),
      ne(schema.documents.status, 'deleted'),
    ),
  ).limit(1);
  if (existing) {
    return toDocumentInfo(existing);
  }
  const now = new Date();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const jobId = randomUUID();
  const profile = getDefaultSegmentProfile();

  await db.transaction(async (tx) => {
    await tx.insert(schema.documents).values({
      document_id: documentId,
      tenant_id: actor.tenantId,
      name: input.name?.trim() || file.filename,
      active_version_id: versionId,
      status: 'queued',
      create_user_id: actor.userId,
      create_timestamp: now,
      last_update_user_id: actor.userId,
      last_update_timestamp: now,
    });
    await tx.insert(schema.document_versions).values({
      document_version_id: versionId,
      document_id: documentId,
      version: 1,
      source_file_id: input.fileId,
      status: 'queued',
      parser_version: 'pending',
      normalizer_version: NORMALIZER_VERSION,
      segment_profile_version: profile.version,
      create_user_id: actor.userId,
      create_timestamp: now,
      last_update_user_id: actor.userId,
      last_update_timestamp: now,
    });
    await tx.insert(schema.document_processing_jobs).values({
      job_id: jobId,
      document_version_id: versionId,
      stage: 'queued',
      status: 'pending',
      config_version: DEFAULT_DOCUMENT_PROCESSING_CONFIG_VERSION,
      processed_items: 0,
      total_items: 0,
      checkpoint: null,
      error_code: null,
      error_message: null,
      start_timestamp: null,
      end_timestamp: null,
      create_user_id: actor.userId,
      create_timestamp: now,
      last_update_user_id: actor.userId,
      last_update_timestamp: now,
    });
  });

  try {
    await bindFile(
      {
        fileId: input.fileId,
        namespace: 'document.version',
        ownerId: versionId,
        role: 'source',
      },
      actor,
    );
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.document_processing_jobs)
        .where(eq(schema.document_processing_jobs.job_id, jobId));
      await tx
        .delete(schema.document_versions)
        .where(eq(schema.document_versions.document_version_id, versionId));
      await tx
        .delete(schema.documents)
        .where(eq(schema.documents.document_id, documentId));
    });
    throw error;
  }

  scheduleDocumentProcessing(jobId);
  return await getDocument(documentId, actor);
}

/** 查询当前租户文档列表。 */
export async function listDocuments(
  form: {
    /** 名称搜索。 */
    search?: string;
    /** 状态筛选。 */
    status?: DocumentStatus[];
    /** 分页范围。 */
    limit?: number[];
    /** 是否返回总数。 */
    withCount?: boolean;
  },
  actor: DocumentActor,
) {
  const [start = 0, end = 20] = form.limit ?? [];
  const where = and(
    eq(schema.documents.tenant_id, actor.tenantId),
    ne(schema.documents.status, 'deleted'),
    form.search?.trim()
      ? ilike(schema.documents.name, `%${form.search.trim()}%`)
      : undefined,
    form.status?.length
      ? inArray(schema.documents.status, form.status)
      : undefined,
  );
  const [rows, count] = await Promise.all([
    selectDocumentRows(where)
      .orderBy(desc(schema.documents.create_timestamp))
      .offset(start)
      .limit(Math.max(0, end - start)),
    form.withCount ? countRows(schema.documents, where) : Promise.resolve(0),
  ]);
  return { list: rows.map(toDocumentInfo), count };
}

/** 按标识批量查询当前租户文档，供 RAG 等消费者组合业务视图。 */
export async function listDocumentsByIds(
  documentIds: string[],
  actor: DocumentActor,
) {
  if (!documentIds.length) return [];
  const rows = await selectDocumentRows(
    and(
      eq(schema.documents.tenant_id, actor.tenantId),
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

/** 查询当前租户单个文档。 */
export async function getDocument(documentId: string, actor: DocumentActor) {
  const [row] = await selectDocumentRows(
    and(
      eq(schema.documents.document_id, documentId),
      eq(schema.documents.tenant_id, actor.tenantId),
      ne(schema.documents.status, 'deleted'),
    ),
  ).limit(1);
  if (!row) {
    throw createDocumentError(
      'DOCUMENT_NOT_FOUND',
      '文档不存在',
      'not-found',
    );
  }
  return toDocumentInfo(row);
}

/** 逻辑删除文档并释放当前版本源文件引用。 */
export async function removeDocument(documentId: string, actor: DocumentActor) {
  const document = await getDocument(documentId, actor);
  const [version] = await db
    .select()
    .from(schema.document_versions)
    .where(
      and(
        eq(schema.document_versions.document_id, documentId),
        eq(schema.document_versions.version, document.version),
      ),
    )
    .limit(1);
  if (!version) return;
  await db
    .update(schema.documents)
    .set({
      status: 'deleted',
      last_update_user_id: actor.userId,
      last_update_timestamp: new Date(),
    })
    .where(eq(schema.documents.document_id, documentId));
  await releaseFile(
    {
      fileId: version.source_file_id,
      namespace: 'document.version',
      ownerId: version.document_version_id,
      role: 'source',
    },
    actor,
  );
}

/** 为当前文档版本创建新的处理任务。 */
export async function reprocessDocument(
  documentId: string,
  actor: DocumentActor,
) {
  await getDocument(documentId, actor);
  const [version] = await db
    .select()
    .from(schema.document_versions)
    .where(eq(schema.document_versions.document_id, documentId))
    .orderBy(desc(schema.document_versions.version))
    .limit(1);
  if (!version) {
    throw createDocumentError(
      'DOCUMENT_VERSION_NOT_FOUND',
      '文档版本不存在',
      'not-found',
    );
  }
  const jobId = randomUUID();
  const now = new Date();
  await db.insert(schema.document_processing_jobs).values({
    job_id: jobId,
    document_version_id: version.document_version_id,
    stage: 'queued',
    status: 'pending',
    config_version: `${DEFAULT_DOCUMENT_PROCESSING_CONFIG_VERSION}:rebuild:${now.getTime()}`,
    processed_items: 0,
    total_items: 0,
    checkpoint: null,
    error_code: null,
    error_message: null,
    start_timestamp: null,
    end_timestamp: null,
    create_user_id: actor.userId,
    create_timestamp: now,
    last_update_user_id: actor.userId,
    last_update_timestamp: now,
  });
  scheduleDocumentProcessing(jobId);
  return { jobId };
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
