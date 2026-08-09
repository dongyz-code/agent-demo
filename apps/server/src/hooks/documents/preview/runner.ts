import { eq } from 'drizzle-orm';

import { logger, ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { getStoredFile } from '../file/source.js';
import {
  completeFileProcessingTask,
  runTaskStage,
} from '../tasks/stage.js';
import { objectStorage } from '../file/objects.js';
import {
  DOCUMENT_PREVIEW_CONVERTER_VERSION,
  documentPageConverter,
} from './converter.js';

import type { FileProcessingTaskContext } from '../tasks/stage.js';
import type { ConvertedDocumentPage } from './converter.js';

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

/**
 * 执行预览页面生成、完整发布和任务状态落库。
 *
 * @param context Worker 已校验的文档版本任务上下文。
 * @returns 正常返回时由任务框架自动完成；异常清理临时对象后交由框架处理。
 */
export async function runDocumentPreviewTask(
  context: FileProcessingTaskContext,
): Promise<void> {
  const uploadedPages: UploadedPreviewPage[] = [];
  let published = false;
  try {
    await runTaskStage(context, 'preview-converting', async () => {
      await markPreviewProcessing(context);
      await generateAndUploadPages(context, uploadedPages);
      return uploadedPages;
    });
    const oldPages = await runTaskStage(
      context,
      'preview-publishing',
      async () => await publishPreviewPages(context, uploadedPages),
    );
    published = true;
    await completeFileProcessingTask(context, uploadedPages.length, {
      capability: 'document-preview',
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      pageCount: uploadedPages.length,
      converterVersion: DOCUMENT_PREVIEW_CONVERTER_VERSION,
    });
    deleteOldPagesInBackground(oldPages);
  } catch (error) {
    if (!published) await deleteUploadedPages(uploadedPages);
    throw error;
  }
}

/**
 * 在生成前确认任务和文档生命周期仍允许提交。
 *
 * @param context 当前预览任务领域上下文。
 * @returns 版本进入 processing 后结束。
 */
async function markPreviewProcessing(
  context: FileProcessingTaskContext,
): Promise<void> {
  await context.task.throwIfCanceled();
  const documentWhere = buildWhere((filter) => {
    filter.push(
      eq(schemas.documents.document_id, context.documentId),
      eq(schemas.documents.status, 'active'),
    );
  });
  const versionWhere = buildWhere((filter) => {
    filter.push(
      eq(
        schemas.document_versions.document_version_id,
        context.documentVersionId,
      ),
      eq(schemas.document_versions.document_id, context.documentId),
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
        last_update_user_id: context.userId,
        last_update_timestamp: new Date(),
      })
      .where(versionWhere);
  });
}

/**
 * 逐页转换并上传到本任务独占对象前缀。
 *
 * @param context 当前预览任务领域上下文。
 * @param pages 用于记录待发布临时页面的可变集合。
 * @returns 全部页面转换并上传后结束。
 */
async function generateAndUploadPages(
  context: FileProcessingTaskContext,
  pages: UploadedPreviewPage[],
): Promise<void> {
  const file = await getStoredFile(context.fileId);
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
      await objectStorage.open({
        bucket: file.bucket,
        objectKey: file.object_key,
      }),
  };
  let expectedPage = 1;
  for await (const page of documentPageConverter.convert(source)) {
    await context.task.throwIfCanceled();
    if (page.pageNumber !== expectedPage) {
      throw new ROOT_ERROR('转换页面序号不连续');
    }
    const objectKey = buildPreviewObjectKey(context, page.pageNumber);
    await objectStorage.put({
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
  await context.task.throwIfCanceled();
}

/**
 * 在同一事务中替换页面行并把版本标记为 ready。
 *
 * @param context 当前预览任务领域上下文。
 * @param pages 已上传且等待发布的页面集合。
 * @returns 被新页面替换的旧对象位置。
 */
async function publishPreviewPages(
  context: FileProcessingTaskContext,
  pages: UploadedPreviewPage[],
) {
  await context.task.throwIfCanceled();
  const documentWhere = buildWhere((filter) => {
    filter.push(
      eq(schemas.documents.document_id, context.documentId),
      eq(schemas.documents.status, 'active'),
    );
  });
  const versionWhere = buildWhere((filter) => {
    filter.push(
      eq(
        schemas.document_versions.document_version_id,
        context.documentVersionId,
      ),
      eq(schemas.document_versions.document_id, context.documentId),
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
          context.documentVersionId,
        ),
      );
    await tx
      .delete(schemas.document_preview_pages)
      .where(
        eq(
          schemas.document_preview_pages.document_version_id,
          context.documentVersionId,
        ),
      );
    await tx.insert(schemas.document_preview_pages).values(
      pages.map((page) => ({
        document_version_id: context.documentVersionId,
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
        last_update_user_id: context.userId,
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
  context: FileProcessingTaskContext,
  pageNumber: number,
): string {
  return [
    'derived/documents',
    context.documentId,
    'versions',
    context.documentVersionId,
    'preview',
    encodeURIComponent(DOCUMENT_PREVIEW_CONVERTER_VERSION),
    context.task.taskId,
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
        await objectStorage.remove({
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
          await objectStorage.remove({
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
