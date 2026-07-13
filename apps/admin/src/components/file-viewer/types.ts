import type { FilePreviewDescriptor, StoredFileInfo } from '@/types';

/** 文件查看器加载完成后的聚合状态。 */
export interface FileViewerState {
  /** 通用文件元数据。 */
  file: StoredFileInfo;
  /** 服务端返回的安全预览描述。 */
  preview: FilePreviewDescriptor;
}
