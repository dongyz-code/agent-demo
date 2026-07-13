import { and, eq, inArray, isNull, lt } from 'drizzle-orm';

import { getUploadRuntimeConfig, logger } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { createDomainError } from '../errors.js';
import {
  abortMultipartUpload,
  deleteStoredObject,
  listStoredObjectKeys,
} from '../storage/index.js';

import type { UploadActor } from '../upload/index.js';

/** 逻辑删除文件，并将物理删除放入异步执行队列。 */
export async function removeFile(fileId: string, actor: UploadActor) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(
      and(
        eq(schema.files.file_id, fileId),
        eq(schema.files.tenant_id, actor.tenantId),
        eq(schema.files.create_user_id, actor.userId),
      ),
    )
    .limit(1);
  if (!file || file.status === 'deleted') {
    return;
  }
  const [reference] = await db
    .select({ id: schema.file_references.reference_id })
    .from(schema.file_references)
    .where(eq(schema.file_references.file_id, fileId))
    .limit(1);
  if (reference) {
    throw createDomainError(
      'UPLOAD_FILE_IN_USE',
      '文件仍被业务引用',
      'conflict',
    );
  }

  await db
    .update(schema.files)
    .set({
      status: 'deleting',
      deleted_timestamp: new Date(),
      last_update_user_id: actor.userId,
      last_update_timestamp: new Date(),
    })
    .where(eq(schema.files.file_id, fileId));
  scheduleFileDeletion(fileId, actor.userId);
}

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

/** 重试所有遗留 deleting 文件，供定时清理任务调用。 */
export async function cleanupDeletingFiles(operator: string) {
  const files = await db
    .select({ fileId: schema.files.file_id })
    .from(schema.files)
    .where(eq(schema.files.status, 'deleting'));
  for (const file of files) {
    await deleteFileObjects(file.fileId, operator);
  }
  return files.length;
}

/** 终止过期 Multipart 并同步数据库状态。 */
export async function cleanupExpiredUploadSessions(operator: string) {
  const now = new Date();
  const sessions = await db
    .select({ session: schema.file_upload_sessions, file: schema.files })
    .from(schema.file_upload_sessions)
    .innerJoin(
      schema.files,
      eq(schema.files.file_id, schema.file_upload_sessions.file_id),
    )
    .where(
      and(
        inArray(schema.file_upload_sessions.status, [
          'initialized',
          'uploading',
          'completing',
        ]),
        lt(schema.file_upload_sessions.expire_timestamp, now),
      ),
    );
  for (const { session, file } of sessions) {
    if (session.mode === 'multipart' && session.upload_id) {
      await abortMultipartUpload({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id,
      }).catch(() => undefined);
    }
    await db
      .update(schema.file_upload_sessions)
      .set({
        status: 'expired',
        last_update_user_id: operator,
        last_update_timestamp: now,
      })
      .where(eq(schema.file_upload_sessions.session_id, session.session_id));
  }
  return sessions.length;
}

/** 清理超过保留期且没有业务引用的 verified/rejected 文件。 */
export async function cleanupUnboundFiles(operator: string) {
  const config = getUploadRuntimeConfig();
  const cutoff = new Date(
    Date.now() - config.unboundRetentionDays * 24 * 60 * 60 * 1000,
  );
  const candidates = await db
    .select({ file: schema.files })
    .from(schema.files)
    .leftJoin(
      schema.file_references,
      eq(schema.file_references.file_id, schema.files.file_id),
    )
    .where(
      and(
        inArray(schema.files.status, ['verified', 'rejected']),
        lt(schema.files.create_timestamp, cutoff),
        isNull(schema.file_references.reference_id),
      ),
    );
  for (const { file } of candidates) {
    await removeFile(file.file_id, {
      tenantId: file.tenant_id,
      userId: file.create_user_id || operator,
    });
  }
  return candidates.length;
}

/** 只读报告对象存储中没有 files/file_variants 引用的对象。 */
export async function reportOrphanObjectKeys() {
  const config = getUploadRuntimeConfig();
  const [objectKeys, fileRows, variantRows] = await Promise.all([
    listStoredObjectKeys(config.bucket),
    db.select({ objectKey: schema.files.object_key }).from(schema.files),
    db
      .select({ objectKey: schema.file_variants.object_key })
      .from(schema.file_variants),
  ]);
  const referenced = new Set([
    ...fileRows.map((item) => item.objectKey),
    ...variantRows.flatMap((item) => (item.objectKey ? [item.objectKey] : [])),
  ]);
  return objectKeys.filter((key) => !referenced.has(key));
}

/** 清理源 Hash 已变化或长期失败的旧派生预览。 */
export async function cleanupStaleFileVariants() {
  const variants = await db
    .select({ variant: schema.file_variants, file: schema.files })
    .from(schema.file_variants)
    .innerJoin(
      schema.files,
      eq(schema.files.file_id, schema.file_variants.source_file_id),
    );
  const stale = variants.filter(
    ({ variant, file }) =>
      variant.source_hash !== file.sha256 || variant.status === 'failed',
  );
  for (const { variant } of stale) {
    if (variant.bucket && variant.object_key) {
      await deleteStoredObject({
        bucket: variant.bucket,
        objectKey: variant.object_key,
      });
    }
    await db
      .delete(schema.file_variants)
      .where(eq(schema.file_variants.variant_id, variant.variant_id));
  }
  return stale.length;
}
