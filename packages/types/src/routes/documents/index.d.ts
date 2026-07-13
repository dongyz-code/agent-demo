import type { ApiMultAction } from '../../common/index.js';
import type { FileAction } from '../file/index.js';
import type { Upload } from '../upload/index.js';
import type { FileProcessingAction } from '../file-processing/index.js';
import type { Rag } from '../rag/index.js';

/**
 * documents 域统一接口集合。
 *
 * 原 `/file/*`、`/upload/*`、`/file-processing/*` 路由收敛到 `/documents/<resource>-<action>`，
 * 实体与辅助类型沿用各子模块定义，统一从本出口对外暴露。
 */
export type DocumentsAction = ApiMultAction<{
  /** 文件上传与处理选项。 */
  'file-processing-options': FileAction['processing-options'];
  /** 文件详情。 */
  'file-detail': FileAction['detail'];
  /** 文件管理列表。 */
  'file-list': FileAction['list'];
  /** 文件预览。 */
  'file-preview': FileAction['preview'];
  /** 文件下载。 */
  'file-download': FileAction['download'];
  /** 文件删除。 */
  'file-remove': FileAction['remove'];
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
  /** 创建文件处理任务。 */
  'processing-create': FileProcessingAction['create'];
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
}>;

// 文档实体与内容类型(原 routes/document,仅保留实体类型,旧 DocumentAction 路由已下线)
export type {
  DocumentStatus,
  DocumentProcessingStage,
  DocumentProcessingStatus,
  DocumentBlockType,
  DocumentInfo,
  DocumentParsedBlock,
  DocumentSegment,
} from '../document/index.js';

// 文件、上传、文件处理任务的实体与辅助类型统一从 documents 出口复用
export type * from '../file/index.js';
export type * from '../upload/index.js';
export type * from '../file-processing/index.js';
export type * from '../rag/index.js';
