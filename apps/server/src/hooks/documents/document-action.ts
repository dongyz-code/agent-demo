import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  max,
  ne,
  or,
  sql,
} from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, pgAdvisoryXactLock, schemas } from '@/database/index.js';
import { task } from '@/hooks/tasks/task.js';
import { binaryContentType } from '@repo/shared';
import { documentsConfig } from './config.js';
import { documentFile } from './file/index.js';
import { documentPreview } from './preview/index.js';
import { documentRag } from './rag/index.js';
import {
  DOCUMENT_TASK_CANCELED_ERROR_CODE,
  DOCUMENT_TASK_CANCELED_MESSAGE,
} from './tasks/index.js';

import type {
  DocumentDetail,
  DocumentInfo,
  DocumentPreviewPageInfo,
  DocumentPreviewWindow,
  DocumentTaskOperation,
  DocumentVersionInfo,
  FileProcessingTaskDetail,
  FileProcessingTaskInfo,
  FileProcessingTriggerSource,
  RagDatasetDocumentSummary,
} from '@repo/types';
import type { DocumentDatasetRelationMode } from './rag/index.js';
import type {
  AddDocumentProcessingTaskInput,
  AddDocumentTaskInput,
  DocumentCleanupTaskData,
  DocumentFileTaskData,
} from './tasks/index.js';

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
  /** 每个文档的版本数量。 */
  versionCountByDocument: Map<string, number>;
  /** 每个文档的知识库关系摘要。 */
  datasetsByDocument: Map<string, RagDatasetDocumentSummary[]>;
  /** 每个当前版本的第一页内部行。 */
  coverByVersion: Map<
    string,
    typeof schemas.document_preview_pages.$inferSelect
  >;
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
/** 当前文档 RAG 配置；v2 表示远程文档统一使用 TextIn xParse 异步解析。 */
const DOCUMENT_RAG_CONFIG_VERSION = 'document-rag-v2';

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
  /** 可选 RAG 处理配置版本。 */
  ragConfigVersion?: string;
}

/** documents 域唯一的通用任务名称。 */
const DOCUMENT_TASK_NAME = 'document.process';
/** documents 整体任务的子进程脚本模块。 */
const DOCUMENT_TASK_SCRIPT = new URL('./tasks/index.js', import.meta.url).href;

/**
 * 根据文档处理操作生成任务中心展示名称。
 *
 * @param operations 同一任务需要执行的预览或 RAG 操作。
 * @returns 能直接说明业务动作的中文任务名称。
 */
function getDocumentTaskDisplayName(
  operations: DocumentTaskOperation[],
): string {
  if (operations.length === 1 && operations[0] === 'preview') {
    return '生成文档预览';
  }
  if (operations.length === 1 && operations[0] === 'rag') {
    return '文档 RAG 预处理';
  }
  return '生成文档预览并进行 RAG 预处理';
}

/**
 * 文档查询、版本、预览、知识库和处理任务业务动作。
 *
 * Worker、parser、对象存储和向量写入作为独立执行边界保留。
 */
