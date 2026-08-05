import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { documentsConfig } from '../config.js';
import { objectStorage } from './objects.js';

import type { Readable } from 'node:stream';
/** 文档处理读取已验证源文件时使用的稳定描述。 */
export interface ReadableDocumentSource {
  /** 文件稳定标识，用于生成确定性解析块。 */
  fileId: string;
  /** 用户上传时提供的文件名。 */
  filename: string;
  /** 服务端验证后的可信 MIME。 */
  contentType: string;
  /** 文件字节数。 */
  size: number;
  /** 每次调用均重新打开对象流，避免重试复用已消费流。 */
  openStream: () => Promise<Readable>;
  /** 为可信外部解析服务签发短期原文件下载地址。 */
  createDownloadUrl: () => Promise<string>;
}

/**
 * 查询文件域内部使用的存储文件行。
 *
 * @param fileId 上传会话或 DocumentVersion 保存的内部文件标识。
 * @returns 源文件数据库行。
 */
export async function getStoredFile(fileId: string) {
  const [file] = await db
    .select()
    .from(schemas.files)
    .where(eq(schemas.files.file_id, fileId))
    .limit(1);
  if (!file) {
    throw new ROOT_ERROR('相关文件不存在');
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
  const file = await getStoredFile(fileId);
  if (file.status !== 'verified' || !file.content_type) {
    throw new ROOT_ERROR('数据异常');
  }
  const contentType = file.content_type;
  return {
    fileId: file.file_id,
    filename: file.filename,
    contentType,
    size: file.size,
    openStream: async () =>
      await objectStorage.open({
        bucket: file.bucket,
        objectKey: file.object_key,
      }),
    createDownloadUrl: async () => {
      const signed = await objectStorage.presignGet({
        bucket: file.bucket,
        objectKey: file.object_key,
        contentType,
        filename: file.filename,
        disposition: 'inline',
        expiresInSeconds:
          documentsConfig.document.textInSourceUrlExpiresSeconds,
      });
      return signed.url;
    },
  };
}
