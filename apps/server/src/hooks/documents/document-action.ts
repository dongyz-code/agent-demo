import { randomUUID } from 'node:crypto';
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  max,
  or,
  sql,
} from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import {
  buildWhere,
  db,
  pgAdvisoryXactLock,
  schemas,
} from '@/database/index.js';
import {
  documentAccessWhere,
  lockDocument,
  requireDocument,
} from './access.js';
import { documentPreview } from './preview/index.js';
import { documentsConfig } from './config.js';
import { resolveDocumentVersion } from './document/resolve-version.js';
import { upload } from '@/hooks/upload/index.js';
import { documentRag } from './rag/index.js';
import { enqueueDocumentCleanup } from './tasks/cleanup.js';
import { enqueueDocumentProcess } from './document-process-action.js';
import type {
  DocumentAction as DocumentApi,
  DocumentUploadResult,
  FileAccess,
  DocumentDetail,
  DocumentInfo,
  DocumentPreviewPageInfo,
  DocumentPreviewPageVariant,
  DocumentPreviewWindow,
  DocumentVersionInfo,
  FileProcessingTriggerSource,
  RagDatasetDocumentSummary,
} from '@repo/types';
import type { DocumentDatasetRelationMode } from './rag/index.js';
import type { DbTransaction } from '@/database/index.js';

/** 文档复杂搜索的服务端输入。 */
interface SearchDocumentsInput {
  /** 文档名称或当前文件名关键词。 */
  search?: string;
  /** 文档生命周期状态筛选。 */
  status?: DocumentInfo['status'][];
  /** 当前版本预览状态筛选。 */
  previewStatus?: DocumentVersionInfo['previewStatus'][];
  /** 可选知识库筛选。 */
  datasetId?: string;
  /** 文档创建时间范围。 */
  createdAt?: (Date | null)[];
  /** 左闭右开的分页范围。 */
  limit?: number[];
  /** 是否返回符合条件的总数。 */
  withCount?: boolean;
}

/** 文档、当前版本与内部源文件的联合行。 */
type CurrentDocumentRow = {
  document: typeof schemas.documents.$inferSelect;
  version: typeof schemas.document_versions.$inferSelect;
  file: typeof schemas.files.$inferSelect;
};

/** 当前页文档使用的固定批量聚合结果。 */
interface DocumentAggregates {
  /** 一次批量查询生成的封面文件访问地址。 */
  coverAccessByFile: Map<string, FileAccess>;
  /** 每个文档的版本数量。 */
  versionCountByDocument: Map<string, number>;
  /** 每个文档的知识库关系摘要。 */
  datasetsByDocument: Map<string, RagDatasetDocumentSummary[]>;
  /** 每个当前版本的第一页内部行。 */
  coverByVersion: Map<
    string,
    typeof schemas.document_preview_pages.$inferSelect
  >;
  /** 每个当前版本封面实际使用的页面层级。 */
  coverVariantByVersion: Map<string, DocumentPreviewPageVariant>;
}

/** 将已验证源文件绑定为文档版本时需要的输入。 */
interface CreateDocumentVersionFromFileInput {
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
interface DocumentVersionBinding {
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

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;

/** 页面窗口查询输入。 */
interface GetDocumentPreviewPagesInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 可选历史版本；为空时使用当前版本。 */
  documentVersionId?: string;
  /** 从 1 开始的页面窗口起点。 */
  startPage?: number;
  /** 页面窗口大小，服务端最多返回 30 页。 */
  pageSize?: number;
}

/** 文档知识库关系变更与 RAG 任务触发输入。 */
interface ApplyDocumentDatasetAssignmentInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 本次关系应处理的不可变文档版本。 */
  documentVersionId: string;
  /** 需要加入、移出或作为完整结果的知识库标识。 */
  datasetIds: string[];
  /** 关系集合变更方式。 */
  mode: DocumentDatasetRelationMode;
  /** 当前操作用户。 */
  userId: string;
  /** 上传自动触发或用户手动操作。 */
  triggerSource?: FileProcessingTriggerSource;
}

/**
 * 文档查询、版本、预览、知识库和处理任务业务动作。
 *
 * Worker、parser、对象存储和向量写入作为独立执行边界保留。
 */
