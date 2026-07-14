import type { Readable } from 'node:stream';
import type { StoredFileInfo } from '@repo/types';

/** RAG 等业务模块读取文件时使用的稳定描述。 */
export interface ReadableStoredFile extends StoredFileInfo {
  /** 每次调用均重新打开对象流，避免重试复用已消费流。 */
  openStream: () => Promise<Readable>;
}
