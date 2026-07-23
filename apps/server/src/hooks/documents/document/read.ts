import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { presignGetObject } from '../storage/presign.js';

import type {
  DocumentDetail,
  DocumentInfo,
  DocumentPreviewPageInfo,
  DocumentVersionInfo,
  RagDatasetDocumentSummary,
} from '@repo/types';

/** 文档复杂搜索的服务端输入。 */
export interface SearchDocumentsInput {
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

/**
 * 搜索授权范围内的文档聚合摘要。
 *
 * @param input 筛选、分页和可选知识库范围。
 * @param userId 当前用户，现阶段数据范围为创建人。
 * @returns 文档列表及可选总数。
 */
export async function searchDocuments(
  input: SearchDocumentsInput,
  userId: string,
): Promise<{ list: DocumentInfo[]; count: number }> {
  const [start = 0, end = 20] = input.limit ?? [];
  const [createdStart, createdEnd] = input.createdAt ?? [];
  const datasetFilter = input.datasetId
    ? sql`exists (
        select 1
        from rag_dataset_documents rdd
        where rdd.document_id = ${schemas.documents.document_id}
          and rdd.dataset_id = ${input.datasetId}
      )`
    : undefined;
  const where = and(
    eq(schemas.documents.create_user_id, userId),
    ne(schemas.documents.status, 'deleted'),
    input.search?.trim()
      ? or(
          ilike(schemas.documents.name, `%${input.search.trim()}%`),
          ilike(schemas.files.filename, `%${input.search.trim()}%`),
        )
      : undefined,
    input.status?.length
      ? inArray(schemas.documents.status, input.status)
      : undefined,
    input.previewStatus?.length
      ? inArray(schemas.document_versions.preview_status, input.previewStatus)
      : undefined,
    createdStart
      ? gte(schemas.documents.create_timestamp, createdStart)
      : undefined,
    createdEnd ? lte(schemas.documents.create_timestamp, createdEnd) : undefined,
    datasetFilter,
  );
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
            eq(schemas.files.file_id, schemas.document_versions.source_file_id),
          )
          .where(where)
      : Promise.resolve([]),
  ]);
  if (!rows.length) {
    return { list: [], count: countResult[0]?.value ?? 0 };
  }
  const aggregates = await loadDocumentAggregates(rows);
  return {
    list: await Promise.all(
      rows.map(async (row) => await toDocumentInfo(row, aggregates)),
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
export async function getDocumentDetail(
  documentId: string,
  userId: string,
): Promise<DocumentDetail> {
  const [current] = await selectCurrentDocumentRows(
    and(
      eq(schemas.documents.document_id, documentId),
      eq(schemas.documents.create_user_id, userId),
      ne(schemas.documents.status, 'deleted'),
    ),
  ).limit(1);
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
  const aggregates = await loadDocumentAggregates([current]);
  return {
    ...(await toDocumentInfo(current, aggregates)),
    versions: versionRows.map((row) => toDocumentVersionInfo(row)),
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
export async function resolveDocumentVersion(
  documentId: string,
  documentVersionId: string | undefined,
  userId: string,
) {
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
    .where(
      and(
        eq(schemas.documents.document_id, documentId),
        eq(schemas.documents.create_user_id, userId),
        ne(schemas.documents.status, 'deleted'),
      ),
    )
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
export async function getDocumentDownload(
  documentId: string,
  documentVersionId: string | undefined,
  userId: string,
) {
  const row = await resolveDocumentVersion(
    documentId,
    documentVersionId,
    userId,
  );
  const signed = await presignGetObject({
    bucket: row.file.bucket,
    objectKey: row.file.object_key,
    contentType:
      row.file.content_type ?? 'application/octet-stream',
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
function selectCurrentDocumentRows(where: ReturnType<typeof and>) {
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

/** 批量读取版本数、知识库关系和当前版本封面。 */
async function loadDocumentAggregates(
  rows: CurrentDocumentRow[],
): Promise<DocumentAggregates> {
  const documentIds = rows.map((row) => row.document.document_id);
  const versionIds = rows.map((row) => row.version.document_version_id);
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
    db
      .select()
      .from(schemas.document_preview_pages)
      .where(
        and(
          inArray(
            schemas.document_preview_pages.document_version_id,
            versionIds,
          ),
          eq(schemas.document_preview_pages.page_number, 1),
        ),
      ),
  ]);
  const datasetsByDocument = new Map<
    string,
    RagDatasetDocumentSummary[]
  >();
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
async function toDocumentInfo(
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
    activeVersion: toDocumentVersionInfo({
      version: row.version,
      file: row.file,
    }),
    versionCount:
      aggregates.versionCountByDocument.get(row.document.document_id) ?? 1,
    cover: cover
      ? await toPreviewPageInfo(cover, `${row.document.name}-page-1.webp`)
      : null,
    datasets:
      aggregates.datasetsByDocument.get(row.document.document_id) ?? [],
    createdAt: row.document.create_timestamp,
  };
}

/** 将版本与源文件联合行转换为公共版本摘要。 */
function toDocumentVersionInfo(row: {
  version: typeof schemas.document_versions.$inferSelect;
  file: typeof schemas.files.$inferSelect;
}): DocumentVersionInfo {
  return {
    documentVersionId: row.version.document_version_id,
    version: row.version.version,
    filename: row.file.filename,
    extension: row.file.extension,
    contentType:
      row.file.content_type ?? row.file.declared_content_type,
    size: row.file.size,
    previewStatus: row.version.preview_status,
    previewPageCount: row.version.preview_page_count,
    previewError: row.version.preview_error,
    previewConverterVersion: row.version.preview_converter_version,
    createdAt: row.version.create_timestamp,
  };
}

/** 为已通过文档权限校验的页面行签发短期访问地址。 */
async function toPreviewPageInfo(
  page: typeof schemas.document_preview_pages.$inferSelect,
  filename: string,
): Promise<DocumentPreviewPageInfo> {
  const signed = await presignGetObject({
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
