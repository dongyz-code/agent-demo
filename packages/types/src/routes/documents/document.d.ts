import type { ApiMultAction } from '../../common/index.js';
import type {
  RagDatasetDocumentStatus,
  RagDatasetDocumentSummary,
} from './dataset.js';

/** 文档生命周期状态；预览与 RAG 使用各自独立状态。 */
export type DocumentStatus = 'active' | 'deleted';

/** 文档版本页面预览状态。 */
export type DocumentPreviewStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';

/** 解析器统一输出块类型。 */
export type DocumentBlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'code'
  | 'image';

/** 文档版本及其内部源文件的公共摘要，不暴露 fileId 和对象位置。 */
export interface DocumentVersionInfo {
  /** 文档版本标识。 */
  documentVersionId: string;
  /** 文档内从 1 开始递增的版本号。 */
  version: number;
  /** 用户上传时的源文件名。 */
  filename: string;
  /** 规范化扩展名，不包含点。 */
  extension: string;
  /** 服务端确认的可信 MIME。 */
  contentType: string;
  /** 源文件字节数。 */
  size: number;
  /** 页面预览处理状态。 */
  previewStatus: DocumentPreviewStatus;
  /** ready 页面集合的总页数。 */
  previewPageCount: number;
  /** 最近一次预览失败的安全错误摘要。 */
  previewError: string | null;
  /** 当前页面集合使用的转换器组合版本。 */
  previewConverterVersion: string | null;
  /** 版本创建时间。 */
  createdAt: Date;
}

/** 文档页面的安全访问描述。 */
export interface DocumentPreviewPageInfo {
  /** 实际所属文档版本。 */
  documentVersionId: string;
  /** 从 1 开始的页码。 */
  pageNumber: number;
  /** 页面图片像素宽度。 */
  width: number;
  /** 页面图片像素高度。 */
  height: number;
  /** 页面图片可信 MIME。 */
  contentType: string;
  /** 页面图片字节数。 */
  size: number;
  /** 短期签名访问地址。 */
  url: string;
  /** 签名地址失效时间。 */
  expiresAt: Date;
}

/** 文档列表使用的聚合摘要。 */
export interface DocumentInfo {
  /** 文档稳定标识。 */
  documentId: string;
  /** 文档显示名称。 */
  name: string;
  /** 文档生命周期状态。 */
  status: DocumentStatus;
  /** 后续版本默认是否进入已关联知识库。 */
  ragEnabled: boolean;
  /** 当前展示版本。 */
  activeVersion: DocumentVersionInfo;
  /** 文档包含的版本数量。 */
  versionCount: number;
  /** 当前版本第一页封面；预览未就绪时为空。 */
  cover: DocumentPreviewPageInfo | null;
  /** 文档关联知识库及其生效版本摘要。 */
  datasets: RagDatasetDocumentSummary[];
  /** 文档创建时间。 */
  createdAt: Date;
}

/** 文档详情，在列表摘要上增加完整版本历史。 */
export interface DocumentDetail extends DocumentInfo {
  /** 按版本号倒序排列的全部版本。 */
  versions: DocumentVersionInfo[];
}

/** 按窗口返回的文档页面集合。 */
export interface DocumentPreviewWindow {
  /** 文档稳定标识。 */
  documentId: string;
  /** 本次实际解析的文档版本。 */
  documentVersionId: string;
  /** 当前版本的预览状态。 */
  status: DocumentPreviewStatus;
  /** ready 页面集合的总页数。 */
  pageCount: number;
  /** 当前窗口的页面列表。 */
  pages: DocumentPreviewPageInfo[];
}

/** 文档解析器统一输出块。 */
export interface DocumentParsedBlock {
  /** 文档版本内稳定块标识。 */
  blockId: string;
  /** 块内容类型。 */
  type: DocumentBlockType;
  /** 清洗前的解析文本。 */
  text: string;
  /** 标题层级路径。 */
  headingPath: string[];
  /** 来源页码。 */
  page: number | null;
  /** 文档内顺序。 */
  position: number;
  /** 类型专属元数据。 */
  metadata: Record<string, unknown>;
}

/** 可供 RAG、摘要和审核等消费者复用的文档 Segment。 */
export interface DocumentSegment {
  /** 确定性 Segment 标识。 */
  segmentId: string;
  /** 父级 Segment 标识。 */
  parentSegmentId: string | null;
  /** Segment 正文。 */
  content: string;
  /** 用于生成向量的结构化文本。 */
  embeddingContent: string;
  /** 内容 SHA-256。 */
  contentHash: string;
  /** 标题层级路径。 */
  headingPath: string[];
  /** 来源页码。 */
  page: number | null;
  /** 文档内顺序。 */
  position: number;
  /** 估算 token 数。 */
  tokenCount: number;
}

/** 文档中心公共接口集合。 */
export type DocumentAction = ApiMultAction<{
  search: {
    body: {
      /** 文档名称或当前文件名关键词。 */
      search?: string;
      /** 文档生命周期状态筛选。 */
      status?: DocumentStatus[];
      /** 当前版本预览状态筛选。 */
      previewStatus?: DocumentPreviewStatus[];
      /** 可选知识库筛选，知识库文档列表复用该条件。 */
      datasetId?: string;
      /** 文档创建时间范围。 */
      createdAt?: (Date | null)[];
      /** 左闭右开的分页范围。 */
      limit?: number[];
      /** 是否返回符合条件的总数。 */
      withCount?: boolean;
    };
    resp: { list: DocumentInfo[]; count: number };
  };
  detail: {
    body: { documentId: string };
    resp: DocumentDetail;
  };
  'version/set-active': {
    body: { documentId: string; documentVersionId: string };
    resp: DocumentDetail;
  };
  download: {
    body: { documentId: string; documentVersionId?: string };
    resp: {
      documentVersionId: string;
      url: string;
      expiresAt: Date;
    };
  };
  remove: {
    body: { documentId: string };
    resp: 'ok';
  };
  'rag-default/update': {
    body: { documentId: string; ragEnabled: boolean };
    resp: DocumentDetail;
  };
  'preview/pages': {
    body: {
      documentId: string;
      documentVersionId?: string;
      /** 从 1 开始的页面窗口起点。 */
      startPage?: number;
      /** 受服务端上限约束的页面数量。 */
      pageSize?: number;
    };
    resp: DocumentPreviewWindow;
  };
  'preview/retry': {
    body: { documentId: string; documentVersionId?: string };
    resp: DocumentPreviewWindow;
  };
}>;

/** 知识库文档关系状态的兼容导出。 */
export type DocumentRagStatus = RagDatasetDocumentStatus;
