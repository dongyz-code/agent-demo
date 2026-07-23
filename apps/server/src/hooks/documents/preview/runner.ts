import { and, eq } from 'drizzle-orm';

import { logger, ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { getDocumentSourceFile } from '../storage/source.js';
import { getErrorCode } from '../tasks/errors.js';
import {
  FileProcessingLeaseLostError,
  completeTask,
  failTask,
  isTaskCanceled,
  runTaskStage,
} from '../tasks/runtime.js';
import {
  deleteStoredObject,
  openStoredObject,
  putStoredObject,
} from '../storage/objects.js';
import { DOCUMENT_PREVIEW_CONVERTER_VERSION, documentPageConverter } from './converter.js';

import type {
  FileProcessingTaskContext,
  FileProcessingTaskLease,
} from '../tasks/runtime.js';

/** 已上传但尚未发布的页面对象。 */
interface UploadedPreviewPage {
  /** 从 1 开始的连续页码。 */
  pageNumber: number;
  /** 页面图片像素宽度。 */
  width: number;
  /** 页面图片像素高度。 */
  height: number;
  /** 页面图片可信 MIME。 */
  contentType: 'image/webp';
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
 * @param context worker 已校验的文档版本任务上下文。
 * @param lease 当前任务 lease，失效后不得发布页面。
 * @returns 任务完成、失败、取消或失去 lease 后结束。
 */
export async function runDocumentPreviewTask(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
): Promise<void> {
  const uploadedPages: UploadedPreviewPage[] = [];
  let published = false;
  try {
    await runTaskStage(
      context,
      lease,
      'preview-converting',
      async () => {
        await markPreviewProcessing(context, lease);
        await generateAndUploadPages(context, lease, uploadedPages);
        return uploadedPages;
      },
    );
    const oldPages = await runTaskStage(
      context,
      lease,
      'preview-publishing',
      async () => await publishPreviewPages(context, lease, uploadedPages),
    );
    published = true;
    await completeTask(context, lease, uploadedPages.length, {
      capability: 'document-preview',
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      pageCount: uploadedPages.length,
      converterVersion: DOCUMENT_PREVIEW_CONVERTER_VERSION,
    });
    deleteOldPagesInBackground(oldPages);
  } catch (error) {
    if (!published) await deleteUploadedPages(uploadedPages);
    if (
      error instanceof FileProcessingLeaseLostError ||
      (await isTaskCanceled(context.taskId))
    ) {
      return;
    }
    const message = toSafePreviewError(error);
    const failed = await failTask(
      context.taskId,
      lease.leaseId,
      getErrorCode(message, 'DOCUMENT_PREVIEW_FAILED'),
      message,
    );
    if (!failed) return;
    await db
      .update(schema.document_versions)
      .set({
        preview_status: 'failed',
        preview_page_count: 0,
        preview_error: message,
        last_update_user_id: context.userId,
        last_update_timestamp: new Date(),
      })
      .where(
        eq(
          schema.document_versions.document_version_id,
          context.documentVersionId,
        ),
      );
    throw error;
  }
}

/** 在生成前确认任务 lease 和文档生命周期仍允许提交。 */
async function markPreviewProcessing(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
): Promise<void> {
  await lease.assertActive();
  await db.transaction(async (tx) => {
    const [owned] = await tx
      .update(schema.tasks)
      .set({ last_update_timestamp: new Date() })
      .where(
        and(
          eq(schema.tasks.task_id, context.taskId),
          eq(schema.tasks.status, 'pending'),
          eq(schema.tasks.pending_uuid, lease.leaseId),
        ),
      )
      .returning({ taskId: schema.tasks.task_id });
    if (!owned) throw new FileProcessingLeaseLostError();
    const [document] = await tx
      .select({ id: schema.documents.document_id })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.document_id, context.documentId),
          eq(schema.documents.status, 'active'),
        ),
      )
      .limit(1);
    if (!document) {
      throw new Error(
        'DOCUMENT_PREVIEW_DOCUMENT_DELETED: 文档已删除，不能生成预览',
      );
    }
    await tx
      .update(schema.document_versions)
      .set({
        preview_status: 'processing',
        preview_error: null,
        last_update_user_id: context.userId,
        last_update_timestamp: new Date(),
      })
      .where(
        and(
          eq(
            schema.document_versions.document_version_id,
            context.documentVersionId,
          ),
          eq(schema.document_versions.document_id, context.documentId),
        ),
      );
  });
}

