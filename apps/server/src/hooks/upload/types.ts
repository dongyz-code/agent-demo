import type { Readable } from 'node:stream';
import type { FilePurpose, UploadedFile } from '@repo/types';
import type { db, schemas } from '@/database/index.js';

/** 文件查询可使用默认数据库或业务事务。 */
export type FileReader = Pick<typeof db, 'select'>;

/** upload 内部文件记录，不从模块入口导出。 */
export type StoredFile = typeof schemas.files.$inferSelect;

/** 已验证文件与可重复打开的源流，供解析与转换复用。 */
export interface ReadableFileSource extends UploadedFile {
  /** 每次创建新流，避免重试使用已经消费的流。 */
  openStream: () => Promise<Readable>;
}

/** 可信服务端生成文件或转发收到的上传内容时使用的参数。 */
export interface PutFileInput {
  /** 原始显示文件名，upload 会清洗。 */
  filename: string;
  /** 声明 MIME，仍需根据内容验证。 */
  contentType: string;
  /** 文件内容；流在用途大小上限内收集，禁止无界缓存。 */
  content: Buffer | Uint8Array | Readable;
  /** 文件用途，不接受客户端自定义存储位置。 */
  purpose: FilePurpose;
}

/** 已授权业务申请短期访问地址时使用的选项。 */
export interface FileUrlOptions {
  /** 响应下载文件名；为空时使用保存的文件名。 */
  filename?: string;
  /** 以附件下载或浏览器内联显示，默认附件。 */
  disposition?: 'inline' | 'attachment';
  /** 有效秒数，不得超过模块配置的最大签名时间。 */
  expiresInSeconds?: number;
}
