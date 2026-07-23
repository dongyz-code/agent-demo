import { and, asc, eq, gte, lt } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { resolveDocumentVersion } from '../document/read.js';
import { presignGetObject } from '../storage/presign.js';
import { createDocumentPreviewTask } from './task.js';

import type {
  DocumentPreviewPageInfo,
  DocumentPreviewWindow,
} from '@repo/types';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;

/** 页面窗口查询输入。 */
export interface GetDocumentPreviewPagesInput {
  /** 文档稳定标识。 */
  documentId: string;
  /** 可选历史版本；为空时使用当前版本。 */
  documentVersionId?: string;
  /** 从 1 开始的页面窗口起点。 */
  startPage?: number;
  /** 页面窗口大小，服务端最多返回 30 页。 */
  pageSize?: number;
}

/**
 * 查询当前或指定版本的安全页面窗口。
 *
 * @param input 文档版本与页面范围。
 * @param userId 当前用户，用于文档数据范围校验。
 * @returns 版本状态、总页数及短期签名页面地址。
 */
export async function getDocumentPreviewPages(
  input: GetDocumentPreviewPagesInput,
  userId: string,
): Promise<DocumentPreviewWindow> {
  const startPage = input.startPage ?? 1;
  const requestedPageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(startPage) || startPage < 1) {
    throw new ROOT_ERROR(
      '非法参数',
      'DOCUMENT_PREVIEW_PAGE_INVALID: 起始页必须是大于等于 1 的整数',
    );
  }
  if (!Number.isInteger(requestedPageSize) || requestedPageSize < 1) {
    throw new ROOT_ERROR(
      '非法参数',
      'DOCUMENT_PREVIEW_PAGE_SIZE_INVALID: 页面数量必须是正整数',
    );
  }
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const resolved = await resolveDocumentVersion(
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
  const rows = await db
    .select()
    .from(schema.document_preview_pages)
    .where(
      and(
        eq(
          schema.document_preview_pages.document_version_id,
          version.document_version_id,
        ),
        gte(schema.document_preview_pages.page_number, startPage),
        lt(
          schema.document_preview_pages.page_number,
          startPage + pageSize,
        ),
      ),
    )
    .orderBy(asc(schema.document_preview_pages.page_number));
  const pages = await Promise.all(
    rows.map(
      async (page) =>
        await signPreviewPage(
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
 * 幂等重试 failed 版本并返回重试后的页面状态。
 *
 * @param input 文档与可选历史版本。
 * @param userId 当前操作用户。
 * @returns pending、processing 或原 ready 状态的页面窗口。
 */
export async function retryDocumentPreview(
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
  if (resolved.version.preview_status === 'failed') {
    await createDocumentPreviewTask(
      {
        documentId: input.documentId,
        documentVersionId: resolved.version.document_version_id,
        triggerSource: 'retry',
      },
      userId,
    );
  }
  return await getDocumentPreviewPages(input, userId);
}

/** 为已通过文档权限校验的页面行签发短期内联地址。 */
async function signPreviewPage(
  page: typeof schema.document_preview_pages.$inferSelect,
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
