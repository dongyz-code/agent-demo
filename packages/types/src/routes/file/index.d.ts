import type { ApiMultAction } from '../../common/index.js';
import type {
  FileVariantStatus,
  FileVariantType,
  StoredFileInfo,
} from '../upload/index.js';

/** 在线查看使用的统一预览模式。 */
export type FilePreviewMode =
  | 'direct'
  | 'generated'
  | 'text'
  | 'pending'
  | 'failed'
  | 'unsupported';

/** 文件预览接口返回的安全描述。 */
export interface FilePreviewDescriptor {
  /** 当前预览模式。 */
  mode: FilePreviewMode;
  /** 派生物状态；直接预览时为空。 */
  status: FileVariantStatus | null;
  /** 浏览器应使用的可信 MIME。 */
  contentType: string | null;
  /** 短期预览 URL。 */
  url: string | null;
  /** 内联文本内容，仅限受控大小的安全文本。 */
  text: string | null;
  /** URL 过期时间。 */
  expiresAt: Date | null;
  /** 当前派生物类型。 */
  variantType: FileVariantType | null;
  /** 无法预览或失败时的可读原因。 */
  reason: string | null;
}

/** 通用文件操作接口集合。 */
export type FileAction = ApiMultAction<{
  detail: {
    body: { fileId: string };
    resp: StoredFileInfo;
  };
  list: {
    body: {
      /** 文件名关键词。 */
      search?: string;
      /** 文件可信状态筛选。 */
      status?: StoredFileInfo['status'][];
      /** 左闭右开的分页范围。 */
      limit?: number[];
      /** 是否返回符合条件的总数。 */
      withCount?: boolean;
    };
    resp: { list: StoredFileInfo[]; count: number };
  };
  preview: {
    body: { fileId: string };
    resp: FilePreviewDescriptor;
  };
  download: {
    body: { fileId: string };
    resp: { url: string; expiresAt: Date };
  };
  remove: {
    body: { fileId: string };
    resp: 'ok';
  };
}>;
