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

/** 单次执行上传的页面对象摘要；是否已发布由执行状态单独记录。 */
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

/** 单次预览执行中两个层级的上传与发布边界。 */
interface PreviewGenerationState {
  /** 已上传的完整或部分快速页面。 */
  quickPages: UploadedPreviewPage[];
  /** 已上传的完整或部分清晰页面。 */
  clearPages: UploadedPreviewPage[];
  /** 快速页面是否已经由数据库行引用。 */
  quickPublished: boolean;
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
   * 先发布完整快速集合，再原子发布指定文档版本的清晰集合。
   *
   * @param input 文档版本、源文件、执行标识和通用存活检查。
   * @returns 已发布页面数量和转换器版本。
   */
  async process(
    input: DocumentPreviewProcessInput,
  ): Promise<DocumentPreviewProcessResult> {
    const state: PreviewGenerationState = {
      quickPages: [],
      clearPages: [],
      quickPublished: false,
    };
    let clearPublished = false;
    try {
      await markPreviewProcessing(input);
      await generateAndUploadPages(input, state);
      const oldPages = await publishClearPreviewPages(input, state.clearPages);
      clearPublished = true;
      const result = {
        pageCount: state.clearPages.length,
        converterVersion: this.configVersion,
      };
      deleteOldPagesInBackground(oldPages);
      return result;
    } catch (error) {
      const unpublishedPages = [...state.clearPages];
      if (!state.quickPublished) {
        unpublishedPages.push(...state.quickPages);
      }
      if (!clearPublished) await deleteUploadedPages(unpublishedPages);
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
 * @param state 用于记录两个层级上传与发布边界的可变状态。
 * @returns 快速层发布且清晰层全部上传后结束。
 */
async function generateAndUploadPages(
  input: DocumentPreviewProcessInput,
  state: PreviewGenerationState,
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
  let expectedQuickPage = 1;
  let expectedClearPage = 1;
  for await (const page of documentPageConverter.convert(source)) {
    await input.assertActive();
    if (page.variant === 'quick') {
      if (state.quickPublished || state.clearPages.length) {
        throw new ROOT_ERROR('转换页面序号不连续', {
          reason: '页面层级顺序无效',
        });
      }
      if (page.pageNumber !== expectedQuickPage) {
        throw new ROOT_ERROR('转换页面序号不连续', {
          variant: 'quick',
        });
      }
      const uploaded = await uploadPreviewPage(input, file.bucket, page);
      state.quickPages.push(uploaded);
      expectedQuickPage++;
      continue;
    }
    if (page.pageNumber !== expectedClearPage) {
      throw new ROOT_ERROR('转换页面序号不连续', {
        variant: 'clear',
      });
    }
    if (!state.quickPublished) {
      if (!state.quickPages.length || page.pageNumber !== 1) {
        throw new ROOT_ERROR('转换器没有生成任何页面', {
          variant: 'quick',
        });
      }
      const oldQuickPages = await publishQuickPreviewPages(
        input,
        state.quickPages,
      );
      state.quickPublished = true;
      deleteOldPagesInBackground(oldQuickPages);
    }
    const uploaded = await uploadPreviewPage(input, file.bucket, page);
    state.clearPages.push(uploaded);
    expectedClearPage++;
  }
  if (!state.quickPublished || !state.clearPages.length) {
    throw new ROOT_ERROR('转换器没有生成任何页面', {
      reason: '缺少完整双层页面',
    });
  }
  if (state.quickPages.length !== state.clearPages.length) {
    throw new ROOT_ERROR('转换页面序号不连续', {
      reason: '快速与清晰页面数量不一致',
    });
  }
  await input.assertActive();
}

/**
 * 上传一张转换页面到任务独占对象路径。
 *
 * @param input 当前预览执行标识与文档版本。
 * @param bucket 源文件所在的私有 Bucket。
 * @param page 已完成编码且带有层级的页面内容。
 * @returns 可写入对应页面表的对象摘要。
 */
async function uploadPreviewPage(
  input: DocumentPreviewProcessInput,
  bucket: string,
  page: ConvertedDocumentPage,
): Promise<UploadedPreviewPage> {
  if (page.pageNumber < 1) {
    throw new ROOT_ERROR('转换页面序号不连续');
  }
  const objectKey = buildPreviewObjectKey(
    input,
    page.variant,
    page.pageNumber,
    page.contentType,
  );
  await documentFile.put({
    bucket,
    objectKey,
    contentType: page.contentType,
    content: page.content,
  });
  return {
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    contentType: page.contentType,
    size: page.content.byteLength,
    bucket,
    objectKey,
  };
}

/**
 * 在同一事务中替换快速页面集合并公布 processing 可读页数。
 *
 * @param input 当前预览执行及文档版本。
 * @param pages 已完整上传且页码连续的快速页面。
 * @returns 被新快速集合替换的旧对象位置。
 */
async function publishQuickPreviewPages(
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
        bucket: schemas.document_preview_quick_pages.bucket,
        objectKey: schemas.document_preview_quick_pages.object_key,
      })
      .from(schemas.document_preview_quick_pages)
      .where(
        eq(
          schemas.document_preview_quick_pages.document_version_id,
          input.documentVersionId,
        ),
      );
    await tx
      .delete(schemas.document_preview_quick_pages)
      .where(
        eq(
          schemas.document_preview_quick_pages.document_version_id,
          input.documentVersionId,
        ),
      );
    await tx.insert(schemas.document_preview_quick_pages).values(
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
        preview_status: 'processing',
        preview_page_count: pages.length,
        preview_error: null,
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

/**
 * 在同一事务中替换页面行并把版本标记为 ready。
 *
 * @param input 当前预览操作输入。
 * @param pages 已上传且等待发布的页面集合。
 * @returns 被新页面替换的旧对象位置。
 */
async function publishClearPreviewPages(
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

/**
 * 构造任务独占且包含转换器版本与页面层级的对象路径。
 *
 * @param input 当前执行、文档和版本标识。
 * @param variant 页面所属的快速或清晰层级。
 * @param pageNumber 从 1 开始的连续页码。
 * @param contentType 页面图片 MIME，用于选择对象路径扩展名。
 * @returns 不包含 Bucket 的私有对象路径。
 */
function buildPreviewObjectKey(
  input: DocumentPreviewProcessInput,
  variant: ConvertedDocumentPage['variant'],
  pageNumber: number,
  contentType: string,
): string {
  const ext = contentType.split('/')[1] ?? 'webp';
  return [
    'derived/documents',
    input.documentId,
    'versions',
    input.documentVersionId,
    'preview',
    encodeURIComponent(DOCUMENT_PREVIEW_CONVERTER_VERSION),
    input.executionId,
    variant,
    `page-${String(pageNumber).padStart(6, '0')}.${ext}`,
  ].join('/');
}

/**
 * 删除本次执行尚未被数据库行引用的临时页面对象。
 *
 * @param pages 需要尽力删除的私有页面对象摘要。
 * @returns 全部删除请求结束后完成；单个删除失败不覆盖原始任务错误。
 */
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

/**
 * 页面行提交后异步清理被替换的旧集合。
 *
 * @param pages 已不再被数据库行引用的旧对象摘要。
 * @returns 调度后台清理后立即返回；失败只写结构化日志。
 */
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
