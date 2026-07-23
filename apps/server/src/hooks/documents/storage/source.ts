import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { openStoredObject } from './objects.js';

import type { Readable } from 'node:stream';
import type { StoredFileInfo } from '@repo/types';

/** 文档处理读取已验证源文件时使用的稳定描述。 */
export interface ReadableDocumentSource extends StoredFileInfo {
  /** 每次调用均重新打开对象流，避免重试复用已消费流。 */
  openStream: () => Promise<Readable>;
}

/**
 * 查询文档版本内部使用的源文件行。
 *
 * @param fileId DocumentVersion 保存的内部源文件标识。
 * @returns 尚未删除的源文件数据库行。
 */
export async function getDocumentSourceFile(fileId: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.file_id, fileId))
    .limit(1);
  if (!file || file.status === 'deleted') {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'UPLOAD_SESSION_NOT_FOUND: 文件不存在',
    );
  }
  return file;
}

/**
 * 为 RAG 解析返回已验证源文件描述和可重复打开的流工厂。
 *
 * @param fileId DocumentVersion 保存的内部源文件标识。
 * @returns 不暴露对象位置的文件信息与流工厂。
 */
export async function getReadableDocumentSource(
  fileId: string,
): Promise<ReadableDocumentSource> {
  const file = await getDocumentSourceFile(fileId);
  if (file.status !== 'verified') {
    throw new ROOT_ERROR(
      '数据异常',
      'UPLOAD_FILE_REJECTED: 只有验证成功的文件可以被业务读取',
    );
  }
  return {
    fileId: file.file_id,
    filename: file.filename,
    contentType: file.content_type ?? file.declared_content_type,
    size: file.size,
    sha256: file.sha256,
    status: file.status,
    createdAt: file.create_timestamp,
    openStream: async () =>
      await openStoredObject({
        bucket: file.bucket,
        objectKey: file.object_key,
      }),
  };
}
