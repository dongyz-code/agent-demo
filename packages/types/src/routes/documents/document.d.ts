import type { ApiMultAction } from '../../common/index.js';
import type { LibraryRole } from './library.js';

/** 文档生命周期状态；预览与 RAG 使用各自独立状态。 */
export type DocumentStatus = 'active' | 'deleted';

/** 文档版本索引状态。表示处理进度，不表示阅读权限。 */
export type DocumentRagStatus = 'pending' | 'processing' | 'ready' | 'failed';

/** 文档版本页面预览状态。 */
export type DocumentPreviewStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';

/** 页面图片层级；快速层用于占位，清晰层用于常规阅读。 */
export type DocumentPreviewPageVariant = 'quick' | 'clear';

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
  /** 当前已完整发布层级的总页数；尚无可用页面时为 0。 */
  previewPageCount: number;
  /** 最近一次预览失败的安全错误摘要。 */
  previewError: string | null;
  /** 该版本的索引状态。 */
  ragStatus: DocumentRagStatus;
  /** 最近一次索引失败的安全错误摘要。 */
  ragError: string | null;
  /** 版本创建时间。 */
  createdAt: Date;
}

/** 文档页面的安全访问描述。 */
export interface DocumentPreviewPageInfo {
  /** 实际所属文档版本。 */
  documentVersionId: string;
  /** 从 1 开始的页码。 */
  pageNumber: number;
  /** 当前地址对应的快速或清晰页面层级。 */
  variant: DocumentPreviewPageVariant;
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
  /** 所属资料库。 */
  libraryId: string;
  /** 所属资料库名称。 */
  libraryName: string;
  /** 当前用户在该库的身份。 */
  myRole: LibraryRole;
  /** 当前可检索版本。尚未成功索引时为空。 */
  indexedVersionId: string | null;
  /** 当前展示版本。 */
  activeVersion: DocumentVersionInfo;
  /** 文档包含的版本数量。 */
  versionCount: number;
  /** 当前版本第一页封面；预览未就绪时为空。 */
  cover: DocumentPreviewPageInfo | null;
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
  /** 当前响应页面层级的总页数；尚无可用页面时为 0。 */
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

/** 已上传文件完成文档版本绑定后的业务结果。 */
export interface DocumentUploadResult {
  /** 新建或新增版本所属的文档。 */
  documentId: string;
  /** 新建或复用的文档版本。 */
  documentVersionId: string;
  /** 文档内递增版本号。 */
  version: number;
  /** 本次请求是否创建了新版本。 */
  created: boolean;
}

/** 文档中心公共接口集合。 */
export type DocumentAction = ApiMultAction<{
  /** 将已上传的文档源文件幂等绑定为新文档或新版本。 */
  'version/create': {
    body: {
      /** upload 返回的已验证文档源文件句柄。 */
      key: string;
      /** 已有文档标识；为空时创建文档。 */
      documentId?: string;
      /** 新建文档所属资料库。创建文档时必填。 */
      libraryId?: string;
    };
    resp: DocumentUploadResult;
  };
  search: {
    body: {
      /** 文档名称或当前文件名关键词。 */
      search?: string;
      /** 文档生命周期状态筛选。 */
      status?: DocumentStatus[];
      /** 当前版本预览状态筛选。 */
      previewStatus?: DocumentPreviewStatus[];
      /** 只看某个资料库。不传则返回当前用户能阅读的全部文档。 */
      libraryId?: string;
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
  move: {
    body: { documentId: string; libraryId: string };
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

