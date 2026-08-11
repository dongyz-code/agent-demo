import { eq } from 'drizzle-orm';

import { logger, ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { documentFile } from '../file/index.js';
import {
  DOCUMENT_PREVIEW_CONVERTER_VERSION,
  documentPageConverter,
} from './converter.js';

import type { ConvertedDocumentPage } from './converter.js';

/** 文档预览生成所需的业务输入。 */
export interface DocumentPreviewProcessInput {
  /** 本次执行的稳定标识，用于隔离尚未发布的页面对象。 */
  executionId: string;
  /** 已验证源文件标识。 */
  fileId: string;
  /** 逻辑文档标识。 */
  documentId: string;
  /** 本次生成预览的不可变文档版本。 */
  documentVersionId: string;
  /** 写入预览状态的审计用户。 */
  userId: string;
  /** 确认当前调用仍允许继续执行，取消或失效时抛出错误。 */
  assertActive: () => Promise<void>;
}

/** 文档预览操作返回的稳定摘要。 */
export interface DocumentPreviewProcessResult {
  /** 实际发布的页面数量。 */
  pageCount: number;
  /** 本次页面集合使用的转换器版本。 */
  converterVersion: string;
}

/** 已上传但尚未发布的页面对象。 */
interface UploadedPreviewPage {
  /** 从 1 开始的连续页码。 */
  pageNumber: number;
  /** 页面图片像素宽度。 */
  width: number;
  /** 页面图片像素高度。 */
  height: number;
  /** 页面图片可信 MIME。 */
  contentType: ConvertedDocumentPage['contentType'];
  /** 页面对象字节数。 */
  size: number;
  /** 页面对象私有 Bucket。 */
  bucket: string;
  /** 页面对象私有路径。 */
  objectKey: string;
}

/** 文档预览支持检测、版本识别和页面发布的统一能力实现。 */
class DocumentPreview {
  /** 当前页面转换规则与底层渲染器组成的稳定版本。 */
  readonly configVersion = DOCUMENT_PREVIEW_CONVERTER_VERSION;

  /**
   * 判断可信 MIME 是否具备统一页面转换能力。
   *
   * @param contentType 服务端验证后的文件 MIME。
   * @returns 当前预览转换器是否支持该类型。
   */
  supports(contentType: string): boolean {
    return documentPageConverter.supports(contentType);
  }

  /**
   * 生成并原子发布指定文档版本的预览页面。
   *
   * @param input 文档版本、源文件、执行标识和通用存活检查。
   * @returns 已发布页面数量和转换器版本。
   */
  async process(
    input: DocumentPreviewProcessInput,
  ): Promise<DocumentPreviewProcessResult> {
    const uploadedPages: UploadedPreviewPage[] = [];
    let published = false;
    try {
      await markPreviewProcessing(input);
      await generateAndUploadPages(input, uploadedPages);
      const oldPages = await publishPreviewPages(input, uploadedPages);
      published = true;
      const result = {
        pageCount: uploadedPages.length,
        converterVersion: this.configVersion,
      };
      deleteOldPagesInBackground(oldPages);
      return result;
    } catch (error) {
      if (!published) await deleteUploadedPages(uploadedPages);
      throw error;
    }
  }
}

/** 文档预览支持检测、配置版本与处理流程的统一入口。 */
export const documentPreview = new DocumentPreview();

/**
 * 在生成前确认任务和文档生命周期仍允许提交。
 *
 * @param input 当前预览操作输入。
 * @returns 版本进入 processing 后结束。
 */
async function markPreviewProcessing(
  input: DocumentPreviewProcessInput,
): Promise<void> {
  await input.assertActive();
  const documentWhere = buildWhere((filter) => {
    filter.push(
      eq(schemas.documents.document_id, input.documentId),
      eq(schemas.documents.status, 'active'),
    );
  });
  const versionWhere = buildWhere((filter) => {
    filter.push(
      eq(
        schemas.document_versions.document_version_id,
        input.documentVersionId,
      ),
      eq(schemas.document_versions.document_id, input.documentId),
    );
  });
  await db.transaction(async (tx) => {
    const [document] = await tx
      .select({ id: schemas.documents.document_id })
      .from(schemas.documents)
      .where(documentWhere)
      .limit(1);
    if (!document) {
      throw new ROOT_ERROR('文档已删除，不能生成预览');
    }
    await tx
      .update(schemas.document_versions)
      .set({
        preview_status: 'processing',
        preview_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: new Date(),
      })
      .where(versionWhere);
  });
}

/**
 * 逐页转换并上传到本任务独占对象前缀。
 *
 * @param input 当前预览操作输入。
 * @param pages 用于记录待发布临时页面的可变集合。
 * @returns 全部页面转换并上传后结束。
 */
async function generateAndUploadPages(
  input: DocumentPreviewProcessInput,
  pages: UploadedPreviewPage[],
): Promise<void> {
  const file = await documentFile.getStored(input.fileId);
  if (file.status !== 'verified') {
    throw new ROOT_ERROR('只有验证成功的文件可以生成预览');
  }
  const source = {
    filename: file.filename,
    contentType: file.content_type ?? file.declared_content_type,
    size: file.size,
    bucket: file.bucket,
    objectKey: file.object_key,
    open: async () =>
      await documentFile.open({
        bucket: file.bucket,
        objectKey: file.object_key,
      }),
  };
  let expectedPage = 1;
  for await (const page of documentPageConverter.convert(source)) {
    await input.assertActive();
    if (page.pageNumber !== expectedPage) {
      throw new ROOT_ERROR('转换页面序号不连续');
    }
    const objectKey = buildPreviewObjectKey(input, page.pageNumber);
    await documentFile.put({
      bucket: file.bucket,
      objectKey,
      contentType: page.contentType,
      content: page.content,
    });
    pages.push({
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      contentType: page.contentType,
      size: page.content.byteLength,
      bucket: file.bucket,
      objectKey,
    });
    expectedPage++;
  }
  if (!pages.length) {
    throw new ROOT_ERROR('转换器没有生成任何页面');
  }
  await input.assertActive();
}

/**
 * 在同一事务中替换页面行并把版本标记为 ready。
 *
 * @param input 当前预览操作输入。
 * @param pages 已上传且等待发布的页面集合。
 * @returns 被新页面替换的旧对象位置。
 */
async function publishPreviewPages(
  input: DocumentPreviewProcessInput,
  pages: UploadedPreviewPage[],
) {
  await input.assertActive();
  const documentWhere = buildWhere((filter) => {
    filter.push(
      eq(schemas.documents.document_id, input.documentId),
      eq(schemas.documents.status, 'active'),
    );
  });
  const versionWhere = buildWhere((filter) => {
    filter.push(
      eq(
        schemas.document_versions.document_version_id,
        input.documentVersionId,
      ),
      eq(schemas.document_versions.document_id, input.documentId),
    );
  });
  return await db.transaction(async (tx) => {
    const [document] = await tx
      .select({ id: schemas.documents.document_id })
      .from(schemas.documents)
      .where(documentWhere)
      .limit(1);
    if (!document) {
      throw new ROOT_ERROR('文档已删除，不能发布预览');
    }
    const oldPages = await tx
      .select({
        bucket: schemas.document_preview_pages.bucket,
        objectKey: schemas.document_preview_pages.object_key,
      })
      .from(schemas.document_preview_pages)
      .where(
        eq(
          schemas.document_preview_pages.document_version_id,
          input.documentVersionId,
        ),
      );
    await tx
      .delete(schemas.document_preview_pages)
      .where(
        eq(
          schemas.document_preview_pages.document_version_id,
          input.documentVersionId,
        ),
      );
    await tx.insert(schemas.document_preview_pages).values(
      pages.map((page) => ({
        document_version_id: input.documentVersionId,
        page_number: page.pageNumber,
        width: page.width,
        height: page.height,
        content_type: page.contentType,
        size: page.size,
        bucket: page.bucket,
        object_key: page.objectKey,
      })),
    );
    const [updated] = await tx
      .update(schemas.document_versions)
      .set({
        preview_status: 'ready',
        preview_page_count: pages.length,
        preview_error: null,
        preview_converter_version: DOCUMENT_PREVIEW_CONVERTER_VERSION,
        last_update_user_id: input.userId,
        last_update_timestamp: new Date(),
      })
      .where(versionWhere)
      .returning({ id: schemas.document_versions.document_version_id });
    if (!updated) {
      throw new ROOT_ERROR('文档版本不存在');
    }
    return oldPages;
  });
}

/** 构造任务独占且包含转换器版本的页面对象路径。 */
function buildPreviewObjectKey(
  input: DocumentPreviewProcessInput,
  pageNumber: number,
): string {
  return [
    'derived/documents',
    input.documentId,
    'versions',
    input.documentVersionId,
    'preview',
    encodeURIComponent(DOCUMENT_PREVIEW_CONVERTER_VERSION),
    input.executionId,
    `page-${String(pageNumber).padStart(6, '0')}.webp`,
  ].join('/');
}

/** 发布前失败时删除本任务已经上传的临时页面对象。 */
async function deleteUploadedPages(
  pages: UploadedPreviewPage[],
): Promise<void> {
  await Promise.allSettled(
    pages.map(
      async (page) =>
        await documentFile.remove({
          bucket: page.bucket,
          objectKey: page.objectKey,
        }),
    ),
  );
}

/** 页面行提交后异步清理旧集合，清理失败只记录对象路径。 */
function deleteOldPagesInBackground(
  pages: { bucket: string; objectKey: string }[],
): void {
  if (!pages.length) return;
  queueMicrotask(() => {
    void Promise.allSettled(
      pages.map(
        async (page) =>
          await documentFile.remove({
            bucket: page.bucket,
            objectKey: page.objectKey,
          }),
      ),
    ).then((results) => {
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length) {
        logger.warn(
          {
            event: 'document.preview.old_pages_cleanup_failed',
            failedCount: failed.length,
          },
          '旧预览页面对象清理不完整',
        );
      }
    });
  });
}
