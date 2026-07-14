import { and, eq } from 'drizzle-orm';

import { createDomainError, logger } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { deleteStoredObject } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-remove',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.delete'),
  handler: async ({ body, __token }) => {
    const [file] = await db
      .select()
      .from(schema.files)
      .where(
        and(
          eq(schema.files.file_id, body.fileId),
          eq(schema.files.create_user_id, __token.user_id),
        ),
      )
      .limit(1);
    if (!file || file.status === 'deleted') {
      return 'ok';
    }
    const [reference] = await db
      .select({ id: schema.file_references.reference_id })
      .from(schema.file_references)
      .where(eq(schema.file_references.file_id, body.fileId))
      .limit(1);
    if (reference) {
      throw createDomainError(
        'UPLOAD_FILE_IN_USE',
        '文件仍被业务引用',
        '数据异常',
      );
    }

    await db
      .update(schema.files)
      .set({
        status: 'deleting',
        deleted_timestamp: new Date(),
        last_update_user_id: __token.user_id,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.files.file_id, body.fileId));
    scheduleFileDeletion(body.fileId, __token.user_id);
    return 'ok';
  },
});

/** 异步执行对象删除；失败时保留 deleting 状态供清理任务重试。 */
function scheduleFileDeletion(fileId: string, operator: string) {
  queueMicrotask(() => {
    deleteFileObjects(fileId, operator).catch((error) => {
      logger.error(
        { event: 'upload.file.delete.failed', fileId, err: error },
        '文件物理删除失败，等待清理任务重试',
      );
    });
  });
}

/** 删除处于 deleting 状态且仍无有效引用的原对象与派生对象。 */
async function deleteFileObjects(fileId: string, operator: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(
      and(
        eq(schema.files.file_id, fileId),
        eq(schema.files.status, 'deleting'),
      ),
    )
    .limit(1);
  if (!file) {
    return;
  }
  const [reference] = await db
    .select({ id: schema.file_references.reference_id })
    .from(schema.file_references)
    .where(eq(schema.file_references.file_id, fileId))
    .limit(1);
  if (reference) {
    await db
      .update(schema.files)
      .set({
        status: 'verified',
        deleted_timestamp: null,
        last_update_user_id: operator,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.files.file_id, fileId));
    return;
  }
  const variants = await db
    .select()
    .from(schema.file_variants)
    .where(eq(schema.file_variants.source_file_id, fileId));
  await Promise.all([
    deleteStoredObject({ bucket: file.bucket, objectKey: file.object_key }),
    ...variants
      .filter((variant) => variant.bucket && variant.object_key)
      .map((variant) =>
        deleteStoredObject({
          bucket: variant.bucket!,
          objectKey: variant.object_key!,
        }),
      ),
  ]);
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.file_variants)
      .where(eq(schema.file_variants.source_file_id, fileId));
    await tx
      .update(schema.files)
      .set({
        status: 'deleted',
        last_update_user_id: operator,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.files.file_id, fileId));
  });
}

export default api;
