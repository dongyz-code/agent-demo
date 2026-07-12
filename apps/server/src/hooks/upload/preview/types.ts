import type { FilePreviewDescriptor } from '@repo/types';
import type { UploadActor } from '../types.js';

/** 预览提供器接收的可信文件行。 */
export interface PreviewFile {
  /** 通用文件标识。 */
  fileId: string;
  /** 显示名称。 */
  filename: string;
  /** 服务端可信 MIME。 */
  contentType: string;
  /** 文件字节数。 */
  size: number;
  /** 服务端内容 Hash。 */
  sha256: string;
  /** 私有 Bucket。 */
  bucket: string;
  /** 对象路径。 */
  objectKey: string;
}

/** 通用文件预览提供器。 */
export interface PreviewProvider {
  /** 提供器稳定名称。 */
  name: string;
  /** 提供器版本，参与派生物缓存。 */
  version: string;
  /** 判断当前提供器是否处理该 MIME。 */
  supports: (contentType: string) => boolean;
  /** 生成或返回预览描述。 */
  getPreview: (
    file: PreviewFile,
    actor: UploadActor,
  ) => Promise<FilePreviewDescriptor>;
}
