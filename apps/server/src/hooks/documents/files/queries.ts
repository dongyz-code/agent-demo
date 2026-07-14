import { and, eq } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import { createDomainError } from '@/configs/index.js';
import { openStoredObject } from '../storage/index.js';

import type { StoredFileInfo } from '@repo/types';
import type { ReadableStoredFile } from './types.js';

/**
 * 查询调用者可访问的通用文件数据库行。
 *
 * 当前通用 route 仅允许创建人访问；业务模块通过自己的权限校验后调用公共读取接口。
 */
export async function getOwnedFileRow(fileId: string, userId: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(
      and(
        eq(schema.files.file_id, fileId),
        eq(schema.files.create_user_id, userId),
      ),
    )
    .limit(1);
  if (!file || file.status === 'deleted') {
    throw createDomainError(
      'UPLOAD_SESSION_NOT_FOUND',
      '文件不存在',
      '相关文件不存在',
    );
  }
  return file;
}

/** 按 id 查询文件行；不存在或已逻辑删除时抛 not-found。 */
export async function getFileRow(fileId: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.file_id, fileId))
    .limit(1);
  if (!file || file.status === 'deleted') {
    throw createDomainError(
      'UPLOAD_SESSION_NOT_FOUND',
      '文件不存在',
      '相关文件不存在',
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

/**
 * 为文档等业务模块返回文件描述和可重复打开的流工厂。
 *
 * @param fileId 通用文件标识。
 */
export async function getReadableFile(
  fileId: string,
): Promise<ReadableStoredFile> {
  const file = await getFileRow(fileId);
  if (file.status !== 'verified') {
    throw createDomainError(
      'UPLOAD_FILE_REJECTED',
      '只有验证成功的文件可以被业务读取',
      '数据异常',
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
