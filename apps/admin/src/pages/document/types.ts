import type { DocumentInfo, DocumentPreviewStatus } from '@/types';

/** 全局文档与库内文档共用的筛选条件。 */
export interface DocumentSearchForm extends Record<string, unknown> {
  /** 匹配文档名称或当前版本文件名的关键词。 */
  search?: string;
  /** 仅全局列表允许切换资料库，库内列表由资料库上下文固定。 */
  libraryId?: string;
  /** 当前展示版本的页面生成状态。 */
  previewStatus?: DocumentPreviewStatus;
  /** 文档创建时间的起止范围。 */
  createdAt?: (Date | null)[];
}

/** 文档列表行，补充表格需要的字符串索引约束。 */
export type DocumentRow = DocumentInfo & Record<string, unknown>;

/** 移动弹窗需要的最小文档上下文。 */
export interface DocumentMoveTarget {
  /** 需要移动的文档稳定标识。 */
  documentId: string;
  /** 原所属库；移动时跳过本就在目标库的文档。 */
  libraryId: string;
}

/** 当前用户对一份文档的实际操作能力，同时受库内身份和账号权限约束。 */
export interface DocumentCapabilities {
  /** 能否上传新版本、切换当前版本或移动文档。 */
  canUpdate: boolean;
  /** 能否逻辑删除文档及其全部历史版本。 */
  canDelete: boolean;
  /** 能否重新生成文档页面预览。 */
  canProcess: boolean;
}