class DocumentAction {
  /**
   * 将通用上传结果绑定为文档版本，并在同一事务内调度首次预览。
   *
   * @param input 已验证文档源文件句柄和可选目标文档。
   * @param userId 当前用户，用于文件所有权、文档范围和审计。
   * @returns 幂等的文档版本结果；绑定失败不影响已完成上传。
   */
  async bindUploadedFile(
    input: DocumentApi['version/create']['body'],
    userId: string,
  ): Promise<DocumentUploadResult> {
    return await db.transaction(async (transaction) => {
      const result = await this.createVersionFromFile(
        {
          fileId: input.key,
          documentId: input.documentId,
          ragEnabled: false,
        },
        userId,
        transaction,
      );
      if (result.created && documentsConfig.fileProcessing.enabled) {
        await enqueueDocumentProcess(
          {
            documentId: result.document.documentId,
            documentVersionId: result.documentVersionId,
            operations: ['preview'],
            triggerSource: 'upload',
          },
          userId,
          transaction,
        );
      }
      return {
        documentId: result.document.documentId,
        documentVersionId: result.documentVersionId,
        version: result.version,
        created: result.created,
      };
    });
  }

  /**
   * 搜索授权范围内的文档聚合摘要。
   *
   * @param input 筛选、分页和可选知识库范围。
   * @param userId 当前用户；系统管理员可以访问全部文档。
   * @returns 文档列表及可选总数。
   */
  async search(
    input: SearchDocumentsInput,
    userId: string,
  ): Promise<{ list: DocumentInfo[]; count: number }> {
    const [start = 0, end = 20] = input.limit ?? [];
    const [createdStart, createdEnd] = input.createdAt ?? [];
    const where = buildWhere((filter) => {
      filter.push(documentAccessWhere(userId));
      const search = input.search?.trim();
      if (search) {
        filter.push(
          or(
            ilike(schemas.documents.name, `%${search}%`),
            ilike(schemas.files.filename, `%${search}%`),
          ),
        );
      }
      if (input.status?.length) {
        filter.push(inArray(schemas.documents.status, input.status));
      }
      if (input.previewStatus?.length) {
        filter.push(
          inArray(
            schemas.document_versions.preview_status,
            input.previewStatus,
          ),
        );
      }
      if (createdStart) {
        filter.push(gte(schemas.documents.create_timestamp, createdStart));
      }
      if (createdEnd) {
        filter.push(lte(schemas.documents.create_timestamp, createdEnd));
      }
      if (input.datasetId) {
        filter.push(sql`exists (
          select 1
          from rag_dataset_documents rdd
          where rdd.document_id = ${schemas.documents.document_id}
            and rdd.dataset_id = ${input.datasetId}
        )`);
      }
    });
    const baseQuery = this.selectCurrentDocumentRows(where);
    const [rows, countResult] = await Promise.all([
      baseQuery
        .orderBy(desc(schemas.documents.create_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      input.withCount
        ? db
            .select({ value: count() })
            .from(this.selectCurrentDocumentRows(where).as('current_documents'))
        : Promise.resolve([]),
    ]);
    if (!rows.length) {
      return { list: [], count: countResult[0]?.value ?? 0 };
    }
    const aggregates = await this.loadDocumentAggregates(rows);
    return {
      list: await Promise.all(
        rows.map(async (row) => await this.toDocumentInfo(row, aggregates)),
      ),
      count: countResult[0]?.value ?? 0,
    };
  }

  /**
   * 查询单个文档详情与完整版本历史。
   *
   * @param documentId 文档稳定标识。
   * @param userId 当前用户；系统管理员可以访问全部文档。
   * @returns 文档聚合详情。
   */
  async getDetail(documentId: string, userId: string): Promise<DocumentDetail> {
    const where = documentAccessWhere(userId, documentId);
    const [current] = await this.selectCurrentDocumentRows(where).limit(1);
    if (!current) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    const versionRows = await db
      .select({ version: schemas.document_versions, file: schemas.files })
      .from(schemas.document_versions)
      .innerJoin(
        schemas.files,
        eq(schemas.files.file_id, schemas.document_versions.source_file_id),
      )
      .where(eq(schemas.document_versions.document_id, documentId))
      .orderBy(desc(schemas.document_versions.version));
    const aggregates = await this.loadDocumentAggregates([current]);
    return {
      ...(await this.toDocumentInfo(current, aggregates)),
      versions: versionRows.map((row) => this.toDocumentVersionInfo(row)),
    };
  }

  /**
   * 为当前或显式指定的文档版本签发源文件下载地址。
   *
   * @param documentId 文档稳定标识。
   * @param documentVersionId 可选历史版本标识。
   * @param userId 当前用户。
   * @returns 实际版本标识和短期下载地址。
   */
  async getDownload(
    documentId: string,
    documentVersionId: string | undefined,
    userId: string,
  ) {
    const row = await resolveDocumentVersion(
      documentId,
      documentVersionId,
      userId,
    );
    const signed = await upload.getUrl(row.file.file_id, {
      disposition: 'attachment',
    });
    return {
      documentVersionId: row.version.document_version_id,
      url: signed.url,
      expiresAt: signed.expiresAt,
    };
  }

  /** 构造文档、当前版本与源文件的联合查询。 */
  private selectCurrentDocumentRows(where: ReturnType<typeof and>) {
    return db
      .select({
        document: schemas.documents,
        version: schemas.document_versions,
        file: schemas.files,
      })
      .from(schemas.documents)
      .innerJoin(
        schemas.document_versions,
        eq(
          schemas.document_versions.document_version_id,
          schemas.documents.active_version_id,
        ),
      )
      .innerJoin(
        schemas.files,
        eq(schemas.files.file_id, schemas.document_versions.source_file_id),
      )
      .where(where);
  }

  /**
   * 批量读取版本数、知识库关系和与处理状态匹配的当前版本封面。
   *
   * @param rows 当前分页已经过数据权限过滤的文档联合行。
   * @returns 文档列表渲染需要的聚合映射。
   */
  private async loadDocumentAggregates(
    rows: CurrentDocumentRow[],
  ): Promise<DocumentAggregates> {
    const documentIds = rows.map((row) => row.document.document_id);
    const versionIds = rows.map((row) => row.version.document_version_id);
    const coverWhere = buildWhere((filter) => {
      filter.push(
        inArray(schemas.document_preview_pages.document_version_id, versionIds),
        eq(schemas.document_preview_pages.page_number, 1),
      );
    });
    const [versionCounts, datasetRows, coverRows, quickCoverRows] =
      await Promise.all([
        db
          .select({
            documentId: schemas.document_versions.document_id,
            value: count(),
          })
          .from(schemas.document_versions)
          .where(inArray(schemas.document_versions.document_id, documentIds))
          .groupBy(schemas.document_versions.document_id),
        db
          .select({
            documentId: schemas.rag_dataset_documents.document_id,
            relation: schemas.rag_dataset_documents,
            dataset: schemas.rag_datasets,
          })
          .from(schemas.rag_dataset_documents)
          .innerJoin(
            schemas.rag_datasets,
            eq(
              schemas.rag_datasets.dataset_id,
              schemas.rag_dataset_documents.dataset_id,
            ),
          )
          .where(
            inArray(schemas.rag_dataset_documents.document_id, documentIds),
          ),
        db.select().from(schemas.document_preview_pages).where(coverWhere),
        db
          .select()
          .from(schemas.document_preview_quick_pages)
          .where(
            and(
              inArray(
                schemas.document_preview_quick_pages.document_version_id,
                versionIds,
              ),
              eq(schemas.document_preview_quick_pages.page_number, 1),
            ),
          ),
      ]);
    const datasetsByDocument = new Map<string, RagDatasetDocumentSummary[]>();
    for (const row of datasetRows) {
      const list = datasetsByDocument.get(row.documentId) ?? [];
      list.push({
        datasetId: row.dataset.dataset_id,
        name: row.dataset.name,
        activeVersionId: row.relation.active_version_id,
        pendingVersionId: row.relation.pending_version_id,
        status: row.relation.rag_status,
        error: row.relation.rag_error,
      });
      datasetsByDocument.set(row.documentId, list);
    }
    const clearCoverByVersion = new Map(
      coverRows.map((row) => [row.document_version_id, row]),
    );
    const quickCoverByVersion = new Map(
      quickCoverRows.map((row) => [row.document_version_id, row]),
    );
    const coverByVersion = new Map<
      string,
      typeof schemas.document_preview_pages.$inferSelect
    >();
    const coverVariantByVersion = new Map<string, DocumentPreviewPageVariant>();
    for (const row of rows) {
      const versionId = row.version.document_version_id;
      const clearCover = clearCoverByVersion.get(versionId);
      const quickCover = quickCoverByVersion.get(versionId);
      if (row.version.preview_status === 'ready' && clearCover) {
        coverByVersion.set(versionId, clearCover);
        coverVariantByVersion.set(versionId, 'clear');
        continue;
      }
      if (row.version.preview_status === 'processing' && quickCover) {
        coverByVersion.set(versionId, quickCover);
        coverVariantByVersion.set(versionId, 'quick');
      }
    }
    const coverAccessByFile = await upload.getUrls(
      [...coverByVersion.values()].map((page) => page.file_id),
      { disposition: 'inline' },
    );
    return {
      coverAccessByFile,
      versionCountByDocument: new Map(
        versionCounts.map((row) => [row.documentId, row.value]),
      ),
      datasetsByDocument,
      coverByVersion,
      coverVariantByVersion,
    };
  }

  /** 将数据库联合行转换为文档列表摘要。 */
  private async toDocumentInfo(
    row: CurrentDocumentRow,
    aggregates: DocumentAggregates,
  ): Promise<DocumentInfo> {
    const cover = aggregates.coverByVersion.get(
      row.version.document_version_id,
    );
    return {
      documentId: row.document.document_id,
      name: row.document.name,
      status: row.document.status,
      ragEnabled: row.document.rag_enabled,
      activeVersion: this.toDocumentVersionInfo({
        version: row.version,
        file: row.file,
      }),
      versionCount:
        aggregates.versionCountByDocument.get(row.document.document_id) ?? 1,
      cover: cover
        ? await this.toPreviewPageInfo(
            cover,
            aggregates.coverAccessByFile.get(cover.file_id)!,
            aggregates.coverVariantByVersion.get(
              row.version.document_version_id,
            ) ?? 'clear',
          )
        : null,
      datasets:
        aggregates.datasetsByDocument.get(row.document.document_id) ?? [],
      createdAt: row.document.create_timestamp,
    };
  }

  /** 将版本与源文件联合行转换为公共版本摘要。 */
  private toDocumentVersionInfo(row: {
    version: typeof schemas.document_versions.$inferSelect;
    file: typeof schemas.files.$inferSelect;
  }): DocumentVersionInfo {
    return {
      documentVersionId: row.version.document_version_id,
      version: row.version.version,
      filename: row.file.filename,
      extension: row.file.extension,
      contentType: row.file.content_type ?? row.file.declared_content_type,
      size: row.file.size,
      previewStatus: row.version.preview_status,
      previewPageCount: row.version.preview_page_count,
      previewError: row.version.preview_error,
      createdAt: row.version.create_timestamp,
    };
  }

  /**
   * 为已通过文档权限校验的封面页面签发短期访问地址。
   *
   * @param page 快速表或清晰表中的第一页内部行。
   * @param access 批量生成的短期访问地址，调用前已校验文档权限。
   * @param variant 当前页面实际所属层级。
   * @returns 不包含对象存储位置的公共页面描述。
   */
  private toPreviewPageInfo(
    page: typeof schemas.document_preview_pages.$inferSelect,
    access: FileAccess,
    variant: DocumentPreviewPageVariant,
  ): DocumentPreviewPageInfo {
    return {
      documentVersionId: page.document_version_id,
      pageNumber: page.page_number,
      variant,
      width: page.width,
      height: page.height,
      contentType: page.content_type,
      size: page.size,
      url: access.url,
      expiresAt: access.expiresAt,
    };
  }

  /**
   * 将已验证 File 幂等绑定为新文档或已有文档的新版本。
   *
   * @param input 源文件、可选目标文档及新文档默认策略。
   * @param userId 当前操作用户，用于数据范围与审计。
   * @param transaction 可选外层事务，使版本创建和处理任务入队原子提交。
   * @returns 已创建或复用的文档版本绑定。
   */
  async createVersionFromFile(
    input: CreateDocumentVersionFromFileInput,
    userId: string,
    transaction?: DbTransaction,
  ): Promise<DocumentVersionBinding> {
    if (!transaction) {
      return await db.transaction(
        async (tx) => await this.createVersionFromFile(input, userId, tx),
      );
    }
    const file = await upload.requireOwned(input.fileId, userId, transaction);
    if (file.purpose !== 'document') throw new ROOT_ERROR('非法参数');

    const tx = transaction;
    await pgAdvisoryXactLock(tx, 'document-source', input.fileId);
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
      await lockDocument(tx, existing.documentId);
      await requireDocument(existing.documentId, userId, tx);
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
        rag_enabled: input.ragEnabled ?? false,
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

    const targetDocumentId = input.documentId;
    await lockDocument(tx, targetDocumentId);
    const document = await requireDocument(targetDocumentId, userId, tx);
    const [latest] = await tx
      .select({ version: max(schemas.document_versions.version) })
      .from(schemas.document_versions)
      .where(eq(schemas.document_versions.document_id, targetDocumentId));
    const version = (latest?.version ?? 0) + 1;
    const documentVersionId = randomUUID();
    await tx.insert(schemas.document_versions).values({
      document_version_id: documentVersionId,
      document_id: targetDocumentId,
      version,
      source_file_id: input.fileId,
      preview_status: 'pending',
      preview_page_count: 0,
      preview_error: null,
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
      .where(eq(schemas.documents.document_id, targetDocumentId));
    return {
      document: {
        documentId: document.document_id,
        name: document.name,
      },
      documentVersionId,
      version,
      created: true,
    };
  }

  /**
   * 将同一文档的历史版本设置为当前展示版本，并对齐已有知识库关系。
   *
   * @param documentId 文档稳定标识。
   * @param documentVersionId 目标版本标识。
   * @param userId 当前操作用户。
   * @returns 更新后的文档详情；同版本 RAG 正在执行时回滚本次变更并提示稍后重试。
   */
  async setActiveVersion(
    documentId: string,
    documentVersionId: string,
    userId: string,
  ) {
    await db.transaction(async (tx) => {
      await lockDocument(tx, documentId);
      await resolveDocumentVersion(documentId, documentVersionId, userId, tx);
      await tx
        .update(schemas.documents)
        .set({
          active_version_id: documentVersionId,
          last_update_user_id: userId,
          last_update_timestamp: new Date(),
        })
        .where(documentAccessWhere(userId, documentId));
      const relations = await documentRag.setPendingVersion(tx, {
        documentId,
        documentVersionId,
        userId,
      });
      if (documentsConfig.fileProcessing.enabled && relations) {
        await enqueueDocumentProcess(
          {
            documentId,
            documentVersionId,
            operations: ['rag'],
            triggerSource: 'manual',
            reuseActive: false,
          },
          userId,
          tx,
        );
      }
    });
    return await this.getDetail(documentId, userId);
  }

  /**
   * 幂等逻辑删除整个文档并阻止现有 RAG 关系继续生效。
   *
   * @param documentId 文档稳定标识。
   * @param userId 当前操作用户。
   * @returns 固定成功结果；已经删除时同样成功。
   */
  async remove(documentId: string, userId: string): Promise<'ok'> {
    const documentWhere = documentAccessWhere(userId, documentId, true);
    const [document] = await db
      .select({ id: schemas.documents.document_id })
      .from(schemas.documents)
      .where(documentWhere)
      .limit(1);
    if (!document) return 'ok';
    await enqueueDocumentCleanup(documentId, userId);
    return 'ok';
  }

  /**
   * 查询当前或指定版本的安全页面窗口。
   *
   * @param input 文档版本与页面范围。
   * @param userId 当前用户，用于文档数据范围校验。
   * @returns 版本状态、总页数及短期签名页面地址。
   */
  async getPreviewPages(
    input: GetDocumentPreviewPagesInput,
    userId: string,
  ): Promise<DocumentPreviewWindow> {
    const startPage = input.startPage ?? 1;
    const requestedPageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(startPage) || startPage < 1) {
      throw new ROOT_ERROR('非法参数');
    }
    if (!Number.isInteger(requestedPageSize) || requestedPageSize < 1) {
      throw new ROOT_ERROR('非法参数');
    }
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
    const resolved = await resolveDocumentVersion(
      input.documentId,
      input.documentVersionId,
      userId,
    );
    const version = resolved.version;
    let variant: DocumentPreviewPageVariant;
    if (version.preview_status === 'ready') variant = 'clear';
    else if (
      version.preview_status === 'processing' &&
      version.preview_page_count > 0
    ) {
      variant = 'quick';
    } else {
      return {
        documentId: input.documentId,
        documentVersionId: version.document_version_id,
        status: version.preview_status,
        pageCount: version.preview_page_count,
        pages: [],
      };
    }
    const rows = await documentPreview.loadPages(
      version.document_version_id,
      startPage,
      pageSize,
      variant,
    );
    const accessByFile = await upload.getUrls(
      rows.map((page) => page.file_id),
      {
        disposition: 'inline',
      },
    );
    const pages = rows.map((page) =>
      this.toPreviewPageInfo(page, accessByFile.get(page.file_id)!, variant),
    );
    return {
      documentId: input.documentId,
      documentVersionId: version.document_version_id,
      status: version.preview_status,
      pageCount: version.preview_page_count,
      pages,
    };
  }

  /**
   * 幂等重新处理当前版本并返回任务创建后的页面状态。
   *
   * @param input 文档与可选历史版本。
   * @param userId 当前操作用户。
   * @returns pending、processing 或任务执行后的页面窗口。
   */
  async retryPreview(
    input: Pick<
      GetDocumentPreviewPagesInput,
      'documentId' | 'documentVersionId'
    >,
    userId: string,
  ): Promise<DocumentPreviewWindow> {
    const resolved = await resolveDocumentVersion(
      input.documentId,
      input.documentVersionId,
      userId,
    );
    let triggerSource: FileProcessingTriggerSource = 'rerun';
    if (resolved.version.preview_status === 'failed') triggerSource = 'retry';
    await enqueueDocumentProcess(
      {
        documentId: input.documentId,
        documentVersionId: resolved.version.document_version_id,
        operations: ['preview'],
        triggerSource,
      },
      userId,
    );
    return await this.getPreviewPages(input, userId);
  }

  /**
   * 在同一事务内修改知识库关系并创建 RAG 任务，拒绝覆盖正在处理的同版本。
   *
   * @param input 文档版本、知识库集合、变更方式、处理配置和审计用户。
   * @returns 关系更新及 RAG 任务触发完成后结束。
   */
  private async applyDocumentDatasetAssignment(
    input: ApplyDocumentDatasetAssignmentInput,
  ): Promise<void> {
    await db.transaction(async (transaction) => {
      await documentRag.updateRelations(input, transaction);
      if (
        documentsConfig.fileProcessing.enabled &&
        input.mode !== 'remove' &&
        input.datasetIds.length
      ) {
        await enqueueDocumentProcess(
          {
            documentId: input.documentId,
            documentVersionId: input.documentVersionId,
            operations: ['rag'],
            triggerSource: input.triggerSource ?? 'manual',
            reuseActive: false,
          },
          input.userId,
          transaction,
        );
      }
    });
  }

  /**
   * 修改文档知识库集合并返回刷新后的文档详情。
   *
   * @param documentId 文档稳定标识。
   * @param datasetIds 需要加入、移出或作为完整结果的知识库标识。
   * @param mode 关系集合的加入、移出或替换方式。
   * @param userId 当前操作用户，用于文档范围和审计。
   * @returns 更新后的文档详情与各知识库版本状态。
   */
  async changeDatasets(
    documentId: string,
    datasetIds: string[],
    mode: DocumentDatasetRelationMode,
    userId: string,
  ) {
    const document = await this.getDetail(documentId, userId);
    await this.applyDocumentDatasetAssignment({
      documentId,
      documentVersionId: document.activeVersion.documentVersionId,
      datasetIds,
      mode,
      userId,
      triggerSource: 'manual',
    });
    return await this.getDetail(documentId, userId);
  }
}

/** 服务端唯一的文档业务动作实例。 */
export const documentAction = new DocumentAction();
