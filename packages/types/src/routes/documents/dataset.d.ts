import type { ApiMultAction } from '../../common/index.js';
import type {
  DocumentInfo,
  DocumentSegment,
  DocumentStatus,
} from './document.js';

/** RAG 知识库状态。 */
export type RagDatasetStatus = 'active' | 'disabled';

/** 文档在单个知识库中的 RAG 处理状态。 */
export type RagDatasetDocumentStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';

/** RAG 知识库信息。 */
export interface RagDatasetInfo {
  /** 知识库标识。 */
  datasetId: string;
  /** 知识库名称。 */
  name: string;
  /** 知识库说明。 */
  description: string | null;
  /** 当前状态。 */
  status: RagDatasetStatus;
  /** 创建时间。 */
  createdAt: Date;
}

/** 文档在单个知识库中的版本生效摘要。 */
export interface RagDatasetDocumentSummary {
  /** 知识库标识。 */
  datasetId: string;
  /** 知识库名称。 */
  name: string;
  /** 当前实际参与检索的文档版本。 */
  activeVersionId: string | null;
  /** 等待或正在处理的目标版本。 */
  pendingVersionId: string | null;
  /** 当前关系的 RAG 处理状态。 */
  status: RagDatasetDocumentStatus;
  /** 最近一次处理失败的安全错误摘要。 */
  error: string | null;
}

/** 仅从知识库 activeVersion 读取的可检索 Segment。 */
export interface RagDatasetSegmentInfo extends DocumentSegment {
  /** 当前检索知识库。 */
  datasetId: string;
  /** Segment 所属文档。 */
  documentId: string;
  /** 关系当前实际生效的不可变文档版本。 */
  documentVersionId: string;
  /** 切分规则版本，用于索引元数据和重处理区分。 */
  segmentProfileVersion: string;
}

/** RAG 接口只管理知识库及其文档关联。 */
export type Rag = ApiMultAction<{
  'dataset/create': {
    body: { name: string; description?: string };
    resp: RagDatasetInfo;
  };
  'dataset/list': {
    body: {
      search?: string;
      status?: RagDatasetStatus[];
      limit?: number[];
      withCount?: boolean;
    };
    resp: { list: RagDatasetInfo[]; count: number };
  };
  'dataset/detail': {
    body: { datasetId: string };
    resp: RagDatasetInfo;
  };
  'dataset/update': {
    body: {
      datasetId: string;
      update: Partial<
        Pick<RagDatasetInfo, 'name' | 'description' | 'status'>
      >;
    };
    resp: RagDatasetInfo;
  };
  'dataset/disable': {
    body: { datasetId: string };
    resp: RagDatasetInfo;
  };
  'dataset-document/add': {
    body: { documentId: string; datasetIds: string[] };
    resp: DocumentInfo;
  };
  'dataset-document/list': {
    body: {
      datasetId: string;
      search?: string;
      status?: DocumentStatus[];
      limit?: number[];
      withCount?: boolean;
    };
    resp: { list: DocumentInfo[]; count: number };
  };
  'dataset-document/remove': {
    body: { documentId: string; datasetIds: string[] };
    resp: DocumentInfo;
  };
  'dataset-document/update': {
    body: { documentId: string; datasetIds: string[] };
    resp: DocumentInfo;
  };
}>;
