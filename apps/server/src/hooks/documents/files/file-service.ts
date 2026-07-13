import { and, desc, eq, ilike, inArray, ne } from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
import { createDomainError } from '../errors.js';
import { sanitizeUploadFilename } from '../upload/index.js';
import { openStoredObject, presignGetObject } from '../storage/index.js';

import type { StoredFileInfo, StoredFileStatus } from '@repo/types';
import type { ReadableStoredFile, UploadActor } from '../upload/index.js';

/**
 * 查询调用者可访问的通用文件数据库行。
 *
 * 当前通用 route 仅允许创建人访问；业务模块通过自己的权限校验后调用公共读取接口。
 */
export async function getOwnedFileRow(fileId: string, actor: UploadActor) {
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
    throw createDomainError(
      'UPLOAD_SESSION_NOT_FOUND',
      '文件不存在',
      'not-found',
    );
  }
  return file;
}

/** 查询业务模块已完成权限判断后的文件行。 */
export async function getFileRowForConsumer(
  fileId: string,
  tenantId: string,
) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(
      and(
        eq(schema.files.file_id, fileId),
        eq(schema.files.tenant_id, tenantId),
      ),
    )
    .limit(1);
  if (!file || file.status === 'deleted') {
    throw createDomainError(
      'UPLOAD_SESSION_NOT_FOUND',
      '文件不存在',
      'not-found',
    );
  }
  return file;
}

/** 将内部文件行转换为不含对象位置的公共信息。 */
export function toStoredFileInfo(
  file: typeof schema.files.$inferSelect,
): StoredFileInfo {
  return {
    fileId: file.file_id,
    filename: file.filename,
    contentType: file.content_type ?? file.declared_content_type,
    size: file.size,
    sha256: file.sha256,
    status: file.status,
    createdAt: file.create_timestamp,
  };
}

/** 返回通用 route 使用的文件信息。 */
export async function getFileInfo(fileId: string, actor: UploadActor) {
  return toStoredFileInfo(await getOwnedFileRow(fileId, actor));
}

/** 查询当前调用者拥有的通用文件列表。 */
export async function listFiles(
  form: {
    /** 文件名关键词。 */
    search?: string;
    /** 文件可信状态筛选。 */
    status?: StoredFileStatus[];
    /** 左闭右开的分页范围。 */
    limit?: number[];
    /** 是否返回总数。 */
    withCount?: boolean;
  },
  actor: UploadActor,
) {
  const [start = 0, end = 20] = form.limit ?? [];
  const where = and(
    eq(schema.files.tenant_id, actor.tenantId),
    eq(schema.files.create_user_id, actor.userId),
    ne(schema.files.status, 'deleted'),
    form.search?.trim()
      ? ilike(schema.files.filename, `%${form.search.trim()}%`)
      : undefined,
    form.status?.length ? inArray(schema.files.status, form.status) : undefined,
  );
  const [rows, count] = await Promise.all([
    db
      .select()
      .from(schema.files)
      .where(where)
      .orderBy(desc(schema.files.create_timestamp))
      .offset(start)
      .limit(Math.max(0, end - start)),
    form.withCount ? countRows(schema.files, where) : Promise.resolve(0),
  ]);
  return { list: rows.map(toStoredFileInfo), count };
}

/**
 * 为文档等业务模块返回文件描述和可重复打开的流工厂。
 *
 * @param fileId 通用文件标识。
 * @param tenantId 已由业务模块确认的租户。
 */
export async function getReadableFile(
  fileId: string,
  tenantId: string,
): Promise<ReadableStoredFile> {
  const file = await getFileRowForConsumer(fileId, tenantId);
  if (file.status !== 'verified') {
    throw createDomainError(
      'UPLOAD_FILE_REJECTED',
      '只有验证成功的文件可以被业务读取',
      'conflict',
    );
  }
  return {
    ...toStoredFileInfo(file),
    openStream: async () =>
      await openStoredObject({
        bucket: file.bucket,
        objectKey: file.object_key,
      }),
  };
}

/** 为授权用户签发附件下载地址。 */
export async function createFileDownload(
  fileId: string,
  actor: UploadActor,
) {
  const file = await getOwnedFileRow(fileId, actor);
  if (file.status !== 'verified') {
    throw createDomainError(
      'UPLOAD_FILE_REJECTED',
      '文件尚未通过验证',
      'conflict',
    );
  }
  return await presignGetObject({
    bucket: file.bucket,
    objectKey: file.object_key,
    contentType: file.content_type ?? 'application/octet-stream',
    filename: sanitizeUploadFilename(file.filename),
    disposition: 'attachment',
  });
}
