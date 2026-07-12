/**
 * 通用文档内容模块公共出口。
 *
 * 本模块只通过上传模块公共接口消费已验证文件，不理解知识库、索引和检索语义。
 */
export type * from './types.js';
export {
  createDocument,
  listDocuments,
  listDocumentsByIds,
  getDocument,
  removeDocument,
  reprocessDocument,
} from './documents/service.js';
export { runDocumentProcessingJob } from './processing/runner.js';
export {
  listDocumentProcessingJobs,
  getDocumentProcessingJob,
  retryDocumentProcessingJob,
  cancelDocumentProcessingJob,
  getReadyDocument,
} from './processing/service.js';
export { listDocumentParsers } from './parsers/registry.js';
export { normalizeDocumentBlocks } from './normalization/normalize.js';
export { createDocumentSegments } from './segmentation/segment.js';
