import { eq } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { documentsConfig } from '../config.js';
import { S3ObjectStorage } from './objects.js';

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
}

/** documents 域文件读取与对象存储的统一能力实现。 */
class DocumentFile extends S3ObjectStorage {
  /**
   * 查询 documents 域内部使用的存储文件行。
   *
   * @param fileId 上传会话或 DocumentVersion 保存的内部文件标识。
   * @returns 源文件数据库行。
   */
  async getStored(fileId: string) {
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
   * 为文档处理返回已验证源文件描述和可重复打开的流工厂。
   *
   * @param fileId DocumentVersion 保存的内部源文件标识。
   * @returns 不暴露对象位置的文件信息与流工厂。
   */
  async getReadableSource(fileId: string): Promise<ReadableDocumentSource> {
    const file = await this.getStored(fileId);
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
        await this.open({
          bucket: file.bucket,
          objectKey: file.object_key,
        }),
    };
  }
}

/** documents 域统一的文件读取与对象存储能力。 */
export const documentFile = new DocumentFile(
  ROOT.storage.s3,
  documentsConfig.upload.presignExpiresSeconds,
);
