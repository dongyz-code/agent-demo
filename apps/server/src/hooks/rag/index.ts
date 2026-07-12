/**
 * RAG 模块公共出口。
 *
 * 当前层只管理知识库和文档关联；后续索引与检索只能消费文档模块公共 ready 接口。
 */
export type * from './types.js';
export {
  createRagDataset,
  listRagDatasets,
  getRagDataset,
  updateRagDataset,
  disableRagDataset,
} from './datasets/service.js';
export {
  addDocumentToDataset,
  listDatasetDocuments,
  removeDocumentFromDataset,
  countDocumentDatasets,
} from './dataset-documents/service.js';
