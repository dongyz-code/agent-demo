import type { ApiMultAction } from '../../common/index.js';
import type { DocumentAction } from './document.js';
import type { LibraryAction } from './library.js';
import type { FileProcessingAction } from './processing.js';

/**
 * documents 域统一接口集合。
 *
 * 接口键与 `apps/server/src/router/routes/documents` 下的处理文件一一对应，
 * 实体和辅助类型也统一从本目录出口对外暴露。
 */
export type DocumentsAction = ApiMultAction<{
  /** 文档聚合搜索。 */
  'document-search': DocumentAction['search'];
  /** 文档详情与版本历史。 */
  'document-detail': DocumentAction['detail'];
  /** 设置当前展示版本。 */
  'document-version-set-active': DocumentAction['version/set-active'];
  /** 下载当前或指定文档版本。 */
  'document-download': DocumentAction['download'];
  /** 删除整个文档。 */
  'document-remove': DocumentAction['remove'];
  /** 把文档移动到另一个资料库。 */
  'document-move': DocumentAction['move'];
  /** 查询当前或指定版本的页面窗口。 */
  'document-preview-pages': DocumentAction['preview/pages'];
  /** 重试当前或指定版本的预览。 */
  'document-preview-retry': DocumentAction['preview/retry'];
  /** 将通用文件句柄绑定为文档版本。 */
  'document-version-create': DocumentAction['version/create'];
  /** 文件处理任务详情。 */
  'processing-detail': FileProcessingAction['detail'];
  /** 取消文件处理任务。 */
  'processing-cancel': FileProcessingAction['cancel'];
  /** 重新执行文件处理任务。 */
  'processing-retry': FileProcessingAction['retry'];
  /** 资料库列表。 */
  'library-list': LibraryAction['library-list'];
  /** 资料库详情。 */
  'library-detail': LibraryAction['library-detail'];
  /** 新建资料库。 */
  'library-create': LibraryAction['library-create'];
  /** 编辑资料库。 */
  'library-update': LibraryAction['library-update'];
  /** 归档资料库。 */
  'library-archive': LibraryAction['library-archive'];
  /** 恢复资料库。 */
  'library-restore': LibraryAction['library-restore'];
  /** 资料库授权列表。 */
  'library-grant-list': LibraryAction['library-grant-list'];
  /** 替换资料库授权。 */
  'library-grant-save': LibraryAction['library-grant-save'];
  /** 搜索可加入授权的用户或用户组。 */
  'library-subject-search': LibraryAction['library-subject-search'];
  /** 当前用户可检索的资料库。 */
  'library-usable-list': LibraryAction['library-usable-list'];
}>;

/** 文档实体与内容类型；旧 `DocumentAction` 路由已下线。 */
export type {
  DocumentStatus,
  DocumentRagStatus,
  DocumentPreviewStatus,
  DocumentPreviewPageVariant,
  DocumentBlockType,
  DocumentVersionInfo,
  DocumentPreviewPageInfo,
  DocumentInfo,
  DocumentDetail,
  DocumentPreviewWindow,
  DocumentParsedBlock,
  DocumentSegment,
  DocumentAction,
  DocumentUploadResult,
} from './document.js';

/** 资料库实体与接口类型。 */
export type * from './library.js';
/** 文件处理任务实体与接口类型。 */
export type * from './processing.js';
