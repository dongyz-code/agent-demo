/** 通用文档处理状态。 */
export type DocumentStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'deleted';

/** 文档处理阶段。 */
export type DocumentProcessingStage =
  | 'queued'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'segmenting'
  | 'ready';

/** 文档处理任务状态。 */
export type DocumentProcessingStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled';

/** 解析器统一输出块类型。 */
export type DocumentBlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'code'
  | 'image';

/** 与知识库无关的通用文档信息。 */
export interface DocumentInfo {
  /** 逻辑文档标识。 */
  documentId: string;
  /** 文档显示名称。 */
  name: string;
  /** 当前版本使用的源文件标识。 */
  sourceFileId: string;
  /** 当前文档处理状态。 */
  status: DocumentStatus;
  /** 当前版本号。 */
  version: number;
  /** 创建时间。 */
  createdAt: Date;
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
