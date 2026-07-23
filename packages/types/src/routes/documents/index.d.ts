import type { ApiMultAction } from '../../common/index.js';
import type { DocumentAction } from './document.js';
import type { Rag } from './dataset.js';
import type { FileProcessingAction } from './processing.js';
import type { Upload } from './upload.js';

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
  /** 更新文档默认 RAG 开关。 */
  'document-rag-default-update': DocumentAction['rag-default/update'];
  /** 查询当前或指定版本的页面窗口。 */
  'document-preview-pages': DocumentAction['preview/pages'];
  /** 重试当前或指定版本的预览。 */
  'document-preview-retry': DocumentAction['preview/retry'];
  /** 初始化上传会话。 */
  'upload-init': Upload['init'];
  /** 签名上传分片。 */
  'upload-sign-parts': Upload['sign-parts'];
  /** 查询已上传分片。 */
  'upload-list-parts': Upload['list-parts'];
  /** 完成上传。 */
  'upload-complete': Upload['complete'];
  /** 取消上传。 */
  'upload-abort': Upload['abort'];
  /** 上传会话状态。 */
  'upload-status': Upload['status'];
  /** 上传会话列表。 */
  'upload-list': Upload['list'];
  /** 文件处理任务详情。 */
  'processing-detail': FileProcessingAction['detail'];
  /** 取消文件处理任务。 */
  'processing-cancel': FileProcessingAction['cancel'];
  /** 重新执行文件处理任务。 */
  'processing-retry': FileProcessingAction['retry'];
  /** 新建知识库。 */
  'dataset-create': Rag['dataset/create'];
  /** 知识库列表。 */
  'dataset-list': Rag['dataset/list'];
  /** 知识库详情。 */
  'dataset-detail': Rag['dataset/detail'];
  /** 编辑知识库。 */
  'dataset-update': Rag['dataset/update'];
  /** 停用知识库。 */
  'dataset-disable': Rag['dataset/disable'];
  /** 加入文档到知识库。 */
  'dataset-document-add': Rag['dataset-document/add'];
  /** 知识库文档列表。 */
  'dataset-document-list': Rag['dataset-document/list'];
  /** 从知识库移除文档。 */
  'dataset-document-remove': Rag['dataset-document/remove'];
  /** 替换文档关联的完整知识库集合。 */
  'dataset-document-update': Rag['dataset-document/update'];
}>;

/** 文档实体与内容类型；旧 `DocumentAction` 路由已下线。 */
export type {
  DocumentStatus,
  DocumentPreviewStatus,
  DocumentBlockType,
  DocumentVersionInfo,
  DocumentPreviewPageInfo,
  DocumentInfo,
  DocumentDetail,
  DocumentPreviewWindow,
  DocumentParsedBlock,
  DocumentSegment,
  DocumentAction,
} from './document.js';

/** 知识库实体与接口类型。 */
export type * from './dataset.js';
/** 文件处理任务实体与接口类型。 */
export type * from './processing.js';
/** 上传实体与接口类型。 */
export type * from './upload.js';