/** 逐页转换并上传到本任务独占对象前缀。 */
async function generateAndUploadPages(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
  pages: UploadedPreviewPage[],
): Promise<void> {
  const file = await getDocumentSourceFile(context.fileId);
  if (file.status !== 'verified') {
    throw new Error(
      'DOCUMENT_PREVIEW_SOURCE_INVALID: 只有验证成功的文件可以生成预览',
    );
  }
  const source = {
    filename: file.filename,
    contentType: file.content_type ?? file.declared_content_type,
    size: file.size,
    bucket: file.bucket,
    objectKey: file.object_key,
    open: async () =>
      await openStoredObject({
        bucket: file.bucket,
        objectKey: file.object_key,
      }),
  };
  let expectedPage = 1;
  for await (const page of documentPageConverter.convert(source)) {
    await lease.assertActive();
    if (page.pageNumber !== expectedPage) {
      throw new Error(
        'DOCUMENT_PREVIEW_PAGE_SEQUENCE_INVALID: 转换页面序号不连续',
      );
    }
    const objectKey = buildPreviewObjectKey(context, page.pageNumber);
    await putStoredObject({
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
    throw new Error(
      'DOCUMENT_PREVIEW_EMPTY: 转换器没有生成任何页面',
    );
  }
  await lease.assertActive();
}

/** 在同一事务中替换页面行并把版本标记为 ready。 */
async function publishPreviewPages(
  context: FileProcessingTaskContext,
  lease: FileProcessingTaskLease,
  pages: UploadedPreviewPage[],
) {
  await lease.assertActive();
  return await db.transaction(async (tx) => {
    const [owned] = await tx
      .update(schema.tasks)
      .set({ last_update_timestamp: new Date() })
      .where(
        and(
          eq(schema.tasks.task_id, context.taskId),
          eq(schema.tasks.status, 'pending'),
          eq(schema.tasks.pending_uuid, lease.leaseId),
        ),
      )
      .returning({ taskId: schema.tasks.task_id });
    if (!owned) throw new FileProcessingLeaseLostError();
    const [document] = await tx
      .select({ id: schema.documents.document_id })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.document_id, context.documentId),
          eq(schema.documents.status, 'active'),
        ),
      )
      .limit(1);
    if (!document) {
      throw new Error(
        'DOCUMENT_PREVIEW_DOCUMENT_DELETED: 文档已删除，不能发布预览',
      );
    }
    const oldPages = await tx
      .select({
        bucket: schema.document_preview_pages.bucket,
        objectKey: schema.document_preview_pages.object_key,
      })
      .from(schema.document_preview_pages)
      .where(
        eq(
          schema.document_preview_pages.document_version_id,
          context.documentVersionId,
        ),
      );
    await tx
      .delete(schema.document_preview_pages)
      .where(
        eq(
          schema.document_preview_pages.document_version_id,
          context.documentVersionId,
        ),
      );
    await tx.insert(schema.document_preview_pages).values(
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
      .update(schema.document_versions)
      .set({
        preview_status: 'ready',
        preview_page_count: pages.length,
        preview_error: null,
        preview_converter_version: DOCUMENT_PREVIEW_CONVERTER_VERSION,
        last_update_user_id: context.userId,
        last_update_timestamp: new Date(),
      })
      .where(
        and(
          eq(
            schema.document_versions.document_version_id,
            context.documentVersionId,
          ),
          eq(schema.document_versions.document_id, context.documentId),
        ),
      )
      .returning({ id: schema.document_versions.document_version_id });
    if (!updated) {
      throw new Error(
        'DOCUMENT_PREVIEW_VERSION_NOT_FOUND: 文档版本不存在',
      );
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
    context.taskId,
    `page-${String(pageNumber).padStart(6, '0')}.webp`,
  ].join('/');
}

/** 发布前失败时删除本任务已经上传的临时页面对象。 */
async function deleteUploadedPages(pages: UploadedPreviewPage[]): Promise<void> {
  await Promise.allSettled(
    pages.map(
      async (page) =>
        await deleteStoredObject({
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
          await deleteStoredObject({
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

/** 将内部异常限制为可安全展示的短错误摘要。 */
function toSafePreviewError(error: unknown): string {
  const message = error instanceof Error ? error.message : '文档预览生成失败';
  return message.slice(0, 500);
}