class DocumentAction {
  /**
   * 搜索授权范围内的文档聚合摘要。
   *
   * @param input 筛选、分页和可选知识库范围。
   * @param userId 当前用户，现阶段数据范围为创建人。
   * @returns 文档列表及可选总数。
   */
  async search(
    input: SearchDocumentsInput,
    userId: string,
  ): Promise<{ list: DocumentInfo[]; count: number }> {
    const [start = 0, end = 20] = input.limit ?? [];
    const [createdStart, createdEnd] = input.createdAt ?? [];
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.documents.create_user_id, userId),
        ne(schemas.documents.status, 'deleted'),
      );
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
    const baseQuery = db
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
    const [rows, countResult] = await Promise.all([
      baseQuery
        .orderBy(desc(schemas.documents.create_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      input.withCount
        ? db
            .select({ value: countDistinct(schemas.documents.document_id) })
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
              eq(
                schemas.files.file_id,
                schemas.document_versions.source_file_id,
              ),
            )
            .where(where)
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
   * @param userId 当前用户，现阶段数据范围为创建人。
   * @returns 文档聚合详情。
   */
  async getDetail(documentId: string, userId: string): Promise<DocumentDetail> {
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.documents.document_id, documentId),
        eq(schemas.documents.create_user_id, userId),
        ne(schemas.documents.status, 'deleted'),
      );
    });
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
   * 查询当前或显式指定的文档版本及其源文件内部行。
   *
   * @param documentId 文档稳定标识。
   * @param documentVersionId 可选显式版本；为空时使用 activeVersion。
   * @param userId 当前用户，现阶段数据范围为创建人。
   * @returns 文档、版本和源文件联合行。
   */
  private async resolveDocumentVersion(
    documentId: string,
    documentVersionId: string | undefined,
    userId: string,
  ) {
    const where = buildWhere((filter) => {
      filter.push(
        eq(schemas.documents.document_id, documentId),
        eq(schemas.documents.create_user_id, userId),
        ne(schemas.documents.status, 'deleted'),
      );
    });
    const [row] = await db
      .select({
        document: schemas.documents,
        version: schemas.document_versions,
        file: schemas.files,
      })
      .from(schemas.documents)
      .innerJoin(
        schemas.document_versions,
        and(
          eq(
            schemas.document_versions.document_id,
            schemas.documents.document_id,
          ),
          documentVersionId
            ? eq(
                schemas.document_versions.document_version_id,
                documentVersionId,
              )
            : eq(
                schemas.document_versions.document_version_id,
                schemas.documents.active_version_id,
              ),
        ),
      )
      .innerJoin(
        schemas.files,
        eq(schemas.files.file_id, schemas.document_versions.source_file_id),
      )
      .where(where)
      .limit(1);
    if (!row) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    return row;
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
    const row = await this.resolveDocumentVersion(
      documentId,
      documentVersionId,
      userId,
    );
    const signed = await documentFile.presignGet({
      bucket: row.file.bucket,
      objectKey: row.file.object_key,
      contentType: row.file.content_type ?? binaryContentType,
      filename: row.file.filename,
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

  /** 批量读取版本数、知识库关系和当前版本封面。 */
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
    const [versionCounts, datasetRows, coverRows] = await Promise.all([
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
        .where(inArray(schemas.rag_dataset_documents.document_id, documentIds)),
      db.select().from(schemas.document_preview_pages).where(coverWhere),
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
    return {
      versionCountByDocument: new Map(
        versionCounts.map((row) => [row.documentId, row.value]),
      ),
      datasetsByDocument,
      coverByVersion: new Map(
        coverRows.map((row) => [row.document_version_id, row]),
      ),
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
            `${row.document.name}-page-1.webp`,
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
      previewConverterVersion: row.version.preview_converter_version,
      createdAt: row.version.create_timestamp,
    };
  }

  /** 为已通过文档权限校验的页面行签发短期访问地址。 */
  private async toPreviewPageInfo(
    page: typeof schemas.document_preview_pages.$inferSelect,
    filename: string,
  ): Promise<DocumentPreviewPageInfo> {
    const signed = await documentFile.presignGet({
      bucket: page.bucket,
      objectKey: page.object_key,
      contentType: page.content_type,
      filename,
      disposition: 'inline',
    });
    return {
      documentVersionId: page.document_version_id,
      pageNumber: page.page_number,
      width: page.width,
      height: page.height,
      contentType: page.content_type,
      size: page.size,
      url: signed.url,
      expiresAt: signed.expiresAt,
    };
  }

  /**
   * 将已验证 File 幂等绑定为新文档或已有文档的新版本。
   *
   * @param input 源文件、可选目标文档及新文档默认策略。
   * @param userId 当前操作用户，用于数据范围与审计。
   * @returns 已创建或复用的文档版本绑定。
   */
  async createVersionFromFile(
    input: CreateDocumentVersionFromFileInput,
    userId: string,
  ): Promise<DocumentVersionBinding> {
    const file = await documentFile.getStored(input.fileId);
    if (file.status !== 'verified' || file.create_user_id !== userId) {
      throw new ROOT_ERROR('数据异常');
    }

    return await db.transaction(async (tx) => {
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

      const targetDocumentId = input.documentId;
      await pgAdvisoryXactLock(tx, 'document-version', targetDocumentId);
      const where = buildWhere((filter) => {
        filter.push(
          eq(schemas.documents.document_id, targetDocumentId),
          eq(schemas.documents.create_user_id, userId),
          ne(schemas.documents.status, 'deleted'),
        );
      });
      const [document] = await tx
        .select()
        .from(schemas.documents)
        .where(where)
        .limit(1);
      if (!document) {
        throw new ROOT_ERROR('相关文件不存在');
      }
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
  async setActiveVersion(
    documentId: string,
    documentVersionId: string,
    userId: string,
  ) {
    await this.resolveDocumentVersion(documentId, documentVersionId, userId);
    const relationCount = await db.transaction(async (tx) => {
      await pgAdvisoryXactLock(tx, 'document-active', documentId);
      const now = new Date();
      const where = buildWhere((filter) => {
        filter.push(
          eq(schemas.documents.document_id, documentId),
          eq(schemas.documents.create_user_id, userId),
          ne(schemas.documents.status, 'deleted'),
        );
      });
      const [updated] = await tx
        .update(schemas.documents)
        .set({
          active_version_id: documentVersionId,
          last_update_user_id: userId,
          last_update_timestamp: now,
        })
        .where(where)
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

    if (documentsConfig.fileProcessing.enabled && relationCount) {
      await this.addDocumentTask(
        {
          documentId,
          documentVersionId,
          operations: ['rag'],
          triggerSource: 'manual',
        },
        userId,
      );
    }
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
    const documentWhere = buildWhere((filter) => {
      filter.push(
        eq(schemas.documents.document_id, documentId),
        eq(schemas.documents.create_user_id, userId),
      );
    });
    const [document] = await db
      .select({ id: schemas.documents.document_id })
      .from(schemas.documents)
      .where(documentWhere)
      .limit(1);
    if (!document) return 'ok';
    const versionRows = await db
      .select({ id: schemas.document_versions.document_version_id })
      .from(schemas.document_versions)
      .where(eq(schemas.document_versions.document_id, documentId));
    const versionIds = versionRows.map((row) => row.id);
    let processingTaskIds: string[] = [];
    if (versionIds.length) {
      const taskRows = await db
        .select({ id: schemas.file_processing_tasks.task_id })
        .from(schemas.file_processing_tasks)
        .where(
          inArray(
            schemas.file_processing_tasks.document_version_id,
            versionIds,
          ),
        );
      processingTaskIds = taskRows.map((row) => row.id);
    }
    await this.addDocumentTask({ documentId, operations: ['cleanup'] }, userId);
    await this.cancelDocumentTasksForRemoval(processingTaskIds, userId);
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
    const resolved = await this.resolveDocumentVersion(
      input.documentId,
      input.documentVersionId,
      userId,
    );
    const version = resolved.version;
    if (version.preview_status !== 'ready') {
      return {
        documentId: input.documentId,
        documentVersionId: version.document_version_id,
        status: version.preview_status,
        pageCount: version.preview_page_count,
        pages: [],
      };
    }
    const where = buildWhere((filter) => {
      filter.push(
        eq(
          schemas.document_preview_pages.document_version_id,
          version.document_version_id,
        ),
        gte(schemas.document_preview_pages.page_number, startPage),
        lt(schemas.document_preview_pages.page_number, startPage + pageSize),
      );
    });
    const rows = await db
      .select()
      .from(schemas.document_preview_pages)
      .where(where)
      .orderBy(asc(schemas.document_preview_pages.page_number));
    const pages = await Promise.all(
      rows.map(
        async (page) =>
          await this.signPreviewPage(
            page,
            `${resolved.document.name}-page-${page.page_number}.webp`,
          ),
      ),
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
    const resolved = await this.resolveDocumentVersion(
      input.documentId,
      input.documentVersionId,
      userId,
    );
    let triggerSource: FileProcessingTriggerSource = 'rerun';
    if (resolved.version.preview_status === 'failed') triggerSource = 'retry';
    await this.addDocumentTask(
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

  /** 为已通过文档权限校验的页面行签发短期内联地址。 */
  private async signPreviewPage(
    page: typeof schemas.document_preview_pages.$inferSelect,
    filename: string,
  ): Promise<DocumentPreviewPageInfo> {
    const signed = await documentFile.presignGet({
      bucket: page.bucket,
      objectKey: page.object_key,
      contentType: page.content_type,
      filename,
      disposition: 'inline',
    });
    return {
      documentVersionId: page.document_version_id,
      pageNumber: page.page_number,
      width: page.width,
      height: page.height,
      contentType: page.content_type,
      size: page.size,
      url: signed.url,
      expiresAt: signed.expiresAt,
    };
  }

  /**
   * 修改知识库关系，并为同一 DocumentVersion 最多创建一个 RAG 任务。
   *
   * @param input 文档版本、知识库集合、变更方式、处理配置和审计用户。
   * @returns 关系更新及 RAG 任务触发完成后结束。
   */
  private async applyDocumentDatasetAssignment(
    input: ApplyDocumentDatasetAssignmentInput,
  ): Promise<void> {
    await documentRag.updateRelations(input);
    if (
      documentsConfig.fileProcessing.enabled &&
      input.mode !== 'remove' &&
      input.datasetIds.length
    ) {
      await this.addDocumentTask(
        {
          documentId: input.documentId,
          documentVersionId: input.documentVersionId,
          operations: ['rag'],
          ragConfigVersion: input.ragConfigVersion,
          triggerSource: input.triggerSource ?? 'manual',
        },
        input.userId,
      );
    }
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

  /**
   * 创建一个选择 RAG、预览或物理清理操作的文档后台任务。
   *
   * @param input 文档、操作集合、可选版本、触发来源和 RAG 配置。
   * @param userId 当前操作用户，用于数据范围和审计。
   * @returns 新建任务标识；无需重复生成就绪预览时返回 null。
   */
  async addDocumentTask(
    input: AddDocumentTaskInput,
    userId: string,
  ): Promise<string | null> {
    const requestedOperations = [...new Set(input.operations)];
    if (!requestedOperations.length) {
      throw new Error('DOCUMENT_TASK_OPERATIONS_REQUIRED: 至少选择一个操作');
    }
    if (input.operations[0] === 'cleanup') {
      if (requestedOperations.length !== 1) {
        throw new Error('DOCUMENT_TASK_OPERATIONS_INVALID: 清理操作必须独占');
      }
      return await task.add({
        name: DOCUMENT_TASK_NAME,
        displayName: '删除文档',
        script: DOCUMENT_TASK_SCRIPT,
        data: {
          operations: ['cleanup'],
          documentId: input.documentId,
          userId,
        } satisfies DocumentCleanupTaskData,
        retry: {
          times: documentsConfig.fileProcessing.maxRetries,
          delay: documentsConfig.fileProcessing.retryDelayMs,
        },
        timeout: documentsConfig.fileProcessing.timeoutMs,
        concurrency: documentsConfig.fileProcessing.concurrency,
      });
    }
    if (!documentsConfig.fileProcessing.enabled) {
      throw new ROOT_ERROR('服务异常');
    }
    const processingInput = input as AddDocumentProcessingTaskInput;
    const operations = (['preview', 'rag'] as const).filter((operation) =>
      requestedOperations.includes(operation),
    );
    const resolved = await this.resolveDocumentVersion(
      processingInput.documentId,
      processingInput.documentVersionId,
      userId,
    );
    if (operations.includes('preview')) {
      const contentType =
        resolved.file.content_type ?? resolved.file.declared_content_type;
      if (!documentPreview.supports(contentType)) {
        throw new ROOT_ERROR('数据异常');
      }
    }
    const documentVersionId = resolved.version.document_version_id;
    const triggerSource = processingInput.triggerSource ?? 'manual';
    const forceNewTask = triggerSource === 'retry' || triggerSource === 'rerun';
    const previewReady =
      operations.length === 1 &&
      operations[0] === 'preview' &&
      resolved.version.preview_status === 'ready' &&
      resolved.version.preview_converter_version ===
        documentPreview.configVersion;
    if (previewReady && !forceNewTask) return null;
    if (forceNewTask && operations.includes('rag')) {
      await documentRag.prepareRelationsForReprocessing({
        documentId: processingInput.documentId,
        documentVersionId,
        userId,
      });
    }
    const operationConfigVersions: Partial<
      Record<DocumentTaskOperation, string>
    > = {};
    if (operations.includes('rag')) {
      operationConfigVersions.rag =
        processingInput.ragConfigVersion ?? DOCUMENT_RAG_CONFIG_VERSION;
    }
    if (operations.includes('preview')) {
      operationConfigVersions.preview = documentPreview.configVersion;
    }
    const data: DocumentFileTaskData = {
      operations,
      fileId: resolved.file.file_id,
      documentId: processingInput.documentId,
      documentVersionId,
      triggerSource,
      operationConfigVersions,
      userId,
    };
    return await task.add({
      name: DOCUMENT_TASK_NAME,
      displayName: getDocumentTaskDisplayName(operations),
      script: DOCUMENT_TASK_SCRIPT,
      data,
      retry: {
        times: documentsConfig.fileProcessing.maxRetries,
        delay: documentsConfig.fileProcessing.retryDelayMs,
      },
      timeout: documentsConfig.fileProcessing.timeoutMs,
      concurrency: documentsConfig.fileProcessing.concurrency,
    });
  }

  /**
   * 查询文档处理任务详情及阶段时间线。
   *
   * @param taskId 通用任务标识。
   * @returns 文件、状态、结果摘要、阶段记录和自动 attempt。
   */
  async getProcessingTask(taskId: string): Promise<FileProcessingTaskDetail> {
    const genericTask = await task.get(taskId);
    if (!genericTask) throw new ROOT_ERROR('相关文件不存在');
    const [row] = await db
      .select({
        fileTask: schemas.file_processing_tasks,
        filename: schemas.files.filename,
      })
      .from(schemas.file_processing_tasks)
      .leftJoin(
        schemas.files,
        eq(schemas.files.file_id, schemas.file_processing_tasks.file_id),
      )
      .where(eq(schemas.file_processing_tasks.task_id, taskId))
      .limit(1);
    if (!row) throw new ROOT_ERROR('相关文件不存在');
    const stageRuns = await db
      .select()
      .from(schemas.file_processing_task_stage_runs)
      .where(eq(schemas.file_processing_task_stage_runs.task_id, taskId))
      .orderBy(
        schemas.file_processing_task_stage_runs.start_timestamp,
        schemas.file_processing_task_stage_runs.attempt,
      );
    return {
      ...this.toTaskInfo(genericTask, row),
      operationConfigVersions: {
        rag: row.fileTask.content_config_version ?? undefined,
        preview: row.fileTask.preview_config_version ?? undefined,
      },
      resultSummary: row.fileTask.result_summary
        ? (JSON.parse(row.fileTask.result_summary) as Record<string, unknown>)
        : null,
      stageRuns: stageRuns.map((stage) => ({
        stage: stage.stage,
        attempt: stage.attempt,
        status: stage.status,
        processedItems: stage.processed_items,
        totalItems: stage.total_items,
        errorCode: stage.error_code,
        errorMessage: stage.error_message,
        startedAt: stage.start_timestamp,
        endedAt: stage.end_timestamp,
      })),
      attempts: genericTask.attempts,
    };
  }

  /**
   * 取消一个活动文档处理任务并收敛领域状态。
   *
   * @param taskId 文档处理通用任务标识。
   * @param userId 当前操作用户。
   * @returns 取消提交完成后结束；任务不存在或已终结时抛出业务错误。
   */
  async cancelProcessingTask(taskId: string, userId: string): Promise<void> {
    const [fileTask] = await db
      .select({ id: schemas.file_processing_tasks.task_id })
      .from(schemas.file_processing_tasks)
      .where(eq(schemas.file_processing_tasks.task_id, taskId))
      .limit(1);
    if (!fileTask) throw new ROOT_ERROR('相关文件不存在');
    const canceled = await task.cancel(taskId, {
      errorCode: DOCUMENT_TASK_CANCELED_ERROR_CODE,
      message: DOCUMENT_TASK_CANCELED_MESSAGE,
      userId,
    });
    if (!canceled) throw new ROOT_ERROR('数据异常');
  }

  /**
   * 因文档删除批量取消关联的文件处理任务。
   *
   * @param taskIds 文档版本关联的全部文件处理任务标识。
   * @param userId 发起文档删除的审计用户。
   * @returns 所有取消请求提交后结束。
   */
  private async cancelDocumentTasksForRemoval(
    taskIds: string[],
    userId: string,
  ): Promise<void> {
    for (const taskId of taskIds) {
      await task.cancel(taskId, {
        errorCode: 'DOCUMENT_REMOVED',
        message: '文档已删除，文件处理任务已取消',
        userId,
      });
    }
  }

  /**
   * 将通用任务和 documents 扩展记录组合为业务任务摘要。
   *
   * @param genericTask 通过公共 task API 读取的任务和 attempt。
   * @param row documents 扩展与可选源文件名称。
   * @returns 不暴露通用任务内部表结构的文档处理摘要。
   */
  private toTaskInfo(
    genericTask: NonNullable<Awaited<ReturnType<typeof task.get>>>,
    row: {
      /** 文档任务领域扩展。 */
      fileTask: typeof schemas.file_processing_tasks.$inferSelect;
      /** 文档被物理清理后为空。 */
      filename: string | null;
    },
  ): FileProcessingTaskInfo {
    const retryableStatuses = ['succeeded', 'failed', 'canceled', 'timed_out'];
    return {
      taskId: genericTask.task_id,
      documentId: row.fileTask.document_id,
      documentVersionId: row.fileTask.document_version_id,
      operations: row.fileTask.task_parts,
      filename: row.filename ?? '已删除文件',
      executionNo: row.fileTask.execution_no,
      triggerSource: row.fileTask.trigger_source,
      status: genericTask.status,
      stage: (genericTask.current_stage ??
        'queued') as FileProcessingTaskInfo['stage'],
      progress: genericTask.progress,
      processedItems: genericTask.processed_items,
      totalItems: genericTask.total_items,
      errorCode: genericTask.error_code,
      errorMessage: genericTask.error_message,
      retryable:
        row.fileTask.task_parts.includes('rag') &&
        retryableStatuses.includes(genericTask.status),
      createdAt: genericTask.create_timestamp,
      startedAt: genericTask.start_timestamp,
      endedAt: genericTask.end_timestamp,
    };
  }

  /**
   * 以原任务的文档版本和处理配置创建人工重试任务。
   *
   * @param taskId 已终结的文档处理任务标识。
   * @param userId 当前操作用户，用于文档范围与审计。
   * @returns 新建重试任务详情。
   */
  async retryProcessingTask(
    taskId: string,
    userId: string,
  ): Promise<FileProcessingTaskInfo> {
    const source = await this.getProcessingTask(taskId);
    if (
      !['succeeded', 'failed', 'canceled', 'timed_out'].includes(source.status)
    ) {
      throw new ROOT_ERROR('数据异常');
    }
    const retriedTaskId = await this.addDocumentTask(
      {
        documentId: source.documentId,
        documentVersionId: source.documentVersionId,
        operations: source.operations,
        ragConfigVersion: source.operationConfigVersions.rag,
        triggerSource: source.status === 'succeeded' ? 'rerun' : 'retry',
      },
      userId,
    );
    if (!retriedTaskId) throw new ROOT_ERROR('数据异常');
    return await this.getProcessingTask(retriedTaskId);
  }
}

/** 服务端唯一的文档业务动作实例。 */
export const documentAction = new DocumentAction();
