import { randomUUID } from 'node:crypto';
import { and, eq, max, ne, sql } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { getDocumentSourceFile } from '../storage/source.js';
import { createDocumentContentTask } from './content/task.js';
import { getDocumentDetail, resolveDocumentVersion } from './read.js';

/** 将已验证源文件绑定为文档版本时需要的输入。 */
export interface CreateDocumentVersionFromFileInput {
  /** 服务端内部源文件标识。 */
  fileId: string;
  /** 已有文档标识；为空时创建新文档。 */
  documentId?: string;
  /** 新文档显示名称；为空时使用源文件名。 */
  name?: string;
  /** 新文档后续版本默认是否进入 RAG。 */
  ragEnabled?: boolean;
}

/** 文件绑定完成后的稳定结果。 */
export interface DocumentVersionBinding {
  /** 文档基础信息。 */
  document: {
    /** 文档稳定标识。 */
    documentId: string;
    /** 文档显示名称。 */
    name: string;
  };
  /** 新建或复用的版本标识。 */
  documentVersionId: string;
  /** 文档内业务版本号。 */
  version: number;
  /** 本次调用是否创建了版本。 */
  created: boolean;
}

/**
 * 将已验证 File 幂等绑定为新文档或已有文档的新版本。
 *
 * @param input 源文件、可选目标文档及新文档默认策略。
 * @param userId 当前操作用户，用于数据范围与审计。
 * @returns 已创建或复用的文档版本绑定。
 */
export async function createDocumentVersionFromFile(
  input: CreateDocumentVersionFromFileInput,
  userId: string,
): Promise<DocumentVersionBinding> {
  const file = await getDocumentSourceFile(input.fileId);
  if (file.status !== 'verified' || file.create_user_id !== userId) {
    throw new ROOT_ERROR('数据异常');
  }

  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`document-source:${input.fileId}`}))`,
    );
    const [existing] = await tx
      .select({
        documentId: schemas.documents.document_id,
        name: schemas.documents.name,
        documentVersionId: schemas.document_versions.document_version_id,
        version: schemas.document_versions.version,
      })
      .from(schemas.document_versions)
      .innerJoin(
        schemas.documents,
        eq(
          schemas.documents.document_id,
          schemas.document_versions.document_id,
        ),
      )
      .where(eq(schemas.document_versions.source_file_id, input.fileId))
      .limit(1);
    if (existing) {
      if (input.documentId && existing.documentId !== input.documentId) {
        throw new ROOT_ERROR('数据异常');
      }
      return {
        document: {
          documentId: existing.documentId,
          name: existing.name,
        },
        documentVersionId: existing.documentVersionId,
        version: existing.version,
        created: false,
      };
    }

    const now = new Date();
    if (!input.documentId) {
      const documentId = randomUUID();
      const documentVersionId = randomUUID();
      const name = input.name?.trim() || file.filename;
      await tx.insert(schemas.documents).values({
        document_id: documentId,
        name,
        active_version_id: documentVersionId,
        rag_enabled: input.ragEnabled ?? true,
        status: 'active',
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      });
      await tx.insert(schemas.document_versions).values({
        document_version_id: documentVersionId,
        document_id: documentId,
        version: 1,
        source_file_id: input.fileId,
        preview_status: 'pending',
        preview_page_count: 0,
        preview_error: null,
        preview_converter_version: null,
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      });
      return {
        document: { documentId, name },
        documentVersionId,
        version: 1,
        created: true,
      };
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`document-version:${input.documentId}`}))`,
    );
    const [document] = await tx
      .select()
      .from(schemas.documents)
      .where(
        and(
          eq(schemas.documents.document_id, input.documentId),
          eq(schemas.documents.create_user_id, userId),
          ne(schemas.documents.status, 'deleted'),
        ),
      )
      .limit(1);
    if (!document) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    const [latest] = await tx
      .select({ version: max(schemas.document_versions.version) })
      .from(schemas.document_versions)
      .where(eq(schemas.document_versions.document_id, input.documentId));
    const version = (latest?.version ?? 0) + 1;
    const documentVersionId = randomUUID();
    await tx.insert(schemas.document_versions).values({
      document_version_id: documentVersionId,
      document_id: input.documentId,
      version,
      source_file_id: input.fileId,
      preview_status: 'pending',
      preview_page_count: 0,
      preview_error: null,
      preview_converter_version: null,
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    });
    await tx
      .update(schemas.documents)
      .set({
        active_version_id: documentVersionId,
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .where(eq(schemas.documents.document_id, input.documentId));
    return {
      document: {
        documentId: document.document_id,
        name: document.name,
      },
      documentVersionId,
      version,
      created: true,
    };
  });
}

/**
 * 将同一文档的历史版本设置为当前展示版本，并对齐已有知识库关系。
 *
 * @param documentId 文档稳定标识。
 * @param documentVersionId 目标版本标识。
 * @param userId 当前操作用户。
 * @returns 更新后的文档详情。
 */
export async function setActiveDocumentVersion(
  documentId: string,
  documentVersionId: string,
  userId: string,
) {
  await resolveDocumentVersion(documentId, documentVersionId, userId);
  const relationCount = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`document-active:${documentId}`}))`,
    );
    const now = new Date();
    const [updated] = await tx
      .update(schemas.documents)
      .set({
        active_version_id: documentVersionId,
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .where(
        and(
          eq(schemas.documents.document_id, documentId),
          eq(schemas.documents.create_user_id, userId),
          ne(schemas.documents.status, 'deleted'),
        ),
      )
      .returning({ id: schemas.documents.document_id });
    if (!updated) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    const relations = await tx
      .update(schemas.rag_dataset_documents)
      .set({
        pending_version_id: documentVersionId,
        rag_status: 'pending',
        rag_error: null,
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .where(eq(schemas.rag_dataset_documents.document_id, documentId))
      .returning({ id: schemas.rag_dataset_documents.dataset_document_id });
    return relations.length;
  });

  if (ROOT.fileProcessing.enabled && relationCount) {
    await createDocumentContentTask(
      {
        documentId,
        documentVersionId,
        triggerSource: 'manual',
      },
      userId,
    );
  }
  return await getDocumentDetail(documentId, userId);
}
