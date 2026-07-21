/** documents 域公共出口，仅暴露域外调用方实际使用的用例。 */

// 对象存储与签名
export {
  abortMultipartUpload,
  checkUploadBucket,
  completeMultipartUpload,
  createMultipartUpload,
  deleteStoredObject,
  headStoredObject,
  listMultipartParts,
  openStoredObject,
} from './storage/commands.js';
export {
  presignGetObject,
  presignPutObject,
  presignUploadPart,
} from './storage/presign.js';

// 上传策略、会话与验证
export {
  buildObjectKey,
  calculateMultipartPlan,
  createFileFingerprint,
  normalizeExtension,
  sanitizeUploadFilename,
} from './upload/object-key.js';
export { getUploadPolicy } from './upload/policies.js';
export {
  assertActiveSession,
  canCancelUploadSession,
  getOwnedSession,
  getUploadSessionInfo,
  toUploadSessionInfo,
} from './upload/shared.js';
export {
  calculateSha256Stream,
  detectTrustedContentType,
} from './upload/validators.js';

// 文件、文档与预览
export { listDocumentsByIds } from './files/documents.js';
export {
  getFileRow,
  getOwnedFileRow,
  toStoredFileInfo,
} from './files/queries.js';
export { getPreviewProvider } from './preview/registry.js';

// 知识库
export {
  addDocumentToDataset,
  getDatasetRow,
  getRagDataset,
  listRagDatasets,
  toDatasetInfo,
  updateRagDataset,
} from './knowledge/queries.js';

// 文件处理与任务中心
export {
  createFileProcessingTask,
  getFileProcessingTask,
} from './processing/queries.js';
export { startFileProcessingWorker } from './processing/worker.js';
export {
  enrichFileTaskList,
  findFileProcessingTaskIds,
} from './processing/task-center.js';
