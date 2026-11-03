import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { lockDocument, requireDocument } from '../access.js';

import type { DbTransaction } from '@/database/index.js';
import type { DocumentPreviewPageVariant } from '@repo/types';

/** 预览状态迁移的文档、不可变版本和审计范围。 */
export interface PreviewVersionInput {
  /** 逻辑文档标识。 */
  documentId: string;
  /** 当前处理的不可变版本。 */
  documentVersionId: string;
  /** 本次状态变更的审计用户。 */
  userId: string;
}

/** 已上传、等待在事务中发布的页面对象摘要。 */
export interface UploadedPreviewPage {
  /** 从 1 开始的连续页码。 */
  pageNumber: number;
  /** 图片像素宽度。 */
  width: number;
  /** 图片像素高度。 */
  height: number;
  /** 图片可信 MIME。 */
  contentType: string;
  /** 图片字节数。 */
  size: number;
  /** upload 返回的已验证页面文件句柄。 */
  key: string;
}

/**
 * 在调用方事务内准备预览，与任务入队一并提交。
 *
 * @param transaction 已持有文档锁的业务事务。
 * @param input 文档版本和审计信息。
 * @returns 状态重置完成后结束，不删除仍可清理的旧页面记录。
 */
export async function preparePreview(
  transaction: DbTransaction,
  input: PreviewVersionInput,
): Promise<void> {
  await transaction
    .update(schemas.document_versions)
    .set({
      preview_status: 'pending',
      preview_page_count: 0,
      preview_error: null,
      preview_converter_version: null,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.document_versions.document_id, input.documentId),
        eq(
          schemas.document_versions.document_version_id,
          input.documentVersionId,
        ),
      ),
    );
}

/**
 * 获取文档锁后再次校验执行权，避免取消或删除后的迟到状态更新。
 *
 * @param input 文档版本和审计信息。
 * @param assertActive 检查当前执行仍有效的回调。
 * @returns 事务内成功标记 processing 后结束。
 */
export async function markPreviewProcessing(
  input: PreviewVersionInput,
  assertActive: () => Promise<void>,
): Promise<void> {
  await db.transaction(async (transaction) => {
    await lockDocument(transaction, input.documentId);
    await assertActive();
    await requireDocument(input.documentId, input.userId, transaction);
    const [updated] = await transaction
      .update(schemas.document_versions)
      .set({
        preview_status: 'processing',
        preview_error: null,
        last_update_user_id: input.userId,
        last_update_timestamp: new Date(),
      })
      .where(
        and(
          eq(schemas.document_versions.document_id, input.documentId),
          eq(
            schemas.document_versions.document_version_id,
            input.documentVersionId,
          ),
        ),
      )
      .returning({ id: schemas.document_versions.document_version_id });
    if (!updated) throw new ROOT_ERROR('文档版本不存在');
  });
}

/**
 * 共用两个层级的页面替换机制，页面记录和可读状态原子提交。
 *
 * @param input 文档版本和审计信息。
 * @param pages 已完整上传、页码连续的单层页面集合。
 * @param variant 本次发布快速或清晰集合。
 * @param converterVersion 生成此集合的转换规则版本。
 * @param assertActive 锁内再次校验当前执行权。
 * @returns 已脱离数据库引用、可以在事务外清理的旧对象。
 */
export async function publishPreviewPages(
  input: PreviewVersionInput,
  pages: UploadedPreviewPage[],
  variant: DocumentPreviewPageVariant,
  converterVersion: string,
  assertActive: () => Promise<void>,
) {
  const table = previewPageTable(variant);
  return await db.transaction(async (transaction) => {
    await lockDocument(transaction, input.documentId);
    await assertActive();
    await requireDocument(input.documentId, input.userId, transaction);
    const where = eq(table.document_version_id, input.documentVersionId);
    const oldPages = await transaction
      .select({
        key: table.file_id,
      })
      .from(table)
      .where(where);
    await transaction.delete(table).where(where);
    await transaction.insert(table).values(
      pages.map((page) => ({
        document_version_id: input.documentVersionId,
        page_number: page.pageNumber,
        width: page.width,
        height: page.height,
        content_type: page.contentType,
        size: page.size,
        file_id: page.key,
      })),
    );
    const state: Partial<typeof schemas.document_versions.$inferInsert> = {
      preview_status: 'processing',
      preview_page_count: pages.length,
      preview_error: null,
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    };
    if (variant === 'clear') {
      state.preview_status = 'ready';
      state.preview_converter_version = converterVersion;
    }
    const [updated] = await transaction
      .update(schemas.document_versions)
      .set(state)
      .where(
        and(
          eq(schemas.document_versions.document_id, input.documentId),
          eq(
            schemas.document_versions.document_version_id,
            input.documentVersionId,
          ),
        ),
      )
      .returning({ id: schemas.document_versions.document_version_id });
    if (!updated) throw new ROOT_ERROR('文档版本不存在');
    return oldPages;
  });
}

/**
 * 只收敛尚未完成的预览，不覆盖已经发布成功的结果。
 *
 * @param transaction 已持有文档锁的业务事务。
 * @param input 本次任务对应的文档版本。
 * @param message 面向用户的安全失败摘要。
 * @returns 失败状态写入完成后结束。
 */
export async function failPreview(
  transaction: DbTransaction,
  input: PreviewVersionInput,
  message: string,
): Promise<void> {
  await transaction
    .update(schemas.document_versions)
    .set({
      preview_status: 'failed',
      preview_error: message.slice(0, 500),
      last_update_user_id: input.userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.document_versions.document_id, input.documentId),
        eq(
          schemas.document_versions.document_version_id,
          input.documentVersionId,
        ),
        inArray(schemas.document_versions.preview_status, [
          'pending',
          'processing',
        ]),
      ),
    );
}

/**
 * 按层级读取有界页面窗口，统一双表的查询规则。
 *
 * @param documentVersionId 已通过权限校验的版本标识。
 * @param startPage 从 1 开始的窗口起点。
 * @param pageSize 已收敛到服务端上限的窗口大小。
 * @param variant 页面所属层级。
 * @returns 按页码升序的页面数据库行。
 */
export async function loadPreviewPageRows(
  documentVersionId: string,
  startPage: number,
  pageSize: number,
  variant: DocumentPreviewPageVariant,
) {
  const table = previewPageTable(variant);
  return await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.document_version_id, documentVersionId),
        gte(table.page_number, startPage),
        lt(table.page_number, startPage + pageSize),
      ),
    )
    .orderBy(asc(table.page_number));
}

/**
 * 将业务层级映射为结构一致的内部页面表。
 *
 * @param variant 由服务端控制的页面层级。
 * @returns 对应层级的 Drizzle 表，不接受请求方传入表名。
 */
function previewPageTable(variant: DocumentPreviewPageVariant) {
  if (variant === 'quick') return schemas.document_preview_quick_pages;
  return schemas.document_preview_pages;
}
