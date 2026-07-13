import type { ApiMultAction } from '../../common/index.js';
import type { DocumentInfo, DocumentStatus } from '../document/index.js';

/** RAG 知识库状态。 */
export type RagDatasetStatus = 'active' | 'disabled';

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
    body: { datasetId: string; documentId: string };
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
    body: { datasetId: string; documentId: string };
    resp: 'ok';
  };
}>;
